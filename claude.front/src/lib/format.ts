const nf = (digits: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const NF1 = nf(1)
const NF2 = nf(2)
const NF0 = nf(0)

/** Настоящий минус вместо дефиса, чтобы «−2,5» читалось как число. */
const minus = (s: string) => s.replace('-', '−')

export const f0 = (n: number) => minus(NF0.format(n))
export const f1 = (n: number) => minus(NF1.format(n))
export const f2 = (n: number) => minus(NF2.format(n))

/** Дельта со знаком: «+3,99», «−0,50», «0,00». */
export function signed(n: number, digits = 2) {
  const abs = digits === 1 ? NF1.format(Math.abs(n)) : NF2.format(Math.abs(n))
  if (Math.abs(n) < 0.5 * 10 ** -digits) return digits === 1 ? '0,0' : '0,00'
  return n > 0 ? `+${abs}` : `−${abs}`
}

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
