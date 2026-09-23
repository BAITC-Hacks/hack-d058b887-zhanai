const nf = (digits: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const NF1 = nf(1)
const NF2 = nf(2)
const NF0 = nf(0)

/** Настоящий минус вместо дефиса, чтобы «−2,5» читалось как число. */
const minus = (s: string) => s.replace('-', '−')

export const f0 = (n: number) => minus(NF0.format(n))
export const f1 = (n: number) => minus(NF1.format(n))
export const f2 = (n: number) => minus(NF2.format(n))

/** Дельта со знаком: «+3,99», «−0,50», «0,00»; с digits = 0 — «−10», «+5», «0». */
export function signed(n: number, digits: 0 | 1 | 2 = 2) {
  const fmt = digits === 0 ? NF0 : digits === 1 ? NF1 : NF2
  if (Math.abs(n) < 0.5 * 10 ** -digits) return fmt.format(0)
  const abs = fmt.format(Math.abs(n))
  return n > 0 ? `+${abs}` : `−${abs}`
}

/** Изменение показателя: целое — без дробной части («−2», «+12»), иначе один знак («+4,5»). */
export const signedDelta = (n: number) => (Number.isInteger(n) ? signed(n, 0) : signed(n, 1))

export function pluralRu(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** «эффект с 3-го квартала» для лага 2, «сразу» для лага 0. */
export function lagText(lag: number, horizon: number) {
  if (lag <= 0) return `сразу, ${horizon}/${horizon} эффекта`
  return `с ${lag + 1}-го квартала, ${horizon - lag}/${horizon} эффекта`
}
