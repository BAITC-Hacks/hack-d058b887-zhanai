import { clsx } from 'clsx'
import { TriangleAlert } from 'lucide-react'
import type { Catalog, DistrictId } from '../../data/dataset'
import type { DistrictResult } from '../../api'
import { DISTRICT_SCALE_MAX, DISTRICT_SCALE_MIN, DISTRICT_SCALE_STEPS, districtFill, isDarkFill } from '../../lib/scales'
import { f1, signed } from '../../lib/format'
import { SectionTitle } from '../ui'

// Схематичные контуры пяти районов: правый берег сверху, левый снизу, между
// ними река Есиль. Это схема, а не географическая карта.
const SHAPES: Record<DistrictId, { points: string; label: [number, number] }> = {
  baikonur: { points: '22,18 378,18 382,74 300,82 200,76 100,84 18,72', label: [200, 50] },
  saryarka: { points: '18,72 100,84 200,76 202,142 120,150 16,140', label: [108, 113] },
  almaty: { points: '200,76 300,82 382,74 384,142 300,150 202,142', label: [292, 113] },
  esil: { points: '150,164 300,158 384,156 382,232 300,238 150,236', label: [268, 200] },
  nura: { points: '16,158 150,164 150,236 80,242 18,232', label: [82, 200] },
}

interface Props {
  catalog: Catalog
  districts: DistrictResult[]
  showAfter: boolean
  selected: DistrictId | null
  onSelect: (id: DistrictId) => void
}

export function CityMap({ catalog, districts, showAfter, selected, onSelect }: Props) {
  return (
    <section aria-label="Схема районов" className="card p-4">
      <SectionTitle aside={showAfter ? 'оценка района: до → после плана' : 'оценка района сейчас'}>Город</SectionTitle>
      <svg viewBox="0 0 400 250" className="block w-full" role="group" aria-label="Пять районов Астаны, схема">
        {catalog.districts.map((d) => {
          const r = districts.find((x) => x.districtId === d.id)
          if (!r) return null
          const value = showAfter ? r.afterScore : r.beforeScore
          const fill = districtFill(value)
          const dark = isDarkFill(fill)
          const ink = dark ? '#ffffff' : '#0b0b0b'
          const ink2 = dark ? 'rgba(255,255,255,0.82)' : '#52514e'
          const crit = showAfter ? r.criticalAfter.length : r.criticalBefore.length
          const [lx, ly] = SHAPES[d.id].label
          const delta = r.afterScore - r.beforeScore
          const isSel = selected === d.id
          return (
            <g
              key={d.id}
              role="button"
              tabIndex={0}
              aria-label={`${d.name}: оценка ${f1(value)}${crit ? `, критических показателей ${crit}` : ''}`}
              aria-pressed={isSel}
              className="cursor-pointer outline-none"
              onClick={() => onSelect(d.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(d.id) } }}
            >
              <polygon
                points={SHAPES[d.id].points}
                fill={fill}
                stroke={isSel ? '#0b0b0b' : '#f9f9f7'}
                strokeWidth={isSel ? 2.5 : 2}
                strokeLinejoin="round"
                className="transition-[fill] duration-500"
              />
              <text x={lx} y={ly - 6} textAnchor="middle" fontSize="13" fontWeight="600" fill={ink}>{d.name}</text>
              <text x={lx} y={ly + 10} textAnchor="middle" fontSize="11.5" fill={ink2} className="tnum">
                {showAfter ? `${f1(r.beforeScore)} → ${f1(r.afterScore)}` : f1(value)}
                {showAfter && Math.abs(delta) >= 0.05 ? `  ${signed(delta, 1)}` : ''}
              </text>
              {crit > 0 && (
                <g transform={`translate(${lx - 34}, ${ly + 16})`}>
                  <rect width="68" height="15" rx="4" fill="#fbe9e9" stroke="#d03b3b" strokeWidth="0.75" />
                  <TriangleAlert x={4} y={2.5} width={10} height={10} color="#7a1f1f" strokeWidth={2.4} />
                  <text x="17" y="11" fontSize="9.5" fontWeight="600" fill="#7a1f1f">
                    {crit} критич.
                  </text>
                </g>
              )}
            </g>
          )
        })}
        <path d="M14 150 C 90 142, 150 160, 210 152 S 330 146, 386 150" fill="none" stroke="#f9f9f7" strokeWidth="9" strokeLinecap="round" />
        <path d="M14 150 C 90 142, 150 160, 210 152 S 330 146, 386 150" fill="none" stroke="#c3c2b7" strokeWidth="1" strokeLinecap="round" />
        <text x="18" y="146" fontSize="9" fill="#898781">р. Есиль</text>
      </svg>

      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ink-3">
        <div className="flex items-center gap-2">
          <span className="tnum">{DISTRICT_SCALE_MIN}</span>
          <div className="flex h-2 overflow-hidden rounded-sm" aria-hidden="true">
            {DISTRICT_SCALE_STEPS.map((c) => <span key={c} className="w-2" style={{ background: c }} />)}
          </div>
          <span className="tnum">{DISTRICT_SCALE_MAX}</span>
          <span>темнее = выше оценка района</span>
        </div>
        <span className={clsx(selected && 'text-ink-2')}>схема, не карта · нажмите район, чтобы увидеть 10 показателей</span>
      </div>
    </section>
  )
}
