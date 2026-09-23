// Движок для режима mock. Формулы перенесены из эталона akim_score.py
// (коммит c0c6bf0) без изменений. В production источник истины — сервер.

import {
  DATASET, DISTRICT_IDS, INDICATOR_IDS, districtById, indicatorById, measureById, directionById,
} from '../../data/dataset'
import type { CityEvent, Decision, DirectionId, DistrictId, IndicatorId, Measure } from '../../data/dataset'
import type {
  ActiveEvent, ApiError, Baseline, DecisionResult, DistrictResult, ExplainResponse, ImproveResponse,
  IndicatorValues, MissedSynergy, SimResult, SimulateResponse, SynergyHit,
} from '../types'

const { rules, measures, synergies, incompatibilities, districts } = DATASET
const H = rules.horizonQuarters

type CityState = Record<DistrictId, IndicatorValues>

export const realizedShare = (lag: number) => (H - lag) / H

const clone = (s: CityState): CityState =>
  Object.fromEntries(DISTRICT_IDS.map((d) => [d, { ...s[d] }])) as CityState

export function baseState(): CityState {
  return Object.fromEntries(districts.map((d) => [d.id, { ...d.indicators }])) as CityState
}

export function toActiveEvent(e: CityEvent): ActiveEvent {
  return { ...e, budget: rules.budget + e.budgetDelta }
}

export function stateAfterEvent(event: ActiveEvent | null): CityState {
  const s = baseState()
  if (event) for (const ef of event.effects) s[ef.districtId][ef.indicator] += ef.delta
  return s
}

export function districtScore(v: IndicatorValues) {
  return INDICATOR_IDS.reduce((acc, k) => acc + rules.weights[k] * v[k], 0)
}

export interface Scored {
  districtScores: Record<DistrictId, number>
  cityAverage: number
  minDistrictId: DistrictId
  minDistrictScore: number
  criticalPairs: { districtId: DistrictId; indicator: IndicatorId; value: number }[]
  score: number
}

export function scoreState(state: CityState): Scored {
  const districtScores = Object.fromEntries(DISTRICT_IDS.map((d) => [d, districtScore(state[d])])) as Record<DistrictId, number>
  const cityAverage = districts.reduce((acc, d) => acc + d.populationShare * districtScores[d.id], 0)
  let minDistrictId: DistrictId = DISTRICT_IDS[0]
  for (const d of DISTRICT_IDS) if (districtScores[d] < districtScores[minDistrictId]) minDistrictId = d
  const criticalPairs: Scored['criticalPairs'] = []
  for (const d of DISTRICT_IDS)
    for (const k of INDICATOR_IDS)
      if (state[d][k] < rules.criticalThreshold) criticalPairs.push({ districtId: d, indicator: k, value: state[d][k] })
  const score =
    rules.score.cityWeight * cityAverage +
    rules.score.minWeight * districtScores[minDistrictId] -
    rules.score.criticalPenalty * criticalPairs.length
  return { districtScores, cityAverage, minDistrictId, minDistrictScore: districtScores[minDistrictId], criticalPairs, score }
}

/** Применяет решения к состоянию: эффекты с лагом, синергии, затем clip 0–100. */
export function applyDecisions(decisions: Decision[], before: CityState) {
  const after = clone(before)
  const hits: SynergyHit[] = []
  for (const d of decisions) {
    const m = measureById(d.measureId)
    if (!m) continue
    const k = realizedShare(m.lag)
    const targets = m.scope === 'district' ? (d.districtId ? [d.districtId] : []) : DISTRICT_IDS
    for (const [ind, e] of Object.entries(m.effects) as [IndicatorId, number][])
      for (const t of targets) after[t][ind] += e * k
  }
  const where = new Map(decisions.map((d) => [d.measureId, d.districtId]))
  for (const s of synergies) {
    if (!where.has(s.a) || !where.has(s.b)) continue
    const a = measureById(s.a)!
    const target = a.scope === 'district' ? where.get(s.a) : null
    if (!target) continue
    after[target][s.indicator] += s.bonus
    hits.push({ measureIds: [s.a, s.b], districtId: target, indicator: s.indicator, bonus: s.bonus })
  }
  for (const d of DISTRICT_IDS) for (const k of INDICATOR_IDS) after[d][k] = Math.min(100, Math.max(0, after[d][k]))
  return { after, hits }
}

export function planCost(decisions: Decision[]) {
  return decisions.reduce((acc, d) => acc + (measureById(d.measureId)?.cost ?? 0), 0)
}

export function directionCounts(decisions: Decision[]) {
  const counts = Object.fromEntries(DATASET.directions.map((d) => [d.id, 0])) as Record<DirectionId, number>
  for (const d of decisions) {
    const m = measureById(d.measureId)
    if (m) counts[m.directionId] += 1
  }
  return counts
}

export function validate(decisions: Decision[], budget = rules.budget): ApiError[] {
  const errors: ApiError[] = []
  const ids = decisions.map((d) => d.measureId)
  for (const d of decisions) {
    const m = measureById(d.measureId)
    if (!m) { errors.push({ code: 'UNKNOWN_MEASURE', message: `Неизвестная мера ${d.measureId}`, measureIds: [d.measureId] }); continue }
    if (m.scope === 'district' && !d.districtId)
      errors.push({ code: 'DISTRICT_REQUIRED', message: `Для меры ${m.id} нужно выбрать район`, measureIds: [m.id] })
    if (m.scope === 'district' && d.districtId && !districtById(d.districtId))
      errors.push({ code: 'UNKNOWN_DISTRICT', message: `Неизвестный район у меры ${m.id}`, measureIds: [m.id] })
    if (m.scope === 'city' && d.districtId)
      errors.push({ code: 'CITY_DISTRICT_FORBIDDEN', message: `Мера ${m.id} городская, район не указывается`, measureIds: [m.id] })
  }
  if (errors.some((e) => e.code === 'UNKNOWN_MEASURE')) return errors
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (dup.length) errors.push({ code: 'DUPLICATE_MEASURE', message: 'Мероприятия не должны повторяться', measureIds: [...new Set(dup)] })
  if (decisions.length !== rules.decisions)
    errors.push({ code: 'EXACTLY_FIVE_REQUIRED', message: `Решений должно быть ровно ${rules.decisions}, сейчас ${decisions.length}`, measureIds: [] })
  const cost = planCost(decisions)
  if (cost > budget)
    errors.push({ code: 'BUDGET_EXCEEDED', message: `Бюджет превышен: ${cost} из ${budget}`, measureIds: ids })
  const counts = directionCounts(decisions)
  for (const [dir, n] of Object.entries(counts) as [DirectionId, number][])
    if (n > rules.maxPerDirection)
      errors.push({
        code: 'DIRECTION_LIMIT',
        message: `Не больше ${rules.maxPerDirection} мер из направления «${directionById(dir).name}»`,
        measureIds: decisions.filter((d) => measureById(d.measureId)?.directionId === dir).map((d) => d.measureId),
      })
  if (rules.ruleset === 'all_directions' && Object.values(counts).some((n) => n === 0))
    errors.push({ code: 'ALL_DIRECTIONS_REQUIRED', message: 'Нужна хотя бы одна мера из каждого направления', measureIds: [] })
  const where = new Map(decisions.map((d) => [d.measureId, d.districtId]))
  for (const inc of incompatibilities) {
    if (!where.has(inc.a) || !where.has(inc.b)) continue
    if (inc.scope === 'any' || where.get(inc.a) === where.get(inc.b))
      errors.push({ code: 'INCOMPATIBLE_MEASURES', message: `${inc.a} и ${inc.b} несовместимы: ${inc.reason}`, measureIds: [inc.a, inc.b] })
  }
  return errors
}

function fmt(n: number, digits = 1) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function buildFacts(decisions: Decision[], before: CityState, after: CityState, b: Scored, a: Scored, hits: SynergyHit[], missed: MissedSynergy[], budget: number): string[] {
  const facts: string[] = []
  facts.push(`Score ${fmt(b.score, 2)} → ${fmt(a.score, 2)} (${a.score >= b.score ? '+' : ''}${fmt(a.score - b.score, 2)})`)
  facts.push(`Средневзвешенная оценка города ${fmt(b.cityAverage)} → ${fmt(a.cityAverage)}`)
  facts.push(`Худший район: ${districtById(b.minDistrictId)!.name} ${fmt(b.minDistrictScore)} → ${districtById(a.minDistrictId)!.name} ${fmt(a.minDistrictScore)}`)
  facts.push(`Критических значений (ниже ${rules.criticalThreshold}): ${b.criticalPairs.length} → ${a.criticalPairs.length}`)
  for (const c of a.criticalPairs)
    facts.push(`Остаётся критическим: ${indicatorById(c.indicator).name} ${districtById(c.districtId)!.locative} (${fmt(c.value)})`)
  for (const d of decisions) {
    const m = measureById(d.measureId)
    if (!m) continue
    const k = realizedShare(m.lag)
    const targets = m.scope === 'district' ? (d.districtId ? [d.districtId] : []) : DISTRICT_IDS
    const parts: string[] = []
    for (const [ind, e] of Object.entries(m.effects) as [IndicatorId, number][]) {
      if (m.scope === 'district' && targets[0]) {
        parts.push(`${indicatorById(ind).name} ${fmt(before[targets[0]][ind])} → ${fmt(after[targets[0]][ind])}`)
      } else {
        parts.push(`${indicatorById(ind).name} ${e * k >= 0 ? '+' : ''}${fmt(e * k)} во всех районах`)
      }
    }
    const whereText = m.scope === 'district' ? (districtById(d.districtId)?.locative ?? 'район не выбран') : 'по всему городу'
    facts.push(`${m.id} «${m.name}» ${whereText}: ${parts.join(', ')}; реализовано ${H - m.lag}/${H} эффекта из-за лага ${m.lag}`)
    for (const [ind, e] of Object.entries(m.effects) as [IndicatorId, number][])
      if (e < 0) facts.push(`${m.id} снижает «${indicatorById(ind).name}» на ${fmt(Math.abs(e * k))}`)
  }
  for (const h of hits)
    facts.push(`Сработала синергия ${h.measureIds[0]} + ${h.measureIds[1]}: ${indicatorById(h.indicator).name} +${h.bonus} ${districtById(h.districtId)!.locative}`)
  for (const m of missed)
    facts.push(`Упущена синергия: к ${m.have} не хватает ${m.need} для +${m.bonus} к «${indicatorById(m.indicator).name}»`)
  const counts = directionCounts(decisions)
  const untouched = DATASET.directions.filter((d) => counts[d.id] === 0).map((d) => d.name.toLowerCase())
  if (untouched.length) facts.push(`Без мер остались направления: ${untouched.join(', ')}`)
  const cost = planCost(decisions)
  facts.push(`Потрачено ${cost} из ${budget}, не потрачено ${budget - cost}`)
  return facts
}

function toBaseline(state: CityState, s: Scored): Baseline {
  return {
    score: s.score, cityAverage: s.cityAverage, minDistrictScore: s.minDistrictScore, minDistrictId: s.minDistrictId,
    criticalCount: s.criticalPairs.length,
    districts: DISTRICT_IDS.map((d) => ({ districtId: d, score: s.districtScores[d], indicators: { ...state[d] } })),
  }
}

export function evaluate(decisions: Decision[], event: ActiveEvent | null): { result: SimResult; before: CityState; after: CityState; baseline: Baseline } {
  const budget = event?.budget ?? rules.budget
  const before = stateAfterEvent(event)
  const b = scoreState(before)
  const { after, hits } = applyDecisions(decisions, before)
  const a = scoreState(after)
  const ids = new Set(decisions.map((d) => d.measureId))
  const missed: MissedSynergy[] = []
  for (const s of synergies) {
    if (ids.has(s.a) && !ids.has(s.b)) missed.push({ have: s.a, need: s.b, indicator: s.indicator, bonus: s.bonus })
    if (ids.has(s.b) && !ids.has(s.a)) missed.push({ have: s.b, need: s.a, indicator: s.indicator, bonus: s.bonus })
  }
  const districtsOut: DistrictResult[] = DISTRICT_IDS.map((d) => ({
    districtId: d,
    beforeScore: b.districtScores[d],
    afterScore: a.districtScores[d],
    beforeIndicators: { ...before[d] },
    afterIndicators: { ...after[d] },
    criticalBefore: b.criticalPairs.filter((c) => c.districtId === d).map((c) => c.indicator),
    criticalAfter: a.criticalPairs.filter((c) => c.districtId === d).map((c) => c.indicator),
  }))
  const decisionsOut: DecisionResult[] = decisions.flatMap((d) => {
    const m = measureById(d.measureId)
    if (!m) return []
    const k = realizedShare(m.lag)
    const realizedEffects = Object.fromEntries(Object.entries(m.effects).map(([i, e]) => [i, (e as number) * k]))
    return [{ measureId: m.id, districtId: d.districtId, cost: m.cost, lag: m.lag, realizedShare: k, realizedEffects }]
  })
  const result: SimResult = {
    score: a.score, delta: a.score - b.score, cityAverage: a.cityAverage,
    minDistrictScore: a.minDistrictScore, minDistrictId: a.minDistrictId, criticalCount: a.criticalPairs.length,
    districts: districtsOut, synergies: hits, missedSynergies: missed, decisions: decisionsOut,
    facts: buildFacts(decisions, before, after, b, a, hits, missed, budget),
    directionCoverage: directionCounts(decisions), unusedBudget: budget - planCost(decisions),
  }
  return { result, before, after, baseline: toBaseline(before, b) }
}

export function simulate(decisions: Decision[], event: ActiveEvent | null): SimulateResponse {
  const budget = event?.budget ?? rules.budget
  const errors = validate(decisions, budget)
  const admissible = errors.every((e) => e.code === 'EXACTLY_FIVE_REQUIRED' || e.code === 'ALL_DIRECTIONS_REQUIRED')
  const { result, baseline } = evaluate(admissible ? decisions : [], event)
  const known = !errors.some((e) => e.code === 'UNKNOWN_MEASURE')
  const cost = known ? planCost(decisions) : null
  return {
    valid: errors.length === 0,
    errors,
    cost,
    remainingBudget: cost === null ? null : budget - cost,
    decisionCount: decisions.length,
    ruleset: rules.ruleset,
    dataVersion: DATASET.dataVersion,
    baseline,
    result: errors.length === 0 ? result : null,
    preview: admissible && decisions.length < rules.decisions ? result : null,
    event,
  }
}

// ---- Улучшение: лучшая замена одной меры + оценка процентиля ---------------

const districtChoices = (m: Measure): (DistrictId | null)[] => (m.scope === 'district' ? DISTRICT_IDS : [null])

export function bestSwap(decisions: Decision[], event: ActiveEvent | null): ImproveResponse['swap'] {
  const budget = event?.budget ?? rules.budget
  if (validate(decisions, budget).length) return null
  const current = evaluate(decisions, event).result.score
  let best: { plan: Decision[]; score: number; i: number; add: Decision } | null = null
  for (let i = 0; i < decisions.length; i++) {
    for (const m of measures) {
      for (const districtId of districtChoices(m)) {
        const add = { measureId: m.id, districtId }
        if (add.measureId === decisions[i].measureId && add.districtId === decisions[i].districtId) continue
        const plan = decisions.map((d, j) => (j === i ? add : d))
        if (validate(plan, budget).length) continue
        const s = evaluate(plan, event).result.score
        const cost = planCost(plan)
        const better = !best || s > best.score + 1e-9 || (Math.abs(s - best.score) < 1e-9 && cost < planCost(best.plan))
        if (s > current + 1e-9 && better) best = { plan, score: s, i, add }
      }
    }
  }
  if (!best) return null
  const remove = decisions[best.i]
  const mr = measureById(remove.measureId)!
  const ma = measureById(best.add.measureId)!
  const from = mr.scope === 'district' ? ` ${districtById(remove.districtId)!.locative}` : ''
  const to = ma.scope === 'district' ? ` ${districtById(best.add.districtId)!.locative}` : ' по всему городу'
  return {
    remove, add: best.add, score: best.score, delta: best.score - current, cost: planCost(best.plan),
    text: `Заменить ${mr.id} «${mr.name}»${from} на ${ma.id} «${ma.name}»${to}`,
  }
}

const sampleCache = new Map<string, number[]>()

/** Оценка процентиля по случайной выборке допустимых планов (на сервере — точный перебор). */
export function samplePercentile(score: number, event: ActiveEvent | null, n = 12000): number {
  const key = event?.id ?? 'base'
  let scores = sampleCache.get(key)
  if (!scores) {
    const budget = event?.budget ?? rules.budget
    scores = []
    let seed = 20260923
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    let guard = 0
    while (scores.length < n && guard++ < n * 40) {
      const pool = [...measures]
      const plan: Decision[] = []
      for (let i = 0; i < rules.decisions; i++) {
        const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0]
        const choices = districtChoices(m)
        plan.push({ measureId: m.id, districtId: choices[Math.floor(rnd() * choices.length)] })
      }
      if (validate(plan, budget).length) continue
      scores.push(evaluate(plan, event).result.score)
    }
    scores.sort((x, y) => x - y)
    sampleCache.set(key, scores)
  }
  let lo = 0, hi = scores.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (scores[mid] < score) lo = mid + 1; else hi = mid }
  return (100 * lo) / scores.length
}

// Проверено полным перебором в эталоне (694 395 допустимых наборов).
export const KNOWN_OPTIMUM = {
  decisions: DATASET.presets.find((p) => p.id === 'optimum')!.decisions,
  score: 57.23673,
  cost: 98,
  totalPlans: 694395,
}

// ---- Пояснение без AI: собирается из тех же фактов ------------------------

export function fallbackExplain(decisions: Decision[], event: ActiveEvent | null): ExplainResponse {
  const { result } = evaluate(decisions, event)
  const strengths: string[] = []
  const risks: string[] = []
  const consequences: string[] = []
  const recommendations: string[] = []
  const bDistrict = result.districts.find((d) => d.districtId === result.minDistrictId)!
  const critBefore = result.districts.reduce((a, d) => a + d.criticalBefore.length, 0)
  if (result.delta > 0) strengths.push(`План поднимает Score на ${fmt(result.delta, 2)}, до ${fmt(result.score, 2)}`)
  if (critBefore > result.criticalCount) strengths.push(`Снято критических значений: ${critBefore - result.criticalCount} из ${critBefore}`)
  if (result.synergies.length) strengths.push(`Сработали синергии: ${result.synergies.map((s) => `${s.measureIds[0]} + ${s.measureIds[1]}`).join(', ')}`)
  const improvedDistricts = result.districts.filter((d) => d.afterScore - d.beforeScore >= 1)
  if (improvedDistricts.length) strengths.push(`Заметно улучшены районы: ${improvedDistricts.map((d) => `${districtById(d.districtId)!.name} +${fmt(d.afterScore - d.beforeScore)}`).join(', ')}`)
  if (result.criticalCount) risks.push(`Остаются ${result.criticalCount} критических значений, каждое стоит 1 балл штрафа`)
  const slow = result.decisions.filter((d) => d.lag >= 3)
  if (slow.length) risks.push(`Меры с долгим лагом дадут только часть эффекта в горизонте: ${slow.map((d) => `${d.measureId} (${H - d.lag}/${H})`).join(', ')}`)
  const untouched = DATASET.directions.filter((d) => result.directionCoverage[d.id] === 0)
  if (untouched.length) risks.push(`Без мер остались направления: ${untouched.map((d) => d.name.toLowerCase()).join(', ')}`)
  if (result.missedSynergies.length) risks.push(`Упущены синергии: ${result.missedSynergies.map((m) => `${m.have} без ${m.need}`).join(', ')}`)
  if (result.unusedBudget >= 10) risks.push(`Не потрачено ${result.unusedBudget} единиц бюджета, остаток бонуса не даёт`)
  consequences.push(`Худший район после плана: ${districtById(result.minDistrictId)!.name}, ${fmt(bDistrict.beforeScore)} → ${fmt(bDistrict.afterScore)}; он даёт 30 % веса Score`)
  const flat = result.districts.filter((d) => Math.abs(d.afterScore - d.beforeScore) < 0.5)
  if (flat.length) consequences.push(`Почти без изменений: ${flat.map((d) => districtById(d.districtId)!.name).join(', ')}`)
  for (const d of result.decisions) {
    const negative = Object.entries(d.realizedEffects).filter(([, v]) => (v as number) < 0)
    for (const [ind, v] of negative) consequences.push(`${d.measureId} снижает «${indicatorById(ind as IndicatorId).name}» на ${fmt(Math.abs(v as number))}`)
  }
  if (result.criticalCount) recommendations.push('Закройте оставшиеся критические значения: штраф за них больше, чем прирост от большинства мер')
  if (result.missedSynergies.length) recommendations.push(`Добавьте ${result.missedSynergies[0].need}, чтобы получить синергию с ${result.missedSynergies[0].have}`)
  if (!recommendations.length) recommendations.push('Нажмите «Улучшить план», чтобы проверить лучшую замену одной меры')
  const perDecision = result.decisions.map((d) => {
    const m = measureById(d.measureId)!
    const effects = Object.entries(d.realizedEffects).map(([i, v]) => `${indicatorById(i as IndicatorId).name} ${(v as number) >= 0 ? '+' : ''}${fmt(v as number)}`).join(', ')
    const where = m.scope === 'district' ? districtById(d.districtId)!.locative : 'по всему городу'
    return { measureId: d.measureId, districtId: d.districtId, text: `${m.name} ${where}: ${effects}` }
  })
  return {
    status: 'fallback',
    summary: `Score ${fmt(result.score - result.delta, 2)} → ${fmt(result.score, 2)}. ${result.criticalCount === 0 ? 'Критических значений не осталось.' : `Критических значений: ${result.criticalCount}.`} Худший район: ${districtById(result.minDistrictId)!.name}.`,
    strengths, risks, consequences, recommendations, decisions: perDecision,
    model: null, cached: false, grounded: true,
  }
}

export function presentationMarkdown(decisions: Decision[], event: ActiveEvent | null): string {
  const { result } = evaluate(decisions, event)
  const ex = fallbackExplain(decisions, event)
  const lines = [
    '# Аким на 5 часов: решение команды',
    '',
    event ? `Событие: **${event.title}** (${event.text}).` : 'Событий не было.',
    '',
    '## Пять решений',
    '',
    ...decisions.map((d) => {
      const m = measureById(d.measureId)!
      const where = m.scope === 'district' ? districtById(d.districtId)!.name : 'город'
      return `- ${m.id} ${m.name} · ${where} · ${m.cost} ед.`
    }),
    '',
    `Стоимость: ${planCost(decisions)} из ${event?.budget ?? rules.budget}.`,
    '',
    '## Результат',
    '',
    `- Astana Quality of Life Score: ${fmt(result.score - result.delta, 2)} → **${fmt(result.score, 2)}** (${result.delta >= 0 ? '+' : ''}${fmt(result.delta, 2)})`,
    `- Критических значений: ${result.districts.reduce((a, d) => a + d.criticalBefore.length, 0)} → ${result.criticalCount}`,
    `- Худший район: ${districtById(result.minDistrictId)!.name}, ${fmt(result.minDistrictScore)}`,
    '',
    '## Районы',
    '',
    '| Район | До | После | Δ |',
    '|---|---:|---:|---:|',
    ...result.districts.map((d) => `| ${districtById(d.districtId)!.name} | ${fmt(d.beforeScore)} | ${fmt(d.afterScore)} | ${d.afterScore - d.beforeScore >= 0 ? '+' : ''}${fmt(d.afterScore - d.beforeScore)} |`),
    '',
    '## Сильные стороны',
    '',
    ...ex.strengths.map((s) => `- ${s}`),
    '',
    '## Риски',
    '',
    ...ex.risks.map((s) => `- ${s}`),
    '',
    '## Последствия',
    '',
    ...ex.consequences.map((s) => `- ${s}`),
    '',
    '_Числа получены расчётом по модели датасета; это результаты заданной симуляции, а не прогноз для реальной Астаны._',
  ]
  return lines.join('\n')
}
