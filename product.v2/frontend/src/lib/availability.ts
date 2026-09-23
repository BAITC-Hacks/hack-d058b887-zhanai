// Подсказки доступности мер и районов. Используют только правила из каталога
// (бюджет, лимит направления, несовместимости), формулы Score здесь нет:
// итоговую допустимость всё равно проверяет сервер.

import type { Catalog, Decision, DirectionId, DistrictId, IndicatorId, Measure } from '../data/dataset'

type Values = Record<DistrictId, Record<IndicatorId, number>>

export type AvailabilityCode = 'ok' | 'inPlan' | 'full' | 'direction' | 'incompatible' | 'budget'

export interface Availability {
  ok: boolean
  /** Почему мера недоступна: по коду интерфейс выбирает подачу. */
  code: AvailabilityCode
  reason: string | null
  /** Мера уже в плане (с этим районом). */
  inPlan: DistrictId | null | false
  /** Подсказка о синергии с мерой, которая уже в плане. */
  synergyHint: string | null
}

const measureOf = (catalog: Catalog, id: string | undefined) => (id ? catalog.measures.find((x) => x.id === id) : undefined)
const directionName = (catalog: Catalog, id: DirectionId) => catalog.directions.find((d) => d.id === id)?.name ?? id

/** Стоимость набора решений по ценам каталога. */
export function planCost(catalog: Catalog, decisions: Decision[]): number {
  return decisions.reduce((acc, d) => acc + (measureOf(catalog, d.measureId)?.cost ?? 0), 0)
}

function directionCount(catalog: Catalog, decisions: Decision[], dir: DirectionId): number {
  return decisions.filter((d) => measureOf(catalog, d.measureId)?.directionId === dir).length
}

/** Несовместимость «в любых районах» с мерами из `ids`. */
function incompatibleWith(catalog: Catalog, m: Measure, ids: Set<string>): { other: string; reason: string } | null {
  for (const inc of catalog.incompatibilities) {
    if (inc.scope !== 'any') continue
    const other = inc.a === m.id ? inc.b : inc.b === m.id ? inc.a : null
    if (other && ids.has(other)) return { other, reason: inc.reason }
  }
  return null
}

/** Районы, где мера конфликтует с уже выбранными мерами «в одном районе». */
export function sameDistrictConflicts(catalog: Catalog, m: Measure, decisions: Decision[]): Map<DistrictId, string> {
  const where = new Map(decisions.map((d) => [d.measureId, d.districtId]))
  const out = new Map<DistrictId, string>()
  for (const inc of catalog.incompatibilities) {
    if (inc.scope !== 'sameDistrict') continue
    const other = inc.a === m.id ? inc.b : inc.b === m.id ? inc.a : null
    const districtId = other ? where.get(other) : undefined
    if (other && districtId) out.set(districtId, `${other} уже здесь: ${inc.reason}`)
  }
  return out
}

export function measureAvailability(catalog: Catalog, m: Measure, decisions: Decision[], remainingBudget: number): Availability {
  const chosen = decisions.find((d) => d.measureId === m.id)
  const ids = new Set(decisions.map((d) => d.measureId))
  let synergyHint: string | null = null
  for (const s of catalog.synergies) {
    const partner = s.a === m.id ? s.b : s.b === m.id ? s.a : null
    if (partner && ids.has(partner)) {
      const ind = catalog.indicators.find((i) => i.id === s.indicator)
      synergyHint = `синергия с ${partner}: +${s.bonus} к «${ind?.name ?? s.indicator}»`
    }
  }
  const no = (code: AvailabilityCode, reason: string): Availability => ({ ok: false, code, reason, inPlan: false, synergyHint })
  if (chosen) return { ok: false, code: 'inPlan', reason: null, inPlan: chosen.districtId ?? null, synergyHint }
  if (decisions.length >= catalog.rules.decisions) return no('full', `Все ${catalog.rules.decisions} решений заняты`)
  const sameDirection = directionCount(catalog, decisions, m.directionId)
  if (sameDirection >= catalog.rules.maxPerDirection)
    return no('direction', `Направление «${directionName(catalog, m.directionId)}» заполнено: ${sameDirection} из ${catalog.rules.maxPerDirection}`)
  const inc = incompatibleWith(catalog, m, ids)
  if (inc) return no('incompatible', `Несовместимо с ${inc.other}: ${inc.reason}`)
  if (m.cost > remainingBudget)
    return no('budget', `Не хватает бюджета: нужно ${m.cost}, осталось ${Math.max(0, remainingBudget)}`)
  return { ok: true, code: 'ok', reason: null, inPlan: false, synergyHint }
}

/** Показатель, на который мера влияет сильнее всего: по нему подсказываем район. */
export function primaryIndicator(m: Measure): IndicatorId {
  let best: IndicatorId | null = null
  let bestV = -Infinity
  for (const [k, v] of Object.entries(m.effects) as [IndicatorId, number][]) if (v > bestV) { bestV = v; best = k }
  return best!
}

/** Доля эффекта, которая успевает сработать за горизонт: (H − лаг) / H. */
export function realizedShare(lag: number, horizon: number): number {
  return horizon > 0 ? Math.max(0, horizon - lag) / horizon : 0
}

export interface DistrictOption {
  districtId: DistrictId
  value: number
  isWorst: boolean
  blockedReason: string | null
}

export function districtOptions(catalog: Catalog, m: Measure, decisions: Decision[], currentValues: Values): DistrictOption[] {
  const ind = primaryIndicator(m)
  const blocked = sameDistrictConflicts(catalog, m, decisions)
  const values = catalog.districts.map((d) => ({ districtId: d.id, value: currentValues[d.id]?.[ind] ?? d.indicators[ind] }))
  const worst = Math.min(...values.map((v) => v.value))
  return values.map((v) => ({ ...v, isWorst: v.value === worst, blockedReason: blocked.get(v.districtId) ?? null }))
}

/** Район с самым низким текущим значением главного показателя меры. */
export function neediestDistrict(catalog: Catalog, m: Measure, currentValues: Values): { districtId: DistrictId; indicator: IndicatorId; value: number } | null {
  if (m.scope !== 'district') return null
  const indicator = primaryIndicator(m)
  let best: { districtId: DistrictId; indicator: IndicatorId; value: number } | null = null
  for (const d of catalog.districts) {
    const value = currentValues[d.id]?.[indicator] ?? d.indicators[indicator]
    if (best === null || value < best.value) best = { districtId: d.id, indicator, value }
  }
  return best
}

/**
 * Показатели без вклада одного решения (приближённо: без синергий и обрезки
 * 0–100). Нужны, чтобы при замене подсказывать район так, будто вытесняемой
 * меры уже нет.
 */
export function valuesWithout(catalog: Catalog, currentValues: Values, d: Decision | undefined): Values {
  if (!d) return currentValues
  const m = measureOf(catalog, d.measureId)
  if (!m) return currentValues
  const share = realizedShare(m.lag, catalog.rules.horizonQuarters)
  const out: Values = { ...currentValues }
  for (const district of catalog.districts) {
    if (m.scope === 'district' && d.districtId !== district.id) continue
    const base = currentValues[district.id]
    if (!base) continue
    const next = { ...base }
    for (const [ind, e] of Object.entries(m.effects) as [IndicatorId, number][]) next[ind] = Math.min(100, Math.max(0, next[ind] - e * share))
    out[district.id] = next
  }
  return out
}

/**
 * Почему меру `m` нельзя поставить на место решения `index` (район пока не
 * учитывается, кроме случая, когда конфликт есть во всех районах). null — можно.
 */
export function swapBlockReason(catalog: Catalog, m: Measure, decisions: Decision[], index: number, budget: number): string | null {
  const removed = measureOf(catalog, decisions[index]?.measureId)
  const rest = decisions.filter((_, i) => i !== index)
  if (rest.some((d) => d.measureId === m.id)) return `${m.id} уже в плане`
  const inc = incompatibleWith(catalog, m, new Set(rest.map((d) => d.measureId)))
  if (inc) return `мешает ${inc.other}: ${inc.reason}`
  const max = catalog.rules.maxPerDirection
  const n = directionCount(catalog, rest, m.directionId) + 1
  if (n > max) return `лимит «${directionName(catalog, m.directionId)}»: станет ${n} из ${max}`
  if (catalog.rules.ruleset === 'all_directions' && removed && removed.directionId !== m.directionId && directionCount(catalog, rest, removed.directionId) === 0)
    return `«${directionName(catalog, removed.directionId)}» останется без мер`
  const cost = planCost(catalog, rest) + m.cost
  if (cost > budget) return `превысит бюджет: ${cost} из ${budget}`
  if (m.scope === 'district') {
    const blocked = sameDistrictConflicts(catalog, m, rest)
    if (catalog.districts.every((d) => blocked.has(d.id))) return 'конфликт во всех районах'
  }
  return null
}

export interface SwapOption {
  index: number
  decision: Decision
  removed: Measure | null
  /** Стоимость плана после замены. */
  costAfter: number
  blockedReason: string | null
}

/** Варианты замены: какое решение из плана вытеснит мера `m`. */
export function swapOptions(catalog: Catalog, m: Measure, decisions: Decision[], budget: number): SwapOption[] {
  const total = planCost(catalog, decisions)
  return decisions.map((decision, index) => {
    const removed = measureOf(catalog, decision.measureId) ?? null
    return {
      index,
      decision,
      removed,
      costAfter: total - (removed?.cost ?? 0) + m.cost,
      blockedReason: swapBlockReason(catalog, m, decisions, index, budget),
    }
  })
}

/** Допустима ли замена решения `index` на `add` целиком, с учётом района. */
export function isSwapAllowed(catalog: Catalog, decisions: Decision[], index: number, add: Decision, budget: number): boolean {
  const m = measureOf(catalog, add.measureId)
  if (!m || index < 0 || index >= decisions.length) return false
  if (swapBlockReason(catalog, m, decisions, index, budget)) return false
  if (m.scope === 'city') return !add.districtId
  if (!add.districtId) return false
  const rest = decisions.filter((_, i) => i !== index)
  return !sameDistrictConflicts(catalog, m, rest).has(add.districtId)
}
