// Адаптер ответов сервера (backend/app/*.py, docs/api-contract.md) к типам
// интерфейса (types.ts, data/dataset.ts). Только чистые функции: без fetch и
// без состояния. Числа берутся с сервера; тексты, которых на сервере нет
// (короткие названия, «в Нуре», смысл показателей, сценарии), — из DATASET.

import { DATASET } from '../data/dataset'
import type { CityEvent, Direction, District, Incompatibility, Indicator, Measure, MeasureScope, Rules, Synergy } from '../data/dataset'
import type {
  ActiveEvent,
  ApiError,
  Baseline,
  Catalog,
  Decision,
  DecisionResult,
  DirectionId,
  DistrictId,
  DistrictResult,
  ErrorCode,
  ExplainResponse,
  ImproveResponse,
  IndicatorId,
  IndicatorValues,
  LeaderboardEntry,
  MissedSynergy,
  SimResult,
  SimulateResponse,
  SynergyHit,
} from './types'

// ---- Формы ответов сервера ------------------------------------------------

export interface ServerDecision {
  measureId: string
  districtId: string | null
}

export interface ServerDistrict {
  id: string
  name: string
  populationShare: number
  profile?: string
  indicators: Record<string, number>
}

export interface ServerMeasure {
  id: string
  name: string
  direction: string
  scope: MeasureScope
  cost: number
  lag: number
  effects: Record<string, number>
}

export interface ServerSynergyRule {
  measureIds: [string, string]
  indicator: string
  bonus: number
  districtFrom?: string
}

export interface ServerIncompatibility {
  measureIds: [string, string]
  scope: 'any' | 'same_district'
}

export interface ServerRules {
  dataVersion: string
  budget: number
  decisionCount: number
  horizonQuarters: number
  maxPerDirection: number
  indicatorWeights: Record<string, number>
  indicatorNames?: Record<string, string>
  directionNames?: Record<string, string>
  synergies: ServerSynergyRule[]
  incompatibilities: ServerIncompatibility[]
}

export interface ServerEvent {
  id: string
  name: string
  description: string
  indicatorChanges: { districtId: string; indicator: string; delta: number }[]
  budgetDelta: number
  budget?: number
}

export interface ServerCatalog {
  districts: ServerDistrict[]
  measures: ServerMeasure[]
  rules: ServerRules
  ruleset: string
  dataVersion: string
  events?: ServerEvent[]
}

export interface ServerError {
  code: string
  message: string
  measureIds?: string[]
}

export interface ServerDistrictResult {
  districtId: string
  beforeScore: number
  afterScore: number
  beforeIndicators: Record<string, number>
  afterIndicators: Record<string, number>
  criticalBefore?: string[]
  criticalAfter?: string[]
}

export interface ServerDecisionResult {
  measureId: string
  districtId: string | null
  cost: number
  lag: number
  realizedShare: number
  realizedEffects: Record<string, number>
}

export interface ServerSimResult {
  score: number
  delta: number
  cityAverage: number
  minDistrictScore: number
  minDistrictId?: string
  criticalCount: number
  districts: ServerDistrictResult[]
  synergies: { measureIds: [string, string]; districtId: string; indicator: string; bonus: number }[]
  missedSynergies: ServerSynergyRule[]
  decisions: ServerDecisionResult[]
  facts?: string[]
  directionCoverage: Record<string, number>
  unusedBudget: number
}

export interface ServerBaseline {
  score: number
  cityAverage: number
  minDistrictScore: number
  minDistrictId?: string
  criticalCount: number
  districts: { districtId: string; score: number; indicators: Record<string, number> }[]
}

export interface ServerSimulate {
  valid: boolean
  errors: ServerError[]
  cost: number | null
  remainingBudget: number | null
  decisionCount: number
  ruleset: string
  dataVersion: string
  baseline: ServerBaseline
  result: ServerSimResult | null
  preview?: ServerSimResult | null
  event?: ServerEvent | null
}

export interface ServerExplain {
  status: string
  summary: string
  strengths: string[]
  risks: string[]
  consequences: string[]
  recommendations: string[]
  decisions: { measureId: string; text: string }[]
  model: string | null
  cached: boolean
  grounded: boolean
}

export interface ServerSolution {
  decisions: ServerDecision[]
  score: number
  delta: number
  cost: number
  criticalCount: number
}

export interface ServerImprove {
  valid: boolean
  errors: ServerError[]
  current?: ServerSolution
  percentile?: number
  populationCount?: number
  globalOptimum?: ServerSolution
  gapToOptimum?: number
  bestSingleSwap?: { remove: ServerDecision; add: ServerDecision; plan: ServerSolution } | null
  completion?: ServerSolution | null
}

export interface ServerLeaderboardEntry {
  rank?: number
  teamName: string
  score: number
  delta: number
  cost: number
  criticalCount: number
  decisions: ServerDecision[]
  updatedAt?: string
  ruleset?: string
}

// ---- Мелкие приведения ------------------------------------------------------

const asDistrictId = (id: string) => id as DistrictId
const asIndicatorId = (id: string) => id as IndicatorId
const asDistrictOrNull = (id: string | null | undefined): DistrictId | null => (id ? asDistrictId(id) : null)

function indicatorValues(row: Record<string, number>): IndicatorValues {
  const out = {} as IndicatorValues
  for (const [k, v] of Object.entries(row)) out[asIndicatorId(k)] = v
  return out
}

function partialIndicators(row: Record<string, number>): Partial<Record<IndicatorId, number>> {
  const out: Partial<Record<IndicatorId, number>> = {}
  for (const [k, v] of Object.entries(row)) out[asIndicatorId(k)] = v
  return out
}

function criticalOf(row: Record<string, number>, threshold: number): IndicatorId[] {
  return Object.keys(row).filter((k) => row[k] < threshold).map(asIndicatorId)
}

const decision = (d: ServerDecision): Decision => ({ measureId: d.measureId, districtId: asDistrictOrNull(d.districtId) })

/** SQLite отдаёт «2026-09-23 10:00:00» в UTC без зоны. */
function isoTime(value: string | undefined): string {
  if (!value) return new Date().toISOString()
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return `${value.replace(' ', 'T')}Z`
  return value
}

// ---- Каталог ----------------------------------------------------------------

export function toCityEvent(e: ServerEvent): CityEvent {
  return {
    id: e.id,
    title: e.name,
    text: e.description,
    effects: e.indicatorChanges.map((c) => ({ districtId: asDistrictId(c.districtId), indicator: asIndicatorId(c.indicator), delta: c.delta })),
    budgetDelta: e.budgetDelta,
  }
}

export function toActiveEvent(e: ServerEvent, baseBudget: number = DATASET.rules.budget): ActiveEvent {
  return { ...toCityEvent(e), budget: e.budget ?? baseBudget + e.budgetDelta }
}

export function adaptCatalog(s: ServerCatalog): Catalog {
  const local = DATASET
  const rules = s.rules

  const directionIds = rules.directionNames ? (Object.keys(rules.directionNames) as DirectionId[]) : local.directions.map((d) => d.id)
  const directions: Direction[] = directionIds.map((id) => {
    const l = local.directions.find((d) => d.id === id)
    return { id, name: l?.name ?? rules.directionNames?.[id] ?? id, tzName: l?.tzName ?? rules.directionNames?.[id] ?? id }
  })

  const directionOfIndicator = (id: IndicatorId): DirectionId => {
    const l = local.indicators.find((i) => i.id === id)
    if (l) return l.directionId
    const byEffect = s.measures.find((m) => id in m.effects)
    return (byEffect?.direction ?? directionIds[0]) as DirectionId
  }
  const indicators: Indicator[] = Object.keys(rules.indicatorWeights).map((raw) => {
    const id = asIndicatorId(raw)
    const l = local.indicators.find((i) => i.id === id)
    return { id, directionId: directionOfIndicator(id), name: l?.name ?? rules.indicatorNames?.[raw] ?? raw, meaning: l?.meaning ?? rules.indicatorNames?.[raw] ?? '' }
  })

  const districts: District[] = s.districts.map((d) => {
    const l = local.districts.find((x) => x.id === d.id)
    return {
      id: asDistrictId(d.id),
      name: d.name,
      locative: l?.locative ?? `в районе ${d.name}`,
      populationShare: d.populationShare,
      profile: l?.profile ?? d.profile ?? '',
      indicators: indicatorValues(d.indicators),
    }
  })

  const measures: Measure[] = s.measures.map((m) => {
    const l = local.measures.find((x) => x.id === m.id)
    return {
      id: m.id,
      directionId: m.direction as DirectionId,
      name: l?.name ?? m.name,
      scope: m.scope,
      cost: m.cost,
      lag: m.lag,
      effects: partialIndicators(m.effects),
    }
  })

  const synergies: Synergy[] = rules.synergies.map((r) => {
    const [x, y] = r.measureIds
    const a = r.districtFrom ?? x
    return { a, b: a === x ? y : x, indicator: asIndicatorId(r.indicator), bonus: r.bonus }
  })

  const incompatibilities: Incompatibility[] = rules.incompatibilities.map((r) => {
    const [a, b] = r.measureIds
    const l = local.incompatibilities.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
    const scope = r.scope === 'same_district' ? 'sameDistrict' : 'any'
    return { a, b, scope, reason: l?.reason ?? (scope === 'sameDistrict' ? 'нельзя в одном районе' : 'взаимоисключающие меры') }
  })

  const adaptedRules: Rules = {
    budget: rules.budget,
    decisions: rules.decisionCount,
    maxPerDirection: rules.maxPerDirection,
    horizonQuarters: rules.horizonQuarters,
    criticalThreshold: local.rules.criticalThreshold,
    weights: indicatorValues(rules.indicatorWeights),
    score: { ...local.rules.score },
    ruleset: s.ruleset === 'all_directions' ? 'all_directions' : 'dataset',
  }

  return {
    dataVersion: s.dataVersion ?? rules.dataVersion,
    directions,
    indicators,
    districts,
    measures,
    synergies,
    incompatibilities,
    rules: adaptedRules,
    presets: local.presets,
    events: s.events ? s.events.map(toCityEvent) : local.events,
  }
}

// ---- Симуляция --------------------------------------------------------------

export function adaptErrors(errors: ServerError[] | undefined): ApiError[] {
  return (errors ?? []).map((e) => ({ code: e.code as ErrorCode, message: e.message, measureIds: e.measureIds ?? [] }))
}

function minDistrict(scores: { id: string; score: number }[]): DistrictId {
  let best = scores[0]
  for (const s of scores) if (s.score < best.score) best = s
  return asDistrictId(best?.id ?? DATASET.districts[0].id)
}

function adaptMissed(missed: ServerSynergyRule[], chosen: Set<string>): MissedSynergy[] {
  return missed.flatMap((r) => {
    const [a, b] = r.measureIds
    if (chosen.has(a) === chosen.has(b)) return []
    const have = chosen.has(a) ? a : b
    return [{ have, need: have === a ? b : a, indicator: asIndicatorId(r.indicator), bonus: r.bonus }]
  })
}

export function adaptSimResult(r: ServerSimResult, threshold: number = DATASET.rules.criticalThreshold): SimResult {
  const districts: DistrictResult[] = r.districts.map((d) => ({
    districtId: asDistrictId(d.districtId),
    beforeScore: d.beforeScore,
    afterScore: d.afterScore,
    beforeIndicators: indicatorValues(d.beforeIndicators),
    afterIndicators: indicatorValues(d.afterIndicators),
    criticalBefore: d.criticalBefore ? d.criticalBefore.map(asIndicatorId) : criticalOf(d.beforeIndicators, threshold),
    criticalAfter: d.criticalAfter ? d.criticalAfter.map(asIndicatorId) : criticalOf(d.afterIndicators, threshold),
  }))
  const synergies: SynergyHit[] = r.synergies.map((s) => ({
    measureIds: [s.measureIds[0], s.measureIds[1]],
    districtId: asDistrictId(s.districtId),
    indicator: asIndicatorId(s.indicator),
    bonus: s.bonus,
  }))
  const decisions: DecisionResult[] = r.decisions.map((d) => ({
    measureId: d.measureId,
    districtId: asDistrictOrNull(d.districtId),
    cost: d.cost,
    lag: d.lag,
    realizedShare: d.realizedShare,
    realizedEffects: partialIndicators(d.realizedEffects),
  }))
  const coverage = {} as Record<DirectionId, number>
  for (const dir of DATASET.directions) coverage[dir.id] = 0
  for (const [k, v] of Object.entries(r.directionCoverage)) coverage[k as DirectionId] = v
  return {
    score: r.score,
    delta: r.delta,
    cityAverage: r.cityAverage,
    minDistrictScore: r.minDistrictScore,
    minDistrictId: r.minDistrictId ? asDistrictId(r.minDistrictId) : minDistrict(r.districts.map((d) => ({ id: d.districtId, score: d.afterScore }))),
    criticalCount: r.criticalCount,
    districts,
    synergies,
    missedSynergies: adaptMissed(r.missedSynergies ?? [], new Set(r.decisions.map((d) => d.measureId))),
    decisions,
    facts: r.facts ?? [],
    directionCoverage: coverage,
    unusedBudget: r.unusedBudget,
  }
}

export function adaptBaseline(b: ServerBaseline): Baseline {
  return {
    score: b.score,
    cityAverage: b.cityAverage,
    minDistrictScore: b.minDistrictScore,
    minDistrictId: b.minDistrictId ? asDistrictId(b.minDistrictId) : minDistrict(b.districts.map((d) => ({ id: d.districtId, score: d.score }))),
    criticalCount: b.criticalCount,
    districts: b.districts.map((d) => ({ districtId: asDistrictId(d.districtId), score: d.score, indicators: indicatorValues(d.indicators) })),
  }
}

export function adaptSimulate(s: ServerSimulate): SimulateResponse {
  const result = s.result ? adaptSimResult(s.result) : null
  // Для допустимого плана сервер отдаёт в preview то же, что в result.
  const preview = s.preview ? (s.valid && result ? result : adaptSimResult(s.preview)) : result
  return {
    valid: s.valid,
    errors: adaptErrors(s.errors),
    cost: s.cost ?? null,
    remainingBudget: s.remainingBudget ?? null,
    decisionCount: s.decisionCount,
    ruleset: s.ruleset,
    dataVersion: s.dataVersion,
    baseline: adaptBaseline(s.baseline),
    result,
    preview,
    event: s.event ? toActiveEvent(s.event) : null,
  }
}

// ---- AI-пояснение -----------------------------------------------------------

export function adaptExplain(s: ServerExplain, plan: Decision[]): ExplainResponse {
  const where = new Map(plan.map((d) => [d.measureId, d.districtId]))
  return {
    status: s.status === 'ai' ? 'ai' : s.status === 'error' ? 'error' : 'fallback',
    summary: s.summary,
    strengths: s.strengths ?? [],
    risks: s.risks ?? [],
    consequences: s.consequences ?? [],
    recommendations: s.recommendations ?? [],
    decisions: (s.decisions ?? []).map((d) => ({ measureId: d.measureId, districtId: where.get(d.measureId) ?? null, text: d.text })),
    model: s.model ?? null,
    cached: Boolean(s.cached),
    grounded: Boolean(s.grounded),
  }
}

// ---- Улучшение --------------------------------------------------------------

export const IMPROVE_AFTER_EVENT_MESSAGE = 'После события оптимум не пересчитывается — сбросьте событие, чтобы сравнить с оптимумом'

export const emptyImprove = (message: string | null): ImproveResponse => ({
  percentile: null,
  percentileExact: false,
  totalPlans: null,
  optimum: null,
  swap: null,
  message,
})

function swapText(remove: Decision, add: Decision, catalog: Catalog): string {
  const name = (id: string) => catalog.measures.find((x) => x.id === id)?.name ?? id
  const where = (id: DistrictId | null) => {
    const d = id ? catalog.districts.find((x) => x.id === id) : undefined
    return d ? ` ${d.locative}` : ''
  }
  const to = add.districtId ? where(add.districtId) : ' по всему городу'
  return `Заменить ${remove.measureId} «${name(remove.measureId)}»${where(remove.districtId)} на ${add.measureId} «${name(add.measureId)}»${to}`
}

export function adaptImprove(s: ServerImprove, catalog: Catalog = DATASET): ImproveResponse {
  if (!s.valid || !s.current) {
    const first = s.errors?.find((e) => e.code !== 'EXACTLY_FIVE_REQUIRED') ?? s.errors?.[0]
    return emptyImprove(first ? first.message : 'Сначала соберите допустимый план из пяти мер')
  }
  const current = s.current
  const opt = s.globalOptimum
  const sw = s.bestSingleSwap
  let swap: ImproveResponse['swap'] = null
  if (sw) {
    const remove = decision(sw.remove)
    const add = decision(sw.add)
    swap = { remove, add, score: sw.plan.score, delta: sw.plan.score - current.score, cost: sw.plan.cost, text: swapText(remove, add, catalog) }
  }
  const atOptimum = opt ? current.score >= opt.score - 1e-9 : false
  return {
    percentile: s.percentile ?? null,
    percentileExact: s.percentile !== undefined,
    totalPlans: s.populationCount ?? null,
    optimum: opt ? { decisions: opt.decisions.map(decision), score: opt.score, cost: opt.cost } : null,
    swap,
    message: swap ? null : atOptimum ? 'План уже совпадает с оптимумом по полному перебору' : 'Замена одной меры не улучшает план',
  }
}

// ---- Лидерборд --------------------------------------------------------------

export function adaptLeaderboardEntry(e: ServerLeaderboardEntry): LeaderboardEntry {
  return {
    id: e.teamName,
    teamName: e.teamName,
    score: e.score,
    delta: e.delta,
    cost: e.cost,
    criticalCount: e.criticalCount,
    decisions: e.decisions.map(decision),
    eventId: null,
    createdAt: isoTime(e.updatedAt),
  }
}
