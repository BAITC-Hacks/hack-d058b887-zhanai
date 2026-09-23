// Подсказки доступности мер и районов. Используют только правила из каталога
// (бюджет, лимит направления, несовместимости), формулы Score здесь нет:
// итоговую допустимость всё равно проверяет сервер.

import type { Catalog, Decision, DistrictId, IndicatorId, Measure } from '../data/dataset'

export interface Availability {
  ok: boolean
  reason: string | null
  /** Мера уже в плане (с этим районом). */
  inPlan: DistrictId | null | false
  /** Подсказка о синергии с мерой, которая уже в плане. */
  synergyHint: string | null
}

export function measureAvailability(catalog: Catalog, m: Measure, decisions: Decision[], remainingBudget: number): Availability {
  const chosen = decisions.find((d) => d.measureId === m.id)
  const ids = new Set(decisions.map((d) => d.measureId))
  let synergyHint: string | null = null
  for (const s of catalog.synergies) {
    const partner = s.a === m.id ? s.b : s.b === m.id ? s.a : null
    if (partner && ids.has(partner)) {
      const ind = catalog.indicators.find((i) => i.id === s.indicator)!
      synergyHint = `синергия с ${partner}: +${s.bonus} к «${ind.name}»`
    }
  }
  if (chosen) return { ok: false, reason: null, inPlan: chosen.districtId ?? null, synergyHint }
  if (decisions.length >= catalog.rules.decisions)
    return { ok: false, reason: 'все пять решений заняты', inPlan: false, synergyHint }
  const sameDirection = decisions.filter((d) => catalog.measures.find((x) => x.id === d.measureId)?.directionId === m.directionId).length
  if (sameDirection >= catalog.rules.maxPerDirection) {
    const dir = catalog.directions.find((d) => d.id === m.directionId)!
    return { ok: false, reason: `направление «${dir.name}» заполнено: ${sameDirection} из ${catalog.rules.maxPerDirection}`, inPlan: false, synergyHint }
  }
  for (const inc of catalog.incompatibilities) {
    if (inc.scope !== 'any') continue
    const other = inc.a === m.id ? inc.b : inc.b === m.id ? inc.a : null
    if (other && ids.has(other)) return { ok: false, reason: `несовместимо с ${other}: ${inc.reason}`, inPlan: false, synergyHint }
  }
  if (m.cost > remainingBudget)
    return { ok: false, reason: `не хватает бюджета: нужно ${m.cost}, осталось ${Math.max(0, remainingBudget)}`, inPlan: false, synergyHint }
  return { ok: true, reason: null, inPlan: false, synergyHint }
}

/** Показатель, на который мера влияет сильнее всего: по нему подсказываем район. */
export function primaryIndicator(m: Measure): IndicatorId {
  let best: IndicatorId | null = null
  let bestV = -Infinity
  for (const [k, v] of Object.entries(m.effects) as [IndicatorId, number][]) if (v > bestV) { bestV = v; best = k }
  return best!
}

export interface DistrictOption {
  districtId: DistrictId
  value: number
  isWorst: boolean
  blockedReason: string | null
}

export function districtOptions(catalog: Catalog, m: Measure, decisions: Decision[], currentValues: Record<DistrictId, Record<IndicatorId, number>>): DistrictOption[] {
  const ind = primaryIndicator(m)
  const where = new Map(decisions.map((d) => [d.measureId, d.districtId]))
  const values = catalog.districts.map((d) => ({ districtId: d.id, value: currentValues[d.id][ind] }))
  const worst = Math.min(...values.map((v) => v.value))
  return values.map((v) => {
    let blockedReason: string | null = null
    for (const inc of catalog.incompatibilities) {
      if (inc.scope !== 'sameDistrict') continue
      const other = inc.a === m.id ? inc.b : inc.b === m.id ? inc.a : null
      if (other && where.has(other) && where.get(other) === v.districtId) blockedReason = `${other} уже здесь: ${inc.reason}`
    }
    return { ...v, isWorst: v.value === worst, blockedReason }
  })
}
