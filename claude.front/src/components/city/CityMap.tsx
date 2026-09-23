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
import { ASTANA_DISTRICT_GEOMETRY } from './geoAstana'

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
    <section aria-label="Карта районов" className="card p-4">
      <SectionTitle aside={showAfter ? 'оценка района: до → после плана' : 'оценка района сейчас'}>Город</SectionTitle>
      <div className="city-map-viewport">
      <svg
        data-city-map="true"
        viewBox="80 50 780 900"
        preserveAspectRatio="xMidYMid meet"
        className={clsx('block h-full w-full rounded-lg', measure && 'outline-2 outline-offset-4 outline-accent/40')}
        role="group"
        aria-label="Упрощённые границы пяти районов Астаны"
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
          const { path, label: [lx, ly] } = ASTANA_DISTRICT_GEOMETRY[d.id]
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
              <path
                d={path}
                fill={fill}
                stroke={stroke}
                strokeWidth={isHovered || focused === d.id ? 6 : isSel || measure ? 4 : 3}
                strokeDasharray={blocked ? '7 5' : undefined}
                strokeLinejoin="round"
                className="transition-[fill] duration-500"
              />
              <text x={lx} y={ly - 9} textAnchor="middle" fontSize="30" fontWeight="600" fill={ink}>{d.name}</text>
              <text x={lx} y={ly + 19} textAnchor="middle" fontSize="23" fill={ink2} className="tnum">
                {showAfter ? `${f1(r.beforeScore)} → ${f1(r.afterScore)}` : f1(value)}
              </text>
              {measure ? (
                <g transform={`translate(${lx - 65}, ${ly + 29})`} aria-hidden="true">
                  <rect width="130" height="24" rx="6" fill={blocked ? '#fbe9e9' : '#e9f0ff'} />
                  <text x="65" y="17" textAnchor="middle" fontSize="15" fontWeight="600" fill={blocked ? '#7a1f1f' : '#1d4ed8'}>
                    {blocked ? 'недоступно' : target?.isWorst ? 'нужнее всего' : 'можно добавить'}
                  </text>
                </g>
              ) : crit > 0 && (
                <g transform={`translate(${lx - 52}, ${ly + 29})`}>
                  <rect width="104" height="24" rx="6" fill="#fbe9e9" stroke="#d03b3b" strokeWidth="1" />
                  <TriangleAlert x={7} y={4} width={16} height={16} color="#7a1f1f" strokeWidth={2.4} />
                  <text x="27" y="17" fontSize="15" fontWeight="600" fill="#7a1f1f">
                    {crit} критич.
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>
      </div>

      <div className="city-map-district-list" aria-label="Выбор района">
        {catalog.districts.map((d) => {
          const r = districts.find((x) => x.districtId === d.id)
          if (!r) return null
          const crit = showAfter ? r.criticalAfter.length : r.criticalBefore.length
          const blocked = measure ? targetReason(d.id) : null
          return (
            <button
              key={d.id}
              type="button"
              data-district-id={d.id}
              data-drop-state={measure ? blocked ? 'blocked' : 'allowed' : undefined}
              aria-pressed={selected === d.id}
              aria-label={`${d.name}: ${showAfter ? `${f1(r.beforeScore)} до, ${f1(r.afterScore)} после` : f1(r.beforeScore)}${crit ? `, ${crit} критических` : ''}${blocked ? `; ${blocked}` : ''}`}
              className={clsx('city-map-district-button', selected === d.id && 'is-selected')}
              onClick={() => onSelect(d.id)}
              onDragEnter={() => { if (measure) { setHovered(d.id); setDropError(null) } }}
              onDragOver={(e) => {
                if (!measure) return
                e.preventDefault()
                setHovered(d.id)
                e.dataTransfer.dropEffect = blocked ? 'none' : 'copy'
              }}
              onDrop={(e) => drop(e, d.id)}
            >
              <span className="city-map-district-name">{d.name}</span>
              <span className="tnum">{showAfter ? `${f1(r.beforeScore)} → ${f1(r.afterScore)}` : f1(r.beforeScore)}</span>
              {crit > 0 && <span className="city-map-district-critical">{crit} критич.</span>}
            </button>
          )
        })}
      </div>

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
        <span className={clsx(selected && 'text-ink-2')}>упрощённые границы · нажмите район, чтобы увидеть 10 показателей · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">OpenStreetMap contributors, ODbL</a></span>
      </div>
    </section>
  )
}
