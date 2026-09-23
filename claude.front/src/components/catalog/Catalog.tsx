import { useId, useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Check, Ban, GripVertical } from 'lucide-react'
import type { Catalog as CatalogT, Decision, DirectionId, DistrictId, IndicatorId, Measure } from '../../data/dataset'
import type { IndicatorValues } from '../../api'
import { decisionUnavailableReason, districtOptions, measureAvailability, primaryIndicator } from '../../lib/availability'
import { writeMeasureDrag } from '../../lib/measureDrag'
import { useMeasurePointerDrag } from '../../lib/useMeasurePointerDrag'
import { f1, lagText, signed } from '../../lib/format'
import { Button, Chip, DirectionDot, Hint, SectionTitle } from '../ui'

interface Props {
  id?: string
  allowDrag?: boolean
  catalog: CatalogT
  decisions: Decision[]
  remainingBudget: number
  /** Текущие значения показателей (после уже выбранных мер) для подсказки «куда нужнее». */
  currentValues: Record<DistrictId, IndicatorValues>
  onAdd: (d: Decision) => void
  onDragMeasure?: (measureId: string | null) => void
  onPointerDrop?: (measureId: string, clientX: number, clientY: number) => void
}

export function Catalog({ id = 'catalog', allowDrag = true, catalog, decisions, remainingBudget, currentValues, onAdd, onDragMeasure, onPointerDrop }: Props) {
  const [filter, setFilter] = useState<'all' | DirectionId>('all')
  const [picking, setPicking] = useState<string | null>(null)
  const pointerDrag = useMeasurePointerDrag({
    onDragMeasure: (measureId) => { if (measureId) setPicking(null); onDragMeasure?.(measureId) },
    onPointerDrop,
  })

  const counts = useMemo(() => {
    const c = Object.fromEntries(catalog.directions.map((d) => [d.id, 0])) as Record<DirectionId, number>
    for (const d of decisions) {
      const m = catalog.measures.find((x) => x.id === d.measureId)
      if (m) c[m.directionId] += 1
    }
    return c
  }, [catalog, decisions])

  const groups = catalog.directions
    .filter((d) => filter === 'all' || d.id === filter)
    .map((d) => ({ direction: d, measures: catalog.measures.filter((m) => m.directionId === d.id) }))

  const add = (m: Measure, districtId: DistrictId | null) => {
    if (decisionUnavailableReason(catalog, { measureId: m.id, districtId }, decisions, remainingBudget)) return
    onAdd({ measureId: m.id, districtId })
    setPicking(null)
  }

  return (
    <section id={id} tabIndex={-1} aria-label="Каталог мероприятий" className="flex min-h-0 flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setPicking(null) }}>
      <SectionTitle aside={`${catalog.measures.length} мер`}>Каталог мер</SectionTitle>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-2">{allowDrag ? 'Перетащите меру на район или нажмите «Выбрать район».' : 'Нажмите «Выбрать район», затем добавьте меру.'} Городские меры действуют везде.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>Все</FilterChip>
        {catalog.directions.map((d) => (
          <FilterChip key={d.id} active={filter === d.id} onClick={() => setFilter(d.id)}>
            <DirectionDot id={d.id} />
            {d.name}
            <span className={clsx('tnum', counts[d.id] >= catalog.rules.maxPerDirection ? 'text-ink' : 'text-ink-3')}>
              {counts[d.id]}/{catalog.rules.maxPerDirection}
            </span>
          </FilterChip>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 pb-6 scrollbar-thin">
        {groups.map(({ direction, measures }) => (
          <div key={direction.id}>
            {filter === 'all' && (
              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-ink-2">
                <DirectionDot id={direction.id} /> {direction.name}
                <span className="text-ink-3">· {direction.tzName}</span>
              </div>
            )}
            <div className="space-y-2">
              {measures.map((m) => {
                const a = measureAvailability(catalog, m, decisions, remainingBudget)
                const isPicking = picking === m.id
                return (
                  <article
                    key={m.id}
                    aria-label={`${m.id} · ${m.name}`}
                    data-measure-id={m.id}
                    draggable={a.ok && allowDrag}
                    {...pointerDrag.handlers(m.id, a.ok && allowDrag)}
                    onDragStart={(e) => {
                      if (!a.ok || !allowDrag || pointerDrag.isActive()) { e.preventDefault(); return }
                      writeMeasureDrag(e.dataTransfer, m.id)
                      setPicking(null)
                      onDragMeasure?.(m.id)
                    }}
                    onDragEnd={() => { if (!pointerDrag.isActive()) onDragMeasure?.(null) }}
                    className={clsx(
                      'card p-3 transition-opacity', a.ok && allowDrag && 'cursor-grab active:cursor-grabbing',
                      !a.ok && a.inPlan === false && 'border border-line',
                      a.inPlan !== false && 'ring-1 ring-accent/50',
                    )}
                    aria-disabled={!a.ok && a.inPlan === false}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                          <DirectionDot id={m.directionId} />
                          <span className="tnum">{m.id}</span>
                          <Chip>{m.scope === 'district' ? 'район' : 'весь город'}</Chip>
                          {a.ok && allowDrag && <GripVertical className="ml-auto size-3.5" aria-hidden="true" />}
                        </div>
                        <h3 className="text-[14px] leading-snug font-medium">{m.name}</h3>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[15px] font-semibold tnum">{m.cost}</div>
                        <div className="text-[11px] text-ink-3">ед.</div>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {(Object.entries(m.effects) as [IndicatorId, number][]).map(([ind, e]) => {
                        const info = catalog.indicators.find((i) => i.id === ind)!
                        return (
                          <Hint key={ind} text={`${info.name} (${ind}): ${info.meaning}. Полный эффект ${signed(e, 1)}, до учёта лага`}>
                            <Chip tone={e < 0 ? 'critical' : 'neutral'}>
                              {info.name} {signed(e, e % 1 ? 1 : 2).replace(/,00$/, '').replace(/,0$/, '')}
                            </Chip>
                          </Hint>
                        )
                      })}
                    </div>
                    <div className="mt-1.5 text-[12px] text-ink-3">Эффект {lagText(m.lag, catalog.rules.horizonQuarters)}</div>

                    {a.synergyHint && <div className="mt-1.5"><Chip tone="good">{a.synergyHint}</Chip></div>}

                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      {a.inPlan !== false ? (
                        <Chip tone="accent"><Check className="size-3" /> в плане{a.inPlan ? ` · ${catalog.districts.find((d) => d.id === a.inPlan)?.name}` : ''}</Chip>
                      ) : a.ok ? (
                        <Button size="sm" className="min-h-11" onClick={() => (m.scope === 'district' ? setPicking(isPicking ? null : m.id) : add(m, null))} aria-label={m.scope === 'district' ? `Выбрать район для ${m.id}` : `Добавить ${m.id} для всего города`} aria-expanded={m.scope === 'district' ? isPicking : undefined}>
                          <Plus className="size-3.5" /> {m.scope === 'district' ? 'Выбрать район' : 'Добавить'}
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-ink-2"><Ban className="size-3.5 shrink-0" aria-hidden="true" /> {a.reason}</span>
                      )}
                    </div>

                    {isPicking && a.ok && (
                      <DistrictPicker catalog={catalog} measure={m} decisions={decisions} remainingBudget={remainingBudget} currentValues={currentValues} onPick={(d) => add(m, d)} onCancel={() => setPicking(null)} />
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {pointerDrag.preview && <div aria-hidden="true" className="pointer-events-none fixed z-50 max-w-56 rounded-lg border border-accent bg-surface px-3 py-2 text-sm font-medium text-accent-ink" style={{ left: Math.min(pointerDrag.preview.x + 14, window.innerWidth - 240), top: Math.min(pointerDrag.preview.y + 14, window.innerHeight - 90) }}>
        {pointerDrag.preview.measureId} · {catalog.measures.find((m) => m.id === pointerDrag.preview?.measureId)?.name}
        <span className="mt-1 block text-xs font-normal text-ink-2">Отпустите на карте · Esc — отмена</span>
      </div>}
    </section>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

function DistrictPicker({ catalog, measure, decisions, remainingBudget, currentValues, onPick, onCancel }: {
  catalog: CatalogT
  measure: Measure
  decisions: Decision[]
  remainingBudget: number
  currentValues: Record<DistrictId, IndicatorValues>
  onPick: (d: DistrictId) => void
  onCancel: () => void
}) {
  const selectId = useId()
  const [districtId, setDistrictId] = useState<DistrictId | null>(null)
  const options = districtOptions(catalog, measure, decisions, currentValues, remainingBudget)
  const chosen = options.find((o) => o.districtId === districtId && !o.blockedReason) ?? options.find((o) => o.isWorst) ?? options.find((o) => !o.blockedReason)
  const ind = catalog.indicators.find((i) => i.id === primaryIndicator(measure))!
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-2.5 animate-fade-up">
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <label htmlFor={selectId} className="font-medium text-ink-2">Район для {measure.id}</label>
        <button type="button" className="min-h-11 px-2 text-ink-2 hover:text-ink" onClick={onCancel}>Отмена</button>
      </div>
      <select
        id={selectId}
        value={chosen?.districtId ?? ''}
        onChange={(e) => setDistrictId(e.target.value as DistrictId)}
        aria-describedby={`${selectId}-hint`}
        className="min-h-11 w-full min-w-0 rounded-lg border border-line-2 bg-surface px-2 text-[13px]"
      >
        {!chosen && <option value="">Нет доступных районов</option>}
        {options.map((o) => {
          const d = catalog.districts.find((x) => x.id === o.districtId)!
          return (
            <option key={o.districtId} value={o.districtId} disabled={!!o.blockedReason}>
              {d.name} · {f1(o.value)}{o.isWorst ? ' · нужнее всего' : ''}{o.blockedReason ? ` · ${o.blockedReason}` : ''}
            </option>
          )
        })}
      </select>
      <p id={`${selectId}-hint`} className="my-2 text-[12px] leading-relaxed text-ink-2">
        Сейчас «{ind.name}»: <span className="font-medium tnum">{chosen ? f1(chosen.value) : '—'}</span>.
        {chosen?.isWorst && ' Самое низкое значение среди доступных районов.'}
        {chosen && chosen.value < catalog.rules.criticalThreshold && ' Критический показатель.'}
      </p>
      <Button variant="primary" className="min-h-11 w-full" disabled={!chosen} onClick={() => chosen && onPick(chosen.districtId)}>
        <Plus className="size-4" /> Добавить в район {chosen ? catalog.districts.find((d) => d.id === chosen.districtId)?.name : ''}
      </Button>
    </div>
  )
}
