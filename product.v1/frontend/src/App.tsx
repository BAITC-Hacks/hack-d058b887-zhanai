import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_MODE, api } from './api'
import type { ActiveEvent, Catalog, Decision, DistrictId, ExplainResponse, ImproveResponse, IndicatorValues } from './api'
import { DATASET } from './data/dataset'
import { usePlan } from './state/usePlan'
import { useSimulation } from './state/useSimulation'
import { Header } from './components/Header'
import { Catalog as CatalogPanel } from './components/catalog/Catalog'
import { CityMap } from './components/city/CityMap'
import { DistrictDetail } from './components/city/DistrictDetail'
import { Portfolio } from './components/portfolio/Portfolio'
import { ResultPanel } from './components/result/ResultPanel'
import { AiPanel, type AiStatus } from './components/result/AiPanel'
import { ImproveCard } from './components/result/ImproveCard'
import { EventCard } from './components/result/EventCard'
import { LeaderboardDrawer } from './components/LeaderboardDrawer'
import { X } from 'lucide-react'
import { Button } from './components/ui'

export type PlanStatus = 'empty' | 'draft' | 'invalid' | 'valid'

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>(DATASET)
  const plan = usePlan()
  const [event, setEvent] = useState<ActiveEvent | null>(null)
  const [eventLoading, setEventLoading] = useState(false)
  const sim = useSimulation(plan.decisions, event?.id ?? null)

  useEffect(() => {
    api.catalog().then(setCatalog).catch(() => { /* остаёмся на встроенном каталоге */ })
  }, [])

  const status: PlanStatus = useMemo(() => {
    if (plan.decisions.length === 0) return 'empty'
    if (!sim.data) return 'draft'
    if (sim.data.valid) return 'valid'
    const onlyCount = sim.data.errors.every((e) => e.code === 'EXACTLY_FIVE_REQUIRED')
    return onlyCount && plan.decisions.length < catalog.rules.decisions ? 'draft' : 'invalid'
  }, [plan.decisions.length, sim.data, catalog.rules.decisions])

  const budget = event?.budget ?? catalog.rules.budget
  const cost = sim.data?.cost ?? plan.decisions.reduce((a, d) => a + (catalog.measures.find((m) => m.id === d.measureId)?.cost ?? 0), 0)
  const shown = sim.data?.result ?? sim.data?.preview ?? null

  const currentValues = useMemo(() => {
    const src = shown && plan.decisions.length > 0 ? shown.districts.map((d) => [d.districtId, d.afterIndicators] as const) : (sim.data?.baseline.districts.map((d) => [d.districtId, d.indicators] as const) ?? catalog.districts.map((d) => [d.id, d.indicators] as const))
    return Object.fromEntries(src) as Record<DistrictId, IndicatorValues>
  }, [shown, sim.data, plan.decisions.length, catalog.districts])

  // ---- AI-анализ ---------------------------------------------------------
  const [ai, setAi] = useState<{ status: AiStatus; data: ExplainResponse | null; error: string | null; version: number }>({ status: 'idle', data: null, error: null, version: -1 })
  const aiRequest = useRef(0)
  const runAnalysis = useCallback(() => {
    const id = ++aiRequest.current
    const version = plan.version
    setAi((s) => ({ ...s, status: 'loading', error: null, version }))
    api.explain(plan.decisions, event?.id ?? null)
      .then((data) => { if (id === aiRequest.current) setAi({ status: 'ready', data, error: null, version }) })
      .catch((e: unknown) => { if (id === aiRequest.current) setAi((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : null })) })
  }, [plan.decisions, plan.version, event])
  const aiStatus: AiStatus =
    plan.decisions.length === 0 ? 'idle' : ai.status === 'ready' && ai.version !== plan.version ? 'stale' : ai.status

  // ---- Улучшение и процентиль: считаем автоматически для допустимого плана
  const [improve, setImprove] = useState<{ data: ImproveResponse | null; loading: boolean }>({ data: null, loading: false })
  const improveRequest = useRef(0)
  useEffect(() => {
    if (status !== 'valid') { setImprove({ data: null, loading: false }); return }
    const id = ++improveRequest.current
    setImprove((s) => ({ ...s, loading: true }))
    const t = setTimeout(() => {
      api.improve(plan.decisions, event?.id ?? null)
        .then((data) => { if (id === improveRequest.current) setImprove({ data, loading: false }) })
        .catch(() => { if (id === improveRequest.current) setImprove({ data: null, loading: false }) })
    }, 200)
    return () => clearTimeout(t)
  }, [status, plan.decisions, event])

  // ---- Событие -----------------------------------------------------------
  const drawEvent = async () => {
    setEventLoading(true)
    try { setEvent(await api.drawEvent(event?.id ?? null)) } finally { setEventLoading(false) }
  }

  // ---- Презентация -------------------------------------------------------
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    setDownloading(true)
    try {
      const md = await api.presentation(plan.decisions, event?.id ?? null)
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'akim-plan.md'
      a.click()
      URL.revokeObjectURL(url)
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
    if (id === '__clear') { plan.clear(); return }
    const p = catalog.presets.find((x) => x.id === id)
    if (p) plan.replace(p.decisions)
  }

  const errorMeasureIds = useMemo(() => new Set(sim.data?.errors.flatMap((e) => e.measureIds) ?? []), [sim.data])
  const districtsForMap = shown?.districts ?? sim.data?.baseline.districts.map((d) => ({ districtId: d.districtId, beforeScore: d.score, afterScore: d.score, beforeIndicators: d.indicators, afterIndicators: d.indicators, criticalBefore: [], criticalAfter: [] })) ?? []
  const selectedResult = selectedDistrict ? districtsForMap.find((d) => d.districtId === selectedDistrict) ?? null : null
  const showAfter = plan.decisions.length > 0

  return (
    <div className="min-h-screen">
      <Header
        catalog={catalog}
        decisions={plan.decisions}
        cost={cost}
        budget={budget}
        status={status}
        apiMode={API_MODE}
        onPreset={applyPreset}
        onAnalyze={runAnalysis}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
      />

      <main className="mx-auto grid max-w-[1600px] grid-cols-1 gap-5 px-6 py-5 xl:grid-cols-[320px_minmax(0,1fr)_360px] xl:items-start">
        <div className="xl:sticky xl:top-[88px] xl:flex xl:h-[calc(100vh-108px)] xl:flex-col">
          <CatalogPanel catalog={catalog} decisions={plan.decisions} remainingBudget={budget - cost} currentValues={currentValues} onAdd={plan.add} />
        </div>

        <div className="space-y-5">
          <CityMap catalog={catalog} districts={districtsForMap} showAfter={showAfter} selected={selectedDistrict} onSelect={onMapSelect} />
          {selectedResult && (
            <section aria-label="Показатели района" className="card animate-fade-up p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{catalog.districts.find((d) => d.id === selectedResult.districtId)?.name}</h2>
                <Button variant="ghost" size="sm" aria-label="Закрыть показатели района" onClick={() => setSelectedDistrict(null)}><X className="size-4" /></Button>
              </div>
              <DistrictDetail catalog={catalog} district={selectedResult} showAfter={showAfter} />
            </section>
          )}
          <Portfolio
            catalog={catalog}
            decisions={plan.decisions}
            results={shown?.decisions ?? null}
            remainingBudget={budget - cost}
            errorMeasureIds={errorMeasureIds}
            onRemove={plan.remove}
            onSetDistrict={plan.setDistrict}
            onOpenDistrict={openDistrict}
          />
          {sim.error && <p className="text-[13px] text-down">{sim.error}</p>}
        </div>

        <div className="space-y-5">
          <ResultPanel catalog={catalog} sim={sim.data} loading={sim.loading} status={status} decisionCount={plan.decisions.length} improve={improve.data} />
          <AiPanel catalog={catalog} status={aiStatus} data={ai.data} error={ai.error} canRun={status === 'valid'} onRun={runAnalysis} onDownload={download} downloading={downloading} />
          {status === 'valid' && (
            <ImproveCard catalog={catalog} data={improve.data} loading={improve.loading} currentScore={shown?.score ?? null} onApply={plan.replace} currentDecisions={plan.decisions} />
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
        eventId={event?.id ?? null}
        canSubmit={status === 'valid'}
        currentScore={shown?.score ?? null}
      />
    </div>
  )
}

export type { Decision }
