import { clsx } from 'clsx'
import { TriangleAlert } from 'lucide-react'
import type { Catalog, DistrictId } from '../../data/dataset'
import type { DistrictResult } from '../../api'
import { ASTANA_DISTRICTS, ASTANA_VIEWBOX } from '../../data/astanaGeometry'
import { f1, signed } from '../../lib/format'
import { SectionTitle } from '../ui'

// Реальные границы пяти районов (OpenStreetMap, упрощено ~40 м), см.
// data/astanaGeometry.ts. У каждого района свой цвет (как в Astana Scheme):
// спокойный в обычном состоянии, насыщенный у выбранного. Изменение оценки
// района показывается на подписи-«таблетке»; она же кнопка выбора района.

export const DISTRICT_COLORS: Record<DistrictId, { base: string; strong: string }> = {
  esil: { base: '#BFD8E4', strong: '#1F7FA6' },
  almaty: { base: '#EFD3AE', strong: '#A8661A' },
  saryarka: { base: '#CFE2C4', strong: '#3F7A37' },
  baikonur: { base: '#D8CFEA', strong: '#6E56A8' },
  nura: { base: '#F0C9C4', strong: '#A4463F' },
}

interface Props {
  catalog: Catalog
  districts: DistrictResult[]
  showAfter: boolean
  selected: DistrictId | null
  onSelect: (id: DistrictId) => void
}

const { width: VW, height: VH } = ASTANA_VIEWBOX

export function CityMap({ catalog, districts, showAfter, selected, onSelect }: Props) {
  const items = catalog.districts.flatMap((d) => {
    const r = districts.find((x) => x.districtId === d.id)
    if (!r) return []
    const value = showAfter ? r.afterScore : r.beforeScore
    const crit = showAfter ? r.criticalAfter.length : r.criticalBefore.length
    return [{ d, r, value, crit, delta: r.afterScore - r.beforeScore, isSel: selected === d.id }]
  })
  // Выбранный район рисуем последним, чтобы его обводку не перекрывали соседи.
  const shapes = [...items].sort((a, b) => Number(a.isSel) - Number(b.isSel))

  return (
    <section aria-label="Карта районов" className="card city-map-card p-4">
      <SectionTitle aside={selected ? 'нажмите ещё раз, чтобы снять выбор' : undefined}>Город</SectionTitle>

      <div className="astana-map" role="group" aria-label="Пять районов Астаны">
        <span className="astana-brand" aria-hidden="true">АСТАНА</span>
        <svg viewBox={`0 0 ${VW} ${VH}`} className="block h-auto w-full" aria-hidden="true">
          {shapes.map(({ d, isSel }) => (
            <path
              key={d.id}
              d={ASTANA_DISTRICTS[d.id].path}
              fill={isSel ? DISTRICT_COLORS[d.id].strong : DISTRICT_COLORS[d.id].base}
              stroke="#ffffff"
              strokeWidth={isSel ? 3.5 : 2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="astana-dist"
              onClick={() => onSelect(d.id)}
            />
          ))}
        </svg>

        {items.map(({ d, r, value, crit, delta, isSel }) => {
          const [lx, ly] = ASTANA_DISTRICTS[d.id].label
          const showDelta = showAfter && Math.abs(delta) >= 0.05
          return (
            <button
              key={d.id}
              type="button"
              className="astana-pill"
              style={{ left: `${(lx / VW) * 100}%`, top: `${(ly / VH) * 100}%`, ...(isSel ? { borderColor: DISTRICT_COLORS[d.id].strong, color: DISTRICT_COLORS[d.id].strong } : {}) }}
              aria-pressed={isSel}
              aria-label={`${d.name}: оценка ${showAfter ? `${f1(r.beforeScore)} → ${f1(r.afterScore)}` : f1(value)}${crit ? `, критических показателей ${crit}` : ''}`}
              onClick={() => onSelect(d.id)}
            >
              <span className="astana-pill-name">
                {d.name}
                {crit > 0 && (
                  <span className="astana-pill-crit" title={`${crit} критич.`}>
                    <TriangleAlert className="size-2.5" strokeWidth={2.6} aria-hidden="true" />
                    {crit}
                  </span>
                )}
              </span>
              <span className="astana-pill-score">
                {showAfter ? `${f1(r.beforeScore)} → ${f1(r.afterScore)}` : f1(value)}
                {showDelta && (
                  <span className={clsx('ml-1 font-semibold', delta > 0 ? 'text-up' : 'text-down')}>{signed(delta, 1)}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-3">
        {showAfter ? 'на подписи: оценка района до → после плана' : 'на подписи: оценка района сейчас'} · нажмите район, чтобы увидеть 10 показателей · границы: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">OpenStreetMap contributors, ODbL</a>
      </p>
    </section>
  )
}
