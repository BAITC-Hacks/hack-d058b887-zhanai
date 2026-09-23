import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { RefreshCw, ShieldAlert, X } from 'lucide-react'
import { API_MODE, api } from './api'
import type { ActiveEvent, Catalog, Decision, DistrictId, ExplainResponse, ImproveResponse, IndicatorValues } from './api'
import { DATASET } from './data/dataset'
import { planCost } from './lib/availability'
import { usePlan } from './state/usePlan'
import { planKey, scoreResult, useSimulation, type PlanStatus } from './state/useSimulation'
import { Header } from './components/Header'
import { MobileScoreBar } from './components/MobileScoreBar'
import { Catalog as CatalogPanel } from './components/catalog/Catalog'
import { CityMap } from './components/city/CityMap'
import { DistrictDetail } from './components/city/DistrictDetail'
import { Portfolio } from './components/portfolio/Portfolio'
import { ResultPanel } from './components/result/ResultPanel'
import { AiPanel, type AiStaleReason, type AiStatus } from './components/result/AiPanel'
import { AgentPanel } from './components/result/AgentPanel'
import { ImproveCard } from './components/result/ImproveCard'
import { EventCard } from './components/result/EventCard'
import { LeaderboardDrawer } from './components/LeaderboardDrawer'
import { Button } from './components/ui'

export type { PlanStatus }

const scrollBehavior = (): ScrollBehavior =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>(DATASET)
  const plan = usePlan()
  const [event, setEvent] = useState<ActiveEvent | null>(null)
  const [eventLoading, setEventLoading] = useState(false)
  const eventId = event?.id ?? null
  const sim = useSimulation(plan.decisions, eventId)
  const need = catalog.rules.decisions
  const count = plan.decisions.length

  useEffect(() => {
    api.catalog().then(setCatalog).catch(() => { /* остаёмся на встроенном каталоге */ })
  }, [])

  /** Ключи текущего плана: по ним сверяем, к чему относятся ответы сервера. */
  const currentKey = useMemo(() => planKey(plan.decisions, eventId), [plan.decisions, eventId])
  const decisionsKey = useMemo(() => planKey(plan.decisions, null), [plan.decisions])

  const budget = event?.budget ?? catalog.rules.budget
  // Стоимость считаем по ценам каталога для текущего плана: ответ сервера во
  // время пересчёта относится к прежнему плану. Допустимость всё равно проверяет сервер.
  const cost = useMemo(() => planCost(catalog, plan.decisions), [catalog, plan.decisions])
  const remainingBudget = budget - cost

  const status: PlanStatus = useMemo(() => {
    if (count === 0) return 'empty'
    const s = sim.last
    if (!s) return 'draft'
    const onlyCount = !s.valid && s.errors.every((e) => e.code === 'EXACTLY_FIVE_REQUIRED')
    if (!sim.isCurrent) {
      // Ответ относится к прежнему плану или событию. Бюджет проверяем сами — это
      // правило видно без сервера, и Score перерасходного плана не мелькнёт даже на миг.
      if (cost > budget) return 'invalid'
      // Число решений изменилось: до ответа сервера не объявляем план допустимым.
      if (s.decisionCount !== count) return s.valid || onlyCount ? 'draft' : 'invalid'
    }
    if (s.valid) return 'valid'
    return onlyCount && count < need ? 'draft' : 'invalid'
  }, [count, sim.last, sim.isCurrent, need, cost, budget])

  /** План допустим и сервер пересчитал именно его: можно анализировать, скачивать, записывать. */
  const ready = status === 'valid' && sim.isCurrent
  /** Официальный результат — только `result` текущего расчёта. */
  const official = ready ? (sim.data?.result ?? null) : null

  // Карта и портфель показывают последствия и для незаконченного плана (preview).
  // Score, лидерборд и AI берут только официальный `result`.
  const shown = count > 0 ? (sim.last?.result ?? sim.last?.preview ?? null) : null

  const currentValues = useMemo(() => {
    const src = shown
      ? shown.districts.map((d) => [d.districtId, d.afterIndicators] as const)
      : (sim.last?.baseline.districts.map((d) => [d.districtId, d.indicators] as const) ?? catalog.districts.map((d) => [d.id, d.indicators] as const))
    return Object.fromEntries(src) as Record<DistrictId, IndicatorValues>
  }, [shown, sim.last, catalog.districts])

  // ---- Улучшение и процентиль: считаем автоматически для допустимого плана
  const [improve, setImprove] = useState<{ key: string | null; data: ImproveResponse | null; loading: boolean }>({ key: null, data: null, loading: false })
  const improveRequest = useRef(0)
  useEffect(() => {
    if (!sim.isCurrent) return // ждём расчёт текущего плана
    if (status !== 'valid') {
      improveRequest.current++
      setImprove({ key: null, data: null, loading: false })
      return
    }
    const id = ++improveRequest.current
    const key = currentKey
    setImprove((s) => ({ ...s, loading: true }))
    const t = setTimeout(() => {
      api.improve(plan.decisions, eventId)
        .then((data) => { if (id === improveRequest.current) setImprove({ key, data, loading: false }) })
        .catch(() => { if (id === improveRequest.current) setImprove({ key, data: null, loading: false }) })
    }, 200)
    return () => clearTimeout(t)
  }, [sim.isCurrent, status, plan.decisions, eventId, currentKey])
  /** Ответ /improve только для текущего плана и события. */
  const improveFresh = improve.key === currentKey ? improve.data : null
  const improvePending = !ready || improve.loading || improve.key !== currentKey

  // ---- AI-анализ: результат привязан к плану И событию -------------------
  const [ai, setAi] = useState<{ status: AiStatus; data: ExplainResponse | null; error: string | null; plan: string | null; eventId: string | null }>({
    status: 'idle', data: null, error: null, plan: null, eventId: null,
  })
  const aiRequest = useRef(0)
  const runAnalysis = useCallback(() => {
    if (!ready) return
    const id = ++aiRequest.current
    const tag = { plan: decisionsKey, eventId }
    setAi((s) => ({ ...s, ...tag, status: 'loading', error: null }))
    api.explain(plan.decisions, eventId)
      .then((data) => { if (id === aiRequest.current) setAi({ ...tag, status: 'ready', data, error: null }) })
      .catch((e: unknown) => { if (id === aiRequest.current) setAi((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : null })) })
  }, [ready, decisionsKey, plan.decisions, eventId])
  const aiPlanChanged = ai.plan !== decisionsKey
  const aiEventChanged = ai.eventId !== eventId
  const aiStatus: AiStatus =
    count === 0 ? 'idle' : ai.status === 'ready' && (aiPlanChanged || aiEventChanged) ? 'stale' : ai.status
  const aiStaleReason: AiStaleReason = aiPlanChanged && aiEventChanged ? 'both' : aiEventChanged ? 'event' : 'plan'

  /** Кнопка в шапке: запускаем анализ и, если панель вне экрана (телефон), прокручиваем к ней. */
  const analyzeFromHeader = () => {
    runAnalysis()
    const el = document.getElementById('ai-panel')
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 0 || top > window.innerHeight - 160) el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }

  // ---- Событие -----------------------------------------------------------
  const drawEvent = async () => {
    setEventLoading(true)
    try { setEvent(await api.drawEvent(eventId)) } finally { setEventLoading(false) }
  }

  // ---- Презентация: только допустимый план и свежий анализ --------------
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<{ key: string; message: string } | null>(null)
  const canDownload = ready && aiStatus === 'ready'
  const download = async () => {
    if (!canDownload || downloading) return
    const key = currentKey
    setDownloading(true)
    setDownloadError(null)
    try {
      const md = await api.presentation(plan.decisions, eventId)
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'akim-plan.md'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setDownloadError({ key, message: e instanceof Error ? e.message : 'сервер не ответил' })
    } finally {
      setDownloading(false)
    }
  }

  // ---- Панели ------------------------------------------------------------
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictId | null>(null)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  // Показатели района открываются под картой, без затемнения страницы.
  const openDistrict = (id: DistrictId) => setSelectedDistrict(id)
  const onMapSelect = (id: DistrictId) => setSelectedDistrict((cur) => (cur === id ? null : id))

  const applyPreset = (id: string) => {
    const p = catalog.presets.find((x) => x.id === id)
    if (p) plan.replace(p.decisions)
  }

  const errorMeasureIds = useMemo(() => new Set(sim.last?.errors.flatMap((e) => e.measureIds) ?? []), [sim.last])
  const districtsForMap = shown?.districts ?? sim.last?.baseline.districts.map((d) => ({ districtId: d.districtId, beforeScore: d.score, afterScore: d.score, beforeIndicators: d.indicators, afterIndicators: d.indicators, criticalBefore: [], criticalAfter: [] })) ?? []
  const selectedResult = selectedDistrict ? districtsForMap.find((d) => d.districtId === selectedDistrict) ?? null : null
  const showAfter = count > 0

  // Плашка Score для узких экранов: то же правило, что в карточке результата.
  const barResult = count > 0 ? scoreResult(sim.last, status) : null
  const barScore = status === 'invalid' ? null : (barResult?.score ?? sim.last?.baseline.score ?? null)

  return (
    <div className="min-h-screen">
      <Header
        catalog={catalog}
        decisions={plan.decisions}
        cost={cost}
        budget={budget}
        canAnalyze={ready}
        apiMode={API_MODE}
        onPreset={applyPreset}
        onReset={plan.clear}
        onAnalyze={analyzeFromHeader}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
      />
      <MobileScoreBar
        status={status}
        score={barScore}
        delta={barResult?.delta ?? null}
        pending={!sim.isCurrent}
        count={count}
        need={need}
        cost={cost}
        budget={budget}
      />

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 px-4 py-5 md:px-6 xl:grid-cols-[320px_minmax(0,1fr)_360px] xl:items-start">
        {sim.error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card bg-critical-soft px-4 py-3 text-[13px] leading-snug text-[#7a1f1f] ring-1 ring-critical/25 ring-inset xl:col-span-3"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <b className="font-semibold">Не удалось пересчитать план.</b> {sim.error.replace(/\.$/, '')}.
                {sim.last && ' На экране — числа прошлого расчёта; анализ, презентация и лидерборд недоступны до пересчёта.'}
              </span>
            </div>
            <Button size="sm" onClick={sim.retry} disabled={sim.loading}>
              <RefreshCw aria-hidden="true" className={clsx('size-3.5', sim.loading && 'animate-spin')} /> {sim.loading ? 'Пересчитываем…' : 'Повторить'}
            </Button>
          </div>
        )}

        <div className="xl:sticky xl:top-[88px] xl:flex xl:h-[calc(100vh-108px)] xl:flex-col">
          <CatalogPanel
            catalog={catalog}
            decisions={plan.decisions}
            remainingBudget={remainingBudget}
            budget={budget}
            currentValues={currentValues}
            improve={improveFresh}
            onAdd={plan.add}
            onSwap={plan.swap}
          />
        </div>

        <div className="space-y-5">
          <CityMap catalog={catalog} districts={districtsForMap} showAfter={showAfter} provisional={showAfter && status !== 'valid'} selected={selectedDistrict} onSelect={onMapSelect} />
          {selectedResult && (
            <section aria-label="Показатели района" className="card animate-fade-up p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{catalog.districts.find((d) => d.id === selectedResult.districtId)?.name}</h2>
                <Button variant="ghost" size="sm" aria-label="Закрыть показатели района" onClick={() => setSelectedDistrict(null)}><X aria-hidden="true" className="size-4" /></Button>
              </div>
              <DistrictDetail catalog={catalog} district={selectedResult} showAfter={showAfter} />
            </section>
          )}
          <Portfolio
            catalog={catalog}
            decisions={plan.decisions}
            results={shown?.decisions ?? null}
            remainingBudget={remainingBudget}
            errorMeasureIds={errorMeasureIds}
            onRemove={plan.remove}
            onSetDistrict={plan.setDistrict}
            onOpenDistrict={openDistrict}
          />
        </div>

        <div className="space-y-5">
          <ResultPanel
            catalog={catalog}
            sim={sim.last}
            pending={!sim.isCurrent}
            status={status}
            decisions={plan.decisions}
            cost={cost}
            budget={budget}
            improve={improveFresh}
          />
          <div id="ai-panel" className="scroll-mt-16 xl:scroll-mt-[88px]">
            <AiPanel
              catalog={catalog}
              status={aiStatus}
              data={ai.data}
              error={ai.error}
              canRun={ready}
              onRun={runAnalysis}
              onDownload={download}
              downloading={downloading}
              downloadError={downloadError?.key === currentKey ? downloadError.message : null}
              staleReason={aiStaleReason}
              sim={sim.data}
              improve={improveFresh}
              decisions={plan.decisions}
              onApply={plan.replace}
            />
          </div>
          <AgentPanel catalog={catalog} decisions={plan.decisions} eventId={eventId} onApply={plan.replace} />
          {status === 'valid' && (
            <ImproveCard
              catalog={catalog}
              data={improve.data}
              loading={improvePending}
              currentScore={official?.score ?? null}
              onApply={plan.replace}
              currentDecisions={plan.decisions}
            />
          )}
          <EventCard catalog={catalog} event={event} loading={eventLoading} onDraw={drawEvent} onReset={() => setEvent(null)} />
          <p className="px-1 text-[11px] leading-relaxed text-ink-3">
            Данные и эффекты мер условные, из синтетического датасета хакатона. Числа на экране — результат заданной симуляции, а не прогноз для реальной Астаны.
          </p>
        </div>
      </main>

      <LeaderboardDrawer
        open={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        decisions={plan.decisions}
        eventId={eventId}
        canSubmit={ready}
        currentScore={official?.score ?? null}
      />
    </div>
  )
}

export type { Decision }
