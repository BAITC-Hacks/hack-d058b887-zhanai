import { DIRECTIONS, DISTRICTS, INDICATORS, PRESETS } from '../data/dataset'
import type { ActiveEvent, ApiError, Baseline, Catalog, Decision, DirectionId, DistrictId, ExplainResponse, ImproveResponse, IndicatorId, IndicatorValues, LeaderboardEntry, SimResult, SimulateResponse } from './types'

const INVALID = 'Сервер вернул несовместимые данные. Обновите страницу или повторите запрос.'
let catalogBudget = 100
let catalogIdentity = ''
type Obj = Record<string, unknown>
function obj(value: unknown): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(INVALID)
  return value as Obj
}
function arr(value: unknown): unknown[] { if (!Array.isArray(value)) throw new Error(INVALID); return value }
function str(value: unknown): string { if (typeof value !== 'string') throw new Error(INVALID); return value }
function num(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(INVALID); return value }
function bool(value: unknown): boolean { if (typeof value !== 'boolean') throw new Error(INVALID); return value }
function texts(value: unknown): string[] { return arr(value).map(str) }
function district(value: unknown): DistrictId {
  const id = str(value)
  if (!DISTRICTS.some(d => d.id === id)) throw new Error(INVALID)
  return id as DistrictId
}
function direction(value: unknown): DirectionId {
  const id = str(value)
  if (!DIRECTIONS.some(d => d.id === id)) throw new Error(INVALID)
  return id as DirectionId
}
function indicator(value: unknown): IndicatorId {
  const id = str(value)
  if (!INDICATORS.some(i => i.id === id)) throw new Error(INVALID)
  return id as IndicatorId
}
function values(value: unknown): IndicatorValues {
  const record = obj(value)
  return Object.fromEntries(INDICATORS.map(i => [i.id, num(record[i.id])])) as IndicatorValues
}
function effects(value: unknown): Partial<IndicatorValues> {
  return Object.fromEntries(Object.entries(obj(value)).map(([key, amount]) => [indicator(key), num(amount)]))
}
function decision(value: unknown): Decision {
  const d = obj(value)
  return { measureId: str(d.measureId), districtId: d.districtId == null ? null : district(d.districtId) }
}
function checkVersion(payload: Obj) {
  const identity = str(payload.ruleset) + ':' + str(payload.dataVersion)
  if (catalogIdentity && identity !== catalogIdentity) throw new Error('Правила или версия данных на сервере изменились. Обновите каталог перед продолжением.')
}

export function parseEvent(value: unknown, budget = catalogBudget): ActiveEvent {
  const e = obj(value), budgetDelta = num(e.budgetDelta)
  return {
    id: str(e.id), title: str(e.name), text: str(e.description), budgetDelta, budget: budget + budgetDelta,
    effects: arr(e.indicatorChanges).map(value => { const change = obj(value); return { districtId: district(change.districtId), indicator: indicator(change.indicator), delta: num(change.delta) } }),
  }
}

export function parseCatalog(value: unknown): Catalog {
  const data = obj(value), rules = obj(data.rules)
  const ruleset = str(data.ruleset)
  if (ruleset !== 'dataset' && ruleset !== 'all_directions') throw new Error(INVALID)
  const directionNames = obj(rules.directionNames), indicatorNames = obj(rules.indicatorNames)
  const districts = arr(data.districts).map(value => {
    const d = obj(value), id = district(d.id), descriptive = DISTRICTS.find(item => item.id === id)!
    return { id, name: str(d.name), locative: descriptive.locative, profile: str(d.profile), populationShare: num(d.populationShare), indicators: values(d.indicators) }
  })
  if (new Set(districts.map(d => d.id)).size !== DISTRICTS.length || districts.length !== DISTRICTS.length) throw new Error(INVALID)
  const measures = arr(data.measures).map(value => {
    const m = obj(value)
    if (m.scope !== 'city' && m.scope !== 'district') throw new Error(INVALID)
    return { id: str(m.id), name: str(m.name), directionId: direction(m.direction), scope: m.scope as 'city' | 'district', cost: num(m.cost), lag: num(m.lag), effects: effects(m.effects) }
  })
  if (new Set(measures.map(m => m.id)).size !== measures.length || measures.length === 0) throw new Error(INVALID)
  const budget = num(rules.budget)
  const presets = ruleset === 'dataset'
    ? PRESETS.map(p => ({ ...p, hint: 'Загрузите сценарий и проверьте результат на сервере', decisions: p.decisions.map(d => ({ ...d })) }))
    : [{ id: 'balanced', name: 'Пять направлений', hint: 'По одной мере каждого направления', decisions: [
      { measureId: 'M3', districtId: 'nura' as const }, { measureId: 'M4', districtId: 'nura' as const },
      { measureId: 'M8', districtId: 'nura' as const }, { measureId: 'M10', districtId: 'nura' as const }, { measureId: 'M14', districtId: null },
    ] }]
  const catalog: Catalog = {
    dataVersion: str(data.dataVersion), districts, measures,
    directions: DIRECTIONS.map(d => ({ ...d, name: str(directionNames[d.id]) })),
    indicators: INDICATORS.map(i => ({ ...i, name: str(indicatorNames[i.id]) })),
    synergies: arr(rules.synergies).map(value => {
      const rule = obj(value), ids = texts(rule.measureIds)
      if (ids.length !== 2 || !ids.includes(str(rule.districtFrom))) throw new Error(INVALID)
      const a = str(rule.districtFrom), b = ids.find(id => id !== a)!
      return { a, b, indicator: indicator(rule.indicator), bonus: num(rule.bonus) }
    }),
    incompatibilities: arr(rules.incompatibilities).map(value => {
      const rule = obj(value), ids = texts(rule.measureIds)
      if (ids.length !== 2 || (rule.scope !== 'any' && rule.scope !== 'same_district')) throw new Error(INVALID)
      return { a: ids[0], b: ids[1], scope: rule.scope === 'any' ? 'any' as const : 'sameDistrict' as const, reason: rule.scope === 'any' ? 'несовместимые программы' : 'конфликт программ в одном районе' }
    }),
    rules: { budget, decisions: num(rules.decisionCount), maxPerDirection: num(rules.maxPerDirection), horizonQuarters: num(rules.horizonQuarters), criticalThreshold: 40, weights: values(rules.indicatorWeights), score: { cityWeight: 0.7, minWeight: 0.3, criticalPenalty: 1 }, ruleset },
    presets, events: arr(data.events).map(value => parseEvent(value, budget)),
  }
  catalogBudget = budget
  catalogIdentity = ruleset + ':' + catalog.dataVersion
  return catalog
}

function parseBaseline(value: unknown): Baseline {
  const b = obj(value)
  const districts = arr(b.districts).map(value => { const d = obj(value); return { districtId: district(d.districtId), score: num(d.score), indicators: values(d.indicators) } })
  if (districts.length !== 5) throw new Error(INVALID)
  return { score: num(b.score), cityAverage: num(b.cityAverage), minDistrictScore: num(b.minDistrictScore), minDistrictId: district(b.minDistrictId), criticalCount: num(b.criticalCount), districts }
}

function parseResult(value: unknown): SimResult {
  const r = obj(value)
  const decisions = arr(r.decisions).map(value => { const d = obj(value); return { ...decision(d), cost: num(d.cost), lag: num(d.lag), realizedShare: num(d.realizedShare), realizedEffects: effects(d.realizedEffects) } })
  const selected = new Set(decisions.map(d => d.measureId))
  const districts = arr(r.districts).map(value => {
    const d = obj(value)
    return { districtId: district(d.districtId), beforeScore: num(d.beforeScore), afterScore: num(d.afterScore), beforeIndicators: values(d.beforeIndicators), afterIndicators: values(d.afterIndicators), criticalBefore: arr(d.criticalBefore).map(indicator), criticalAfter: arr(d.criticalAfter).map(indicator) }
  })
  if (districts.length !== 5) throw new Error(INVALID)
  return {
    score: num(r.score), delta: num(r.delta), cityAverage: num(r.cityAverage), minDistrictScore: num(r.minDistrictScore), minDistrictId: district(r.minDistrictId), criticalCount: num(r.criticalCount), districts, decisions,
    synergies: arr(r.synergies).map(value => { const s = obj(value), ids = texts(s.measureIds); if (ids.length !== 2) throw new Error(INVALID); return { measureIds: ids as [string, string], districtId: district(s.districtId), indicator: indicator(s.indicator), bonus: num(s.bonus) } }),
    missedSynergies: arr(r.missedSynergies).map(value => { const s = obj(value), ids = texts(s.measureIds); if (ids.length !== 2 || ids.filter(id => selected.has(id)).length !== 1) throw new Error(INVALID); return { have: ids.find(id => selected.has(id))!, need: ids.find(id => !selected.has(id))!, indicator: indicator(s.indicator), bonus: num(s.bonus) } }),
    facts: texts(r.facts), unusedBudget: num(r.unusedBudget),
    directionCoverage: Object.fromEntries(DIRECTIONS.map(d => [d.id, num(obj(r.directionCoverage)[d.id])])) as Record<DirectionId, number>,
  }
}

export function parseSimulation(value: unknown): SimulateResponse {
  const s = obj(value), valid = bool(s.valid)
  checkVersion(s)
  const result = s.result == null ? null : parseResult(s.result)
  const preview = s.preview == null ? null : parseResult(s.preview)
  const errors = arr(s.errors).map(value => { const e = obj(value); return { code: str(e.code) as ApiError['code'], message: str(e.message), measureIds: texts(e.measureIds) } })
  if ((valid && (!result || errors.length)) || (!valid && result) || (valid && num(s.decisionCount) !== 5)) throw new Error(INVALID)
  return { valid, errors, result, preview, cost: s.cost == null ? null : num(s.cost), remainingBudget: s.remainingBudget == null ? null : num(s.remainingBudget), decisionCount: num(s.decisionCount), ruleset: str(s.ruleset), dataVersion: str(s.dataVersion), baseline: parseBaseline(s.baseline), event: s.event == null ? null : parseEvent(s.event, num(s.budget) - num(obj(s.event).budgetDelta)) }
}

export function parseExplanation(value: unknown, decisions: Decision[]): ExplainResponse {
  const e = obj(value)
  if (e.status !== 'ai' && e.status !== 'fallback_no_ai') throw new Error(INVALID)
  return { status: e.status === 'ai' ? 'ai' : 'fallback', summary: str(e.summary), strengths: texts(e.strengths), risks: texts(e.risks), consequences: texts(e.consequences), recommendations: texts(e.recommendations), model: e.model == null ? null : str(e.model), cached: bool(e.cached), grounded: bool(e.grounded), decisions: arr(e.decisions).map(value => { const d = obj(value), measureId = str(d.measureId); return { measureId, districtId: decisions.find(item => item.measureId === measureId)?.districtId ?? null, text: str(d.text) } }) }
}

export function parseImprovement(value: unknown): ImproveResponse {
  const data = obj(value)
  if (!bool(data.valid)) return { percentile: null, percentileExact: false, totalPlans: null, optimum: null, swap: null, message: 'Для сравнения нужен допустимый план из пяти мер.' }
  const optimal = obj(data.globalOptimum), current = obj(data.current)
  const percentile = num(data.percentile), totalPlans = num(data.populationCount)
  if (percentile < 0 || percentile > 100 || !Number.isInteger(totalPlans) || totalPlans <= 0) throw new Error(INVALID)
  let swap: ImproveResponse['swap'] = null
  if (data.bestSingleSwap != null) {
    const best = obj(data.bestSingleSwap), plan = obj(best.plan)
    const remove = decision(best.remove), add = decision(best.add), score = num(plan.score), delta = score - num(current.score)
    if (delta <= 0) throw new Error(INVALID)
    swap = { remove, add, score, delta, cost: num(plan.cost), text: 'Замените ' + remove.measureId + ' на ' + add.measureId + ': +' + delta.toFixed(2) + ' к Score' }
  }
  return { percentile, percentileExact: true, totalPlans, optimum: { decisions: arr(optimal.decisions).map(decision), score: num(optimal.score), cost: num(optimal.cost) }, swap, message: swap ? null : 'Замена одной меры не улучшает план.' }
}

export function parseEntry(value: unknown): LeaderboardEntry {
  const e = obj(value), teamName = str(e.teamName)
  return { id: catalogIdentity + ':' + teamName, teamName, score: num(e.score), delta: num(e.delta), cost: num(e.cost), criticalCount: num(e.criticalCount), decisions: arr(e.decisions).map(decision), eventId: null, createdAt: str(e.updatedAt) }
}

export function parseLeaderboard(value: unknown): LeaderboardEntry[] {
  const payload = obj(value)
  checkVersion(payload)
  return arr(payload.entries).map(parseEntry)
}
