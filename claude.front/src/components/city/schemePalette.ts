import type { DistrictId } from '../../data/dataset'

// Exact district colours from Astana Scheme/index.html.
export const SCHEME_PALETTE: Record<DistrictId, { base: string; strong: string }> = {
  esil: { base: '#BFD8E4', strong: '#1F7FA6' },
  almaty: { base: '#EFD3AE', strong: '#A8661A' },
  saryarka: { base: '#CFE2C4', strong: '#3F7A37' },
  baikonur: { base: '#D8CFEA', strong: '#6E56A8' },
  nura: { base: '#F0C9C4', strong: '#A4463F' },
}

function blendHex(base: string, strong: string, amount: number) {
  const t = Math.max(0, Math.min(1, amount))
  const channels = [1, 3, 5].map((i) => {
    const from = Number.parseInt(base.slice(i, i + 2), 16)
    const to = Number.parseInt(strong.slice(i, i + 2), 16)
    return Math.round(from + (to - from) * t).toString(16).padStart(2, '0')
  })
  return `#${channels.join('')}`
}

export function schemeDistrictFill(id: DistrictId, before: number, after: number, selected: boolean) {
  const { base, strong } = SCHEME_PALETTE[id]
  if (selected) return strong
  const improvement = Math.max(0, after - before)
  if (improvement === 0) return base
  return blendHex(base, strong, Math.min(0.85, 0.18 + improvement / 4 * 0.7))
}
