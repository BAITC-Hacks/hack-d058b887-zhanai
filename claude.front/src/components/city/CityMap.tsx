import { clsx } from 'clsx'
import { useEffect, useState, type DragEvent } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { Catalog, Decision, DistrictId } from '../../data/dataset'
import type { DistrictResult, IndicatorValues } from '../../api'
import { decisionUnavailableReason, districtOptions, primaryIndicator } from '../../lib/availability'
import { readMeasureDrag } from '../../lib/measureDrag'
import { isDarkFill } from '../../lib/scales'
import { f1 } from '../../lib/format'
import { SectionTitle } from '../ui'
import { ASTANA_DISTRICT_GEOMETRY } from './geoAstana'
import { SCHEME_PALETTE, schemeDistrictFill } from './schemePalette'

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
    <section aria-label="Карта районов" className="card city-map-card p-4">
      <SectionTitle aside={showAfter ? 'оценка района: до → после плана' : 'оценка района сейчас'}>Город</SectionTitle>
      <div className="city-map-viewport">
      <div className="scheme-map-wrap">
      <svg
        data-city-map="true"
        viewBox="0 0 960 960"
        preserveAspectRatio="xMidYMid meet"
        className={clsx('scheme-map-svg block h-full w-full', measure && 'outline-2 outline-offset-4 outline-accent/40')}
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
          const isSel = selected === d.id
          const strong = SCHEME_PALETTE[d.id].strong
          const fill = schemeDistrictFill(d.id, r.beforeScore, value, isSel)
          const crit = showAfter ? r.criticalAfter.length : r.criticalBefore.length
          const { path } = ASTANA_DISTRICT_GEOMETRY[d.id]
          const target = targets.find((t) => t.districtId === d.id)
          const blocked = measure ? targetReason(d.id) : null
          const isHovered = !!measure && hovered === d.id
          const stroke = measure ? blocked ? '#A4463F' : strong : focused === d.id ? '#16252A' : '#ffffff'
          return (
            <g
              key={d.id}
              role="button"
              tabIndex={0}
              aria-label={`${d.name}: оценка ${f1(value)}${crit ? `, критических показателей ${crit}` : ''}${measure ? `; ${blocked ?? (target?.isWorst ? 'мера нужнее всего здесь' : 'можно добавить меру')}` : ''}`}
              aria-pressed={isSel}
              className="scheme-district cursor-pointer outline-none"
              opacity={selected && !isSel && !measure ? 0.6 : 1}
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
                strokeWidth={isHovered || focused === d.id ? 6 : isSel || measure ? 4 : 2.5}
                strokeDasharray={blocked ? '7 5' : undefined}
                strokeLinejoin="round"
                className="scheme-district-path"
              />
            </g>
          )
        })}
      </svg>
      <span className="scheme-brand" aria-hidden="true">АСТАНА</span>
      <div className="scheme-map-labels" aria-hidden="true">
        {catalog.districts.map((d) => {
          const r = districts.find((x) => x.districtId === d.id)
          if (!r) return null
          const isSel = selected === d.id
          const strong = SCHEME_PALETTE[d.id].strong
          const fill = schemeDistrictFill(d.id, r.beforeScore, showAfter ? r.afterScore : r.beforeScore, isSel)
          const dark = isDarkFill(fill)
          const crit = showAfter ? r.criticalAfter.length : r.criticalBefore.length
          const [lx, ly] = ASTANA_DISTRICT_GEOMETRY[d.id].label
          const blocked = measure ? targetReason(d.id) : null
          const target = targets.find((t) => t.districtId === d.id)
          return (
            <div
              key={d.id}
              className={clsx('scheme-map-label', isSel && 'is-selected')}
              data-scheme-district={d.id}
              style={{ left: `${lx / 9.6}%`, top: `${ly / 9.6}%`, opacity: selected && !isSel && !measure ? 0.6 : 1 }}
            >
              <span className="scheme-map-pill" style={isSel ? { color: strong, borderColor: strong } : undefined}>{d.name}</span>
              <span className="scheme-map-score tnum" style={{ color: dark ? '#ffffff' : '#16252A' }}>
                {showAfter ? `${f1(r.beforeScore)} → ${f1(r.afterScore)}` : f1(r.beforeScore)}
              </span>
              {measure ? (
                <span className={clsx('scheme-map-note', blocked && 'is-blocked')}>
                  {blocked ? 'недоступно' : target?.isWorst ? 'нужнее всего' : 'можно добавить'}
                </span>
              ) : crit > 0 ? (
                <span className="scheme-map-note is-critical"><TriangleAlert size={12} aria-hidden="true" />{crit} критич.</span>
              ) : null}
            </div>
          )
        })}
      </div>
      </div>
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
              style={selected === d.id ? { borderColor: SCHEME_PALETTE[d.id].strong, color: SCHEME_PALETTE[d.id].strong } : undefined}
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
        <span>Цвета районов — Astana Scheme · насыщенность показывает эффект, выбор выделен отдельно</span>
        <span className={clsx(selected && 'text-ink-2')}>упрощённые границы · нажмите район, чтобы увидеть 10 показателей · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">OpenStreetMap contributors, ODbL</a></span>
      </div>
    </section>
  )
}
