import { clsx } from 'clsx'
import { useEffect, useState, type DragEvent } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { Catalog, Decision, DistrictId } from '../../data/dataset'
import type { DistrictResult, IndicatorValues } from '../../api'
import { decisionUnavailableReason, districtOptions, primaryIndicator } from '../../lib/availability'
import { readMeasureDrag } from '../../lib/measureDrag'
import { DISTRICT_SCALE_MAX, DISTRICT_SCALE_MIN, DISTRICT_SCALE_STEPS, districtFill, isDarkFill } from '../../lib/scales'
import { f1 } from '../../lib/format'
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
  draggedMeasureId?: string | null
  decisions?: Decision[]
  remainingBudget?: number
  currentValues?: Record<DistrictId, IndicatorValues>
  onDropMeasure?: (measureId: string, districtId: DistrictId | null) => void
}

export function CityMap({ catalog, districts, showAfter, selected, onSelect, draggedMeasureId = null, decisions = [], remainingBudget = catalog.rules.budget, currentValues, onDropMeasure }: Props) {
  const [hovered, setHovered] = useState<DistrictId | null>(null)
  const [focused, setFocused] = useState<DistrictId | null>(null)
  const [dropError, setDropError] = useState<string | null>(null)
  const measure = catalog.measures.find((m) => m.id === draggedMeasureId)
  useEffect(() => {
    setHovered(null)
    if (!draggedMeasureId) return
    // Captured mouse events keep targeting the source card; hit-test the real
    // pointer location to keep district feedback accurate during that gesture.
    const trackPointer = (event: PointerEvent) => {
      const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest('[data-district-id]')
      const id = target?.getAttribute('data-district-id')
      setHovered(catalog.districts.find((district) => district.id === id)?.id ?? null)
      setDropError(null)
    }
    window.addEventListener('pointermove', trackPointer)
    return () => window.removeEventListener('pointermove', trackPointer)
  }, [draggedMeasureId, catalog.districts])
  const values = currentValues ?? Object.fromEntries(catalog.districts.map((d) => [d.id, districts.find((r) => r.districtId === d.id)?.afterIndicators ?? d.indicators])) as Record<DistrictId, IndicatorValues>
  const targets = measure?.scope === 'district' ? districtOptions(catalog, measure, decisions, values, remainingBudget) : []
  const targetReason = (id: DistrictId | null) => measure
    ? decisionUnavailableReason(catalog, { measureId: measure.id, districtId: measure.scope === 'city' ? null : id }, decisions, remainingBudget)
    : null
  const hoveredReason = hovered ? targetReason(hovered) : null
  const drop = (e: DragEvent, districtId: DistrictId | null) => {
    e.preventDefault()
    e.stopPropagation()
    const measureId = readMeasureDrag(e.dataTransfer)
    if (!measureId || measureId !== draggedMeasureId) return
    const dropped = catalog.measures.find((m) => m.id === measureId)
    const destination = dropped?.scope === 'city' ? null : districtId
    const reason = decisionUnavailableReason(catalog, { measureId, districtId: destination }, decisions, remainingBudget)
    setHovered(null)
    setDropError(reason)
    if (!reason) onDropMeasure?.(measureId, destination)
  }
  const recommended = targets.find((t) => t.isWorst)
  const activeHint = !measure ? null : measure.scope === 'city'
    ? `${measure.id} · ${measure.name}: ${targetReason(null) ?? 'отпустите в любом месте карты — мера применяется ко всему городу'}.`
    : hovered
      ? `${catalog.districts.find((d) => d.id === hovered)?.name}: ${hoveredReason ?? 'отпустите, чтобы добавить меру'}.`
      : `${measure.id}: перенесите на район.${recommended ? ` Нужнее всего: ${catalog.districts.find((d) => d.id === recommended.districtId)?.name} (${primaryIndicator(measure)}: ${f1(recommended.value)}).` : ''} Esc — отмена.`
  return (
    <section aria-label="Схема районов" className="card p-4">
      <SectionTitle aside={showAfter ? 'оценка района: до → после плана' : 'оценка района сейчас'}>Город</SectionTitle>
      <svg
        data-city-map="true"
        viewBox="0 0 400 250"
        className={clsx('block w-full rounded-lg', measure && 'outline-2 outline-offset-4 outline-accent/40')}
        role="group"
        aria-label="Пять районов Астаны, схема"
        onDragOver={(e) => {
          if (!measure) return
          setDropError(null)
          if (measure.scope === 'city') { e.preventDefault(); e.dataTransfer.dropEffect = targetReason(null) ? 'none' : 'copy' }
        }}
        onDragLeave={(e) => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setHovered(null) }}
        onDrop={(e) => drop(e, null)}
      >
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
          const isSel = selected === d.id
          const target = targets.find((t) => t.districtId === d.id)
          const blocked = measure ? targetReason(d.id) : null
          const isHovered = !!measure && hovered === d.id
          const stroke = measure ? blocked ? '#ad3333' : '#2563eb' : focused === d.id ? '#2563eb' : isSel ? '#0b0b0b' : '#f9f9f7'
          return (
            <g
              key={d.id}
              role="button"
              tabIndex={0}
              aria-label={`${d.name}: оценка ${f1(value)}${crit ? `, критических показателей ${crit}` : ''}${measure ? `; ${blocked ?? (target?.isWorst ? 'мера нужнее всего здесь' : 'можно добавить меру')}` : ''}`}
              aria-pressed={isSel}
              className="cursor-pointer outline-none"
              data-district-id={d.id}
              data-drop-state={measure ? blocked ? 'blocked' : 'allowed' : undefined}
              onFocus={() => setFocused(d.id)}
              onBlur={() => setFocused(null)}
              onClick={() => onSelect(d.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(d.id) } }}
              onDragEnter={() => { if (measure) { setHovered(d.id); setDropError(null) } }}
              onDragOver={(e) => {
                if (!measure) return
                e.preventDefault()
                e.stopPropagation()
                setHovered(d.id)
                e.dataTransfer.dropEffect = blocked ? 'none' : 'copy'
              }}
              onDrop={(e) => drop(e, d.id)}
            >
              <title>{measure ? blocked ?? `Добавить ${measure.id}${measure.scope === 'city' ? ' для всего города' : ` в район ${d.name}`}` : `${d.name}: нажмите, чтобы увидеть все показатели`}</title>
              <polygon
                points={SHAPES[d.id].points}
                fill={fill}
                stroke={stroke}
                strokeWidth={isHovered || focused === d.id ? 4 : isSel || measure ? 2.5 : 2}
                strokeDasharray={blocked ? '4 3' : undefined}
                strokeLinejoin="round"
                className="transition-[fill] duration-500"
              />
              <text x={lx} y={ly - 6} textAnchor="middle" fontSize="15" fontWeight="600" fill={ink}>{d.name}</text>
              <text x={lx} y={ly + 10} textAnchor="middle" fontSize="12.5" fill={ink2} className="tnum">
                {showAfter ? `${f1(r.beforeScore)} → ${f1(r.afterScore)}` : f1(value)}
              </text>
              {measure ? (
                <g transform={`translate(${lx - 41}, ${ly + 16})`} aria-hidden="true">
                  <rect width="82" height="15" rx="4" fill={blocked ? '#fbe9e9' : '#e9f0ff'} />
                  <text x="41" y="11" textAnchor="middle" fontSize="9.5" fontWeight="600" fill={blocked ? '#7a1f1f' : '#1d4ed8'}>
                    {blocked ? 'недоступно' : target?.isWorst ? 'нужнее всего' : 'можно добавить'}
                  </text>
                </g>
              ) : crit > 0 && (
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
        <g pointerEvents="none" aria-hidden="true">
          <path d="M14 150 C 90 142, 150 160, 210 152 S 330 146, 386 150" fill="none" stroke="#f9f9f7" strokeWidth="9" strokeLinecap="round" />
          <path d="M14 150 C 90 142, 150 160, 210 152 S 330 146, 386 150" fill="none" stroke="#c3c2b7" strokeWidth="1" strokeLinecap="round" />
          <text x="18" y="146" fontSize="9" fill="#898781">р. Есиль</text>
        </g>
      </svg>

      <p role="status" aria-live="polite" className={clsx('mt-2 min-h-5 text-[12px] leading-relaxed', hoveredReason || dropError ? 'text-critical' : 'text-ink-2')}>
        {activeHint ?? dropError ?? (decisions.length === 5 ? 'Пять решений на карте. Нажмите район, чтобы сравнить показатели.' : 'Начните с районов, где есть критические показатели.')}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-ink-3">
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
