import { clsx } from 'clsx'
import { TriangleAlert } from 'lucide-react'
import type { Catalog, DistrictId } from '../../data/dataset'
import type { DistrictResult } from '../../api'
import { ASTANA_DISTRICTS, ASTANA_VIEWBOX } from '../../data/astanaGeometry'
import { DISTRICT_SCALE_MAX, DISTRICT_SCALE_MIN, DISTRICT_SCALE_STEPS, districtFill } from '../../lib/scales'
import { f1, signed } from '../../lib/format'
import { SectionTitle } from '../ui'

// Реальные границы пяти районов (OpenStreetMap, упрощено ~40 м), см.
// data/astanaGeometry.ts. Заливка — оценка района (темнее = выше), подписи —
// HTML-«таблетки» поверх SVG: они же кнопки выбора района.

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
    <section aria-label="Карта районов" className="card p-4">
      <SectionTitle aside={showAfter ? 'оценка района: до → после плана' : 'оценка района сейчас'}>Город</SectionTitle>

      <div className="astana-map" role="group" aria-label="Пять районов Астаны">
        <svg viewBox={`0 0 ${VW} ${VH}`} className="block h-auto w-full" aria-hidden="true">
          {shapes.map(({ d, value, isSel }) => (
            <path
              key={d.id}
              d={ASTANA_DISTRICTS[d.id].path}
              fill={districtFill(value)}
              stroke={isSel ? '#0b0b0b' : '#ffffff'}
              strokeWidth={isSel ? 3 : 2}
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
              style={{ left: `${(lx / VW) * 100}%`, top: `${(ly / VH) * 100}%` }}
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <div className="flex items-center gap-2">
          <span className="tnum">{DISTRICT_SCALE_MIN}</span>
          <div className="flex h-2 overflow-hidden rounded-sm" aria-hidden="true">
            {DISTRICT_SCALE_STEPS.map((c) => <span key={c} className="w-2" style={{ background: c }} />)}
          </div>
          <span className="tnum">{DISTRICT_SCALE_MAX}</span>
          <span>темнее = выше оценка района</span>
        </div>
        <span className={clsx(selected && 'text-ink-2')}>границы районов: © OpenStreetMap · нажмите район, чтобы увидеть 10 показателей</span>
      </div>
    </section>
  )
}
