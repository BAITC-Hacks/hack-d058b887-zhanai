// Текстовые помощники для панелей результата и AI-анализа.

import type { Catalog, Decision, DistrictId, IndicatorId } from '../data/dataset'

/**
 * Приводит числа в тексте модели к русской записи: «52.56» → «52,56»,
 * «-0.50» → «−0,50», «62.50%» → «62,50 %». Коды вроде «M10» и «S1» не трогает:
 * точка меняется только между двумя цифрами.
 */
export function ruNumbers(text: string): string {
  return text
    .replace(/(\d)\.(?=\d)/g, '$1,')
    .replace(/(^|[\s(«:;—–])-(?=\d)/g, '$1−')
    .replace(/(\d)[  ]?%/g, '$1 %')
}

/** Число в уже «русифицированном» тексте: знак, целая часть, дробь через запятую, проценты. */
const NUMBER_SRC = String.raw`(?<![\p{L}\p{N}_.,])[+−]?\d+(?:,\d+)?(?: %)?(?![\p{L}\p{N}])`
const NUMBER_SPLIT = new RegExp(`(${NUMBER_SRC})`, 'u')

export interface TextPart {
  text: string
  num: boolean
}

/** Режет текст на куски «текст / число», чтобы числа можно было выделить. */
export function splitNumbers(text: string): TextPart[] {
  return text
    .split(NUMBER_SPLIT)
    .map((part, i) => ({ text: part, num: i % 2 === 1 }))
    .filter((p) => p.text !== '')
}

/** Строчная первая буква, если это не аббревиатура («Безопасность улиц» → «безопасность улиц», «ЛРТ» остаётся). */
export function lcFirst(s: string): string {
  if (s.length < 2) return s.toLowerCase()
  const second = s[1]
  return second === second.toLowerCase() && second !== second.toUpperCase() ? s[0].toLowerCase() + s.slice(1) : s
}

/** Короткое имя меры: без уточнений в скобках и после косой черты. */
export function shortMeasureName(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, '').replace(/\s*\/.*$/, '').trim() || name
}

export function measureName(catalog: Catalog, id: string, short = true): string {
  const m = catalog.measures.find((x) => x.id === id)
  if (!m) return id
  return short ? shortMeasureName(m.name) : m.name
}

export function indicatorName(catalog: Catalog, id: IndicatorId): string {
  return catalog.indicators.find((i) => i.id === id)?.name ?? id
}

export function districtName(catalog: Catalog, id: DistrictId | null | undefined): string {
  return (id && catalog.districts.find((d) => d.id === id)?.name) || 'весь город'
}

/** «в Нуре», «в районе Алматы»; для городской меры — «по всему городу». */
export function districtLocative(catalog: Catalog, id: DistrictId | null | undefined): string {
  return (id && catalog.districts.find((d) => d.id === id)?.locative) || 'по всему городу'
}

const sameDecision = (a: Decision, b: Decision) => a.measureId === b.measureId && (a.districtId ?? null) === (b.districtId ?? null)

export function hasDecision(decisions: Decision[], d: Decision): boolean {
  return decisions.some((x) => sameDecision(x, d))
}

/** План, в котором мера `remove` заменена на `add`. */
export function replaceDecision(decisions: Decision[], remove: Decision, add: Decision): Decision[] {
  return decisions.map((d) => (sameDecision(d, remove) ? add : d))
}

/** «Замените «Чистое топливо…» в Сарыарке на «Линия ЛРТ» в Нуре». */
export function swapPhrase(catalog: Catalog, remove: Decision, add: Decision): string {
  const from = `«${measureName(catalog, remove.measureId)}»${remove.districtId ? ` ${districtLocative(catalog, remove.districtId)}` : ''}`
  const to = `«${measureName(catalog, add.measureId)}» ${districtLocative(catalog, add.districtId)}`
  return `Замените ${from} на ${to}`
}
