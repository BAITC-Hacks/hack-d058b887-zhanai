// Цветовые шкалы по методике dataviz: величина — один оттенок (синий) от
// светлого к тёмному; состояние — зарезервированные статусные цвета, всегда
// вместе с иконкой и подписью.

import type { DirectionId } from '../data/dataset'

/** Последовательная синяя шкала, шаги 100…700. */
const BLUE_STEPS = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

/** Диапазон оценок районов в датасете узкий (около 49–63), поэтому шкала 45–70. */
export const DISTRICT_SCALE_MIN = 45
export const DISTRICT_SCALE_MAX = 70

export function districtFill(score: number) {
  const t = Math.min(1, Math.max(0, (score - DISTRICT_SCALE_MIN) / (DISTRICT_SCALE_MAX - DISTRICT_SCALE_MIN)))
  return BLUE_STEPS[Math.round(t * (BLUE_STEPS.length - 1))]
}

export const DISTRICT_SCALE_STEPS = BLUE_STEPS

/** Относительная яркость по sRGB, чтобы выбрать цвет текста внутри заливки. */
export function isDarkFill(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  return l < 0.35
}

export type IndicatorBand = 'critical' | 'low' | 'ok' | 'good'

export function indicatorBand(value: number, criticalThreshold: number): IndicatorBand {
  if (value < criticalThreshold) return 'critical'
  if (value < 55) return 'low'
  if (value < 70) return 'ok'
  return 'good'
}

export const BAND_LABEL: Record<IndicatorBand, string> = {
  critical: 'критично',
  low: 'низко',
  ok: 'норма',
  good: 'хорошо',
}

/** Фиксированный порядок категорий по палитре: цвет следует за сущностью. */
export const DIRECTION_COLOR: Record<DirectionId, string> = {
  transport: '#2a78d6',
  safety: '#eb6834',
  ecology: '#1baf7a',
  services: '#eda100',
  social: '#e87ba4',
}
