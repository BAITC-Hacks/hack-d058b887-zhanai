import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Monitor, Plus, RotateCcw, Save, Undo2 } from 'lucide-react'
import { API_MODE, api } from './api'
import type { ActiveEvent, Catalog, Decision, DistrictId, DistrictResult, ExplainResponse, ImproveResponse, IndicatorValues } from './api'
import { DATASET } from './data/dataset'
import { usePlan } from './state/usePlan'
import { useSimulation } from './state/useSimulation'
import { decisionUnavailableReason } from './lib/availability'
import { f2 } from './lib/format'
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
import { PlanComparison } from './components/PlanComparison'
import { Button, Drawer } from './components/ui'

export type PlanStatus = 'empty' | 'draft' | 'invalid' | 'valid'

export default function App() {
  const [catalog, setCatalog] = useState<Catalog>(DATASET)
  const [catalogReady, setCatalogReady] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const plan = usePlan(catalog, catalogReady, API_MODE)
  const [notice, setNotice] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [presenting, setPresenting] = useState(false)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [draggedMeasureId, setDraggedMeasureId] = useState<string | null>(null)
  const event: ActiveEvent | null = useMemo(() => {
    const e = catalog.events.find((item) => item.id === plan.eventId)
    return e ? { ...e, budget: catalog.rules.budget + e.budgetDelta } : null
  }, [catalog, plan.eventId])
  const sim = useSimulation(plan.decisions, plan.eventId, `${catalog.dataVersion}:${catalog.rules.ruleset}`, plan.ready)
  const key = JSON.stringify([plan.decisions, plan.eventId, catalog.dataVersion, catalog.rules.ruleset])
  const currentKey = useRef(key)
  currentKey.current = key
  const budget = event?.budget ?? catalog.rules.budget
  const cost = plan.decisions.reduce((sum, d) => sum + (catalog.measures.find((m) => m.id === d.measureId)?.cost ?? 0), 0)
  const shown = sim.data?.result ?? sim.data?.preview ?? null
  const status: PlanStatus = !plan.decisions.length ? 'empty' : !sim.data || sim.loading ? 'draft' : sim.data.valid ? 'valid'
    : sim.data.errors.every((e) => e.code === 'EXACTLY_FIVE_REQUIRED' || e.code === 'ALL_DIRECTIONS_REQUIRED') && plan.decisions.length < catalog.rules.decisions ? 'draft' : 'invalid'
  const canFinalize = plan.ready && status === 'valid' && !sim.loading && !sim.error

  useEffect(() => {
    let alive = true
    setCatalogError(null)
    api.catalog().then((data) => { if (alive) { setCatalog(data); setCatalogReady(true) } })
      .catch((error: unknown) => { if (alive) setCatalogError(error instanceof Error ? error.message : 'Каталог недоступен') })
    return () => { alive = false }
  }, [catalogAttempt])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDraggedMeasureId(null); setPresenting(false) } }
    window.addEventListener('online', update); window.addEventListener('offline', update); window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('keydown', escape) }
  }, [])
  const baselineDistricts = useMemo<DistrictResult[]>(() => catalog.districts.map((d) => {
    const score = catalog.indicators.reduce((sum, i) => sum + d.indicators[i.id] * catalog.rules.weights[i.id], 0)
    const critical = catalog.indicators.filter((i) => d.indicators[i.id] < catalog.rules.criticalThreshold).map((i) => i.id)
    return { districtId: d.id, beforeScore: score, afterScore: score, beforeIndicators: d.indicators, afterIndicators: d.indicators, criticalBefore: critical, criticalAfter: critical }
  }), [catalog])
  const districtsForMap = shown?.districts ?? sim.data?.baseline.districts.map((d) => ({ districtId: d.districtId, beforeScore: d.score, afterScore: d.score, beforeIndicators: d.indicators, afterIndicators: d.indicators, criticalBefore: catalog.indicators.filter((i) => d.indicators[i.id] < catalog.rules.criticalThreshold).map((i) => i.id), criticalAfter: [] })) ?? baselineDistricts
  const currentValues = Object.fromEntries(districtsForMap.map((d) => [d.districtId, d.afterIndicators])) as Record<DistrictId, IndicatorValues>
  const addDecision = (decision: Decision) => {
    if (!plan.ready) return
    const reason = decisionUnavailableReason(catalog, decision, plan.decisions, budget - cost)
    if (reason) { setNotice(reason); setDraggedMeasureId(null); return }
    plan.add(decision); setDraggedMeasureId(null); setCatalogOpen(false)
    const district = catalog.districts.find((d) => d.id === decision.districtId)
    setNotice(`${decision.measureId} добавлена: ${district?.name ?? 'весь город'}. ${plan.decisions.length + 1} из 5 решений. Можно отменить.`)
  }
  const setDistrict = (index: number, districtId: DistrictId) => {
    const decision = plan.decisions[index]
    const measure = catalog.measures.find((m) => m.id === decision?.measureId)
    if (!decision || !measure) return
    const reason = decisionUnavailableReason(catalog, { ...decision, districtId }, plan.decisions.filter((_, i) => i !== index), budget - cost + measure.cost)
    if (reason) { setNotice(reason); return }
    plan.setDistrict(index, districtId); setNotice(`${decision.measureId}: район изменён. Можно отменить.`)
  }

  const [ai, setAi] = useState<{ status: AiStatus; data: ExplainResponse | null; error: string | null; key: string }>({ status: 'idle', data: null, error: null, key: '' })
  const aiRequest = useRef(0)
  const runAnalysis = useCallback(() => {
    if (!canFinalize) return
    const id = ++aiRequest.current, requestedKey = key
    setAi({ status: 'loading', data: null, error: null, key: requestedKey })
    api.explain(plan.decisions, plan.eventId).then((data) => {
      if (id === aiRequest.current && requestedKey === currentKey.current) setAi({ status: 'ready', data, error: null, key: requestedKey })
    }).catch((error: unknown) => {
      if (id === aiRequest.current && requestedKey === currentKey.current) setAi({ status: 'error', data: null, error: error instanceof Error ? error.message : 'Анализ недоступен', key: requestedKey })
    })
  }, [canFinalize, key, plan.decisions, plan.eventId])
  const aiStatus: AiStatus = !plan.decisions.length ? 'idle' : ai.key === key ? ai.status : ai.data ? 'stale' : 'idle'
  const [improve, setImprove] = useState<{ key: string; data: ImproveResponse | null; loading: boolean; error: string | null }>({ key: '', data: null, loading: false, error: null })
  const [improveAttempt, setImproveAttempt] = useState(0)
  useEffect(() => {
    if (!canFinalize || plan.eventId) return
    let alive = true
    setImprove({ key, data: null, loading: true, error: null })
    const timer = setTimeout(() => {
      api.improve(plan.decisions, null).then((data) => {
        if (alive && currentKey.current === key) setImprove({ key, data, loading: false, error: null })
      }).catch((error: unknown) => {
        if (alive && currentKey.current === key) setImprove({ key, data: null, loading: false, error: error instanceof Error ? error.message : 'Поиск улучшений недоступен' })
      })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [canFinalize, key, plan.decisions, plan.eventId, improveAttempt])
  const freshImprove = improve.key === key ? improve.data : null
  const [eventLoading, setEventLoading] = useState(false)
  const drawEvent = async () => {
    if (eventLoading) return
    const requestedKey = key
    setEventLoading(true)
    try {
      const result = await api.drawEvent(plan.eventId)
      if (requestedKey === currentKey.current) { plan.setEventId(result.id); setNotice(`Событие: ${result.title}. База и бюджет будут пересчитаны.`) }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось получить событие. Попробуйте ещё раз.') }
    finally { setEventLoading(false) }
  }
  const [downloading, setDownloading] = useState(false)
  const download = async () => {
    if (!canFinalize || downloading) return
    setDownloading(true)
    try {
      const md = await api.presentation(plan.decisions, plan.eventId)
      const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }))
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'akim-plan.md'; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice('План подготовлен для скачивания в формате Markdown.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Не удалось подготовить файл. Попробуйте ещё раз.') }
    finally { setDownloading(false) }
  }

  const [selectedDistrict, setSelectedDistrict] = useState<DistrictId | null>(null)
  const [districtOpen, setDistrictOpen] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [finalizeOpen, setFinalizeOpen] = useState(false)
  const [team, setTeam] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submitLock = useRef(false)
  const [fixedKey, setFixedKey] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [leaderboardRevision, setLeaderboardRevision] = useState(0)
  const openDistrict = (id: DistrictId) => { setSelectedDistrict(id); setDistrictOpen(true) }
  const selectedResult = districtsForMap.find((d) => d.districtId === selectedDistrict) ?? null
  const finalize = async (e: FormEvent) => {
    e.preventDefault()
    if (!canFinalize || submitLock.current || !team.trim()) return
    submitLock.current = true; setSubmitting(true); setSubmitError(null)
    const requestedKey = key
    try {
      if (!plan.eventId) await api.submit(team.trim(), plan.decisions, null)
      if (requestedKey === currentKey.current) { setFixedKey(requestedKey); setFinalizeOpen(false); runAnalysis() }
      setLeaderboardRevision((value) => value + 1)
      setNotice(plan.eventId ? 'Сценарий зафиксирован. Готовим анализ.' : 'План записан в лидерборд. Готовим анализ; его сбой не отменит запись.')
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Не удалось записать план. Ваш черновик сохранён.') }
    finally { submitLock.current = false; setSubmitting(false) }
  }
  const applyPreset = (id: string) => {
    if (!plan.ready) return
    if (id === '__clear') { plan.clear(); setNotice('План очищен. Можно отменить.'); return }
    const preset = catalog.presets.find((item) => item.id === id)
    if (preset) { plan.replace(preset.decisions, null); setNotice(`Открыт сценарий «${preset.name}». Предыдущий план можно вернуть кнопкой отмены.`) }
  }
  const pointerDrop = (measureId: string, x: number, y: number) => {
    const element = document.elementFromPoint(x, y)
    const measure = catalog.measures.find((m) => m.id === measureId)
    const districtId = element?.closest('[data-district-id]')?.getAttribute('data-district-id') as DistrictId | undefined
    if (measure?.scope === 'city' && element?.closest('[data-city-map]')) addDecision({ measureId, districtId: null })
    else if (districtId) addDecision({ measureId, districtId })
    else setNotice('Мера не добавлена. Отпустите карточку над районом или выберите его из списка.')
  }
  const catalogPanel = <CatalogPanel catalog={catalog} decisions={plan.decisions} remainingBudget={budget - cost} currentValues={currentValues} onAdd={addDecision} onDragMeasure={setDraggedMeasureId} onPointerDrop={pointerDrop} />
  const requestMeasure = () => {
    if (presenting || window.matchMedia('(max-width: 1199px)').matches) setCatalogOpen(true)
    else { document.getElementById('catalog')?.scrollIntoView({ block: 'start' }); document.querySelector<HTMLButtonElement>('#catalog button')?.focus() }
  }
  return (
    <div className={presenting ? 'presentation min-h-screen' : 'min-h-screen'}>
      <a className="skip-link" href="#main">К городу и решениям</a>
      <Header catalog={catalog} decisions={plan.decisions} cost={cost} budget={budget} status={canFinalize ? 'valid' : status === 'valid' ? 'draft' : status} apiMode={API_MODE} onPreset={applyPreset} onAnalyze={() => { setSubmitError(null); setFinalizeOpen(true) }} onOpenLeaderboard={() => setLeaderboardOpen(true)} fixed={fixedKey === key} busy={submitting} />
      <div className="workspace-toolbar mx-auto max-w-[1800px] px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{plan.decisions.length === 5 ? 'Пять решений собраны. Посмотрите, что изменилось в городе.' : 'Выберите меру. Укажите район — и посмотрите, что изменится.'}</p><p className="mt-1 text-xs text-ink-2">Перетащите карточку на карту или выберите район из списка. {catalog.rules.ruleset === 'all_directions' ? 'Нужны все пять направлений.' : 'Не больше двух мер из одного направления.'}</p></div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" onClick={() => { plan.undo(); setNotice('Последнее изменение отменено.') }} disabled={!plan.canUndo}><Undo2 className="size-4" /> Отменить</Button>
            <Button size="sm" onClick={() => { plan.saveSnapshot('План А'); setNotice('План А сохранён для сравнения. Продолжайте менять текущий план.') }} disabled={!catalogReady || !plan.decisions.length}><Save className="size-4" /> Сохранить А</Button>
            <Button size="sm" onClick={() => setPresenting(!presenting)} aria-pressed={presenting}><Monitor className="size-4" /> {presenting ? 'Вернуться к редактору' : 'На экран'}</Button>
          </div>
        </div>
        <div className="mt-2 text-xs text-ink-2" aria-label={`Выбрано ${plan.decisions.length} из 5 решений`}>{fixedKey === key ? 'План зафиксирован' : 'Черновик'} · {plan.decisions.length}/5</div>
        <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[13px] text-accent-ink">{notice || plan.storageMessage || (catalogReady ? 'Черновик сохраняется на этом устройстве.' : 'Загружаем правила и каталог…')}</p>
        {plan.storageMessage && notice && <p className="text-xs text-serious">{plan.storageMessage}</p>}
        {!online && <p className="my-2 rounded-lg border border-line bg-warn-soft p-3 text-sm">Браузер сообщает, что сеть недоступна. Черновик остаётся на устройстве. Расчёт требует связи с сервером; локальный сервер может продолжать работать.</p>}
        {catalogError && <div role="alert" className="my-2 rounded-lg border border-critical p-3 text-sm"><p>Не удалось загрузить правила: {catalogError}</p><div className="mt-2 flex flex-wrap gap-3"><Button onClick={() => setCatalogAttempt((value) => value + 1)}>Повторить подключение</Button><a className="inline-flex items-center text-accent-ink underline" href="?demo=1">Открыть отдельное локальное демо</a></div></div>}
        {API_MODE === 'mock' && <p className="mb-2 text-xs text-ink-2">Локальное демо: расчёт в браузере, анализ по шаблону, лидерборд только на этом устройстве. <a className="underline" href="?">Подключить сервер</a></p>}
      </div>
      <main id="main" tabIndex={-1} className="workspace-grid mx-auto max-w-[1800px] gap-5 px-4 py-4 sm:px-6">
        <div className="catalog-column min-w-0" inert={!catalogReady}>{catalogPanel}</div>
        <div className="city-column min-w-0 space-y-4">
          {sim.loading && plan.decisions.length > 0 && <p className="text-xs text-ink-2">Обновляем последствия. Пока показаны исходные показатели районов.</p>}
          <CityMap catalog={catalog} districts={districtsForMap} showAfter={!!shown && plan.decisions.length > 0} selected={selectedDistrict} onSelect={openDistrict} draggedMeasureId={draggedMeasureId} decisions={plan.decisions} remainingBudget={budget - cost} currentValues={currentValues} onDropMeasure={(measureId, districtId) => addDecision({ measureId, districtId })} />
          <Portfolio catalog={catalog} decisions={plan.decisions} results={shown?.decisions ?? null} remainingBudget={budget - cost} errorMeasureIds={new Set(sim.data?.errors.flatMap((e) => e.measureIds) ?? [])} onRemove={(index) => { plan.remove(index); setNotice('Мера убрана. Можно отменить.') }} onSetDistrict={setDistrict} onOpenDistrict={openDistrict} onRequestMeasure={requestMeasure} />
          {sim.error && <div role="alert" className="card p-4 text-sm"><p className="text-down">Расчёт не обновлён: {sim.error}</p><p className="mt-1 text-ink-2">Ваши решения сохранены. Числа появятся после успешного пересчёта.</p><Button className="mt-2" onClick={sim.retry}><RotateCcw className="size-4" /> Повторить расчёт</Button><Button className="mt-2" onClick={() => setCatalogAttempt((value) => value + 1)}>Обновить правила</Button></div>}
          {plan.savedPlan && <PlanComparison catalog={catalog} saved={plan.savedPlan} current={sim.data} currentDecisions={plan.decisions} currentEventId={plan.eventId} onRestore={() => { plan.restoreSnapshot(); setNotice('План А восстановлен. Можно отменить.') }} />}
        </div>
        <div className="result-column min-w-0 space-y-4">
          <ResultPanel catalog={catalog} sim={sim.data} loading={sim.loading} status={status} decisionCount={plan.decisions.length} improve={freshImprove} />
          <AiPanel catalog={catalog} status={aiStatus} data={ai.data} error={ai.error} canRun={canFinalize} onRun={runAnalysis} onDownload={download} downloading={downloading} />
          {canFinalize && !plan.eventId && <ImproveCard catalog={catalog} data={freshImprove} loading={improve.key === key && improve.loading} currentScore={shown?.score ?? null} onApply={(decisions) => { plan.replace(decisions); setNotice('Предложенное улучшение применено. Можно отменить.') }} currentDecisions={plan.decisions} />}
          {canFinalize && improve.key === key && improve.error && <div className="text-sm text-ink-2"><p>Улучшения: {improve.error}</p><Button size="sm" onClick={() => setImproveAttempt((value) => value + 1)}>Повторить поиск</Button></div>}
          <div className="event-section" inert={!catalogReady}><EventCard catalog={catalog} event={event} loading={eventLoading} onDraw={drawEvent} onReset={() => { plan.setEventId(null); setNotice('Исходные условия восстановлены.') }} /></div>
          {event && <p className="text-xs text-ink-2">Событие меняет условия. Процентиль, поиск оптимума и запись в общий лидерборд доступны после сброса события.</p>}
          <p className="px-1 text-[11px] leading-relaxed text-ink-2">Схема районов и синтетические данные хакатона. Результаты описывают заданную модель, а не прогноз для Астаны. Версия {catalog.dataVersion} · {catalog.rules.ruleset}.</p>
        </div>
      </main>
      <div className="mobile-action"><Button variant="primary" disabled={!plan.ready || (plan.decisions.length >= 5 && (!canFinalize || fixedKey === key))} onClick={() => plan.decisions.length >= 5 ? setFinalizeOpen(true) : setCatalogOpen(true)}><Plus className="size-4" /> {plan.decisions.length >= 5 ? fixedKey === key ? 'План зафиксирован' : 'Зафиксировать 5 решений' : `Добавить решение · ${plan.decisions.length}/5`}</Button><span aria-live="polite" className="text-xs text-ink-2">{sim.loading ? 'Пересчёт…' : shown ? <>{status === 'draft' ? 'Предв. ' : 'Score '}<strong className="block text-base text-ink tnum">{f2(shown.score)}</strong></> : `Бюджет: ${budget - cost}`}</span></div>
      <Drawer open={catalogOpen} onClose={() => setCatalogOpen(false)} title={`Добавьте решение · ${plan.decisions.length}/5`} width="w-[520px]">{sim.loading && <p className="mb-3 text-xs text-ink-2">Пересчитываем план. В подсказках пока исходные показатели.</p>}<CatalogPanel id="mobile-catalog" allowDrag={false} catalog={catalog} decisions={plan.decisions} remainingBudget={budget - cost} currentValues={currentValues} onAdd={addDecision} /></Drawer>
      <Drawer open={districtOpen && !!selectedResult} onClose={() => setDistrictOpen(false)} title={catalog.districts.find((d) => d.id === selectedDistrict)?.name ?? 'Район'}>{selectedResult && <DistrictDetail catalog={catalog} district={selectedResult} showAfter={!!shown && plan.decisions.length > 0} />}</Drawer>
      <Drawer open={finalizeOpen} onClose={() => { if (!submitting) setFinalizeOpen(false) }} title={event ? 'Зафиксировать сценарий' : 'Зафиксировать план'}>
        <form onSubmit={finalize} className="space-y-4"><p className="text-sm text-ink-2">{event ? 'Сохраним выбранный сценарий в этой сессии и запустим анализ. События не участвуют в общем рейтинге.' : 'Запишем проверенный сервером результат в лидерборд и запустим анализ. Повторная запись под тем же названием обновляет результат команды.'}</p>
          <label className="block text-sm font-medium">Название команды<input className="mt-2 block min-h-11 w-full rounded-lg border border-line-2 bg-surface px-3" required maxLength={40} value={team} autoComplete="organization" onChange={(e) => setTeam(e.target.value)} disabled={submitting} /></label>
          <p className="text-sm">Выбрано {plan.decisions.length}/5 · бюджет {cost}/{budget} · {canFinalize ? 'план допустим' : 'ожидаем допустимый расчёт'}</p>{submitError && <p role="alert" className="text-sm text-down">{submitError}</p>}
          <Button type="submit" variant="primary" disabled={!canFinalize || submitting || !team.trim()}>{submitting ? 'Записываем…' : 'Зафиксировать и получить анализ'}</Button>
        </form>
      </Drawer>
      <LeaderboardDrawer open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} decisions={plan.decisions} eventId={plan.eventId} canSubmit={canFinalize && !plan.eventId} currentScore={sim.data?.result?.score ?? null} revision={leaderboardRevision} />
    </div>
  )
}
export type { Decision }
