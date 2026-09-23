// Цвета направлений повторяют пять насыщенных оттенков Astana Scheme.
// Состояния по-прежнему сопровождаются текстом, а не передаются только цветом.

import type { DirectionId } from '../data/dataset'

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
  transport: '#1F7FA6',
  safety: '#A4463F',
  ecology: '#3F7A37',
  services: '#6E56A8',
  social: '#A8661A',
}
