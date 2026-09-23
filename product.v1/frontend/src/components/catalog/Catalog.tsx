import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Plus, Check, Ban } from 'lucide-react'
import type { Catalog as CatalogT, Decision, DirectionId, DistrictId, IndicatorId, Measure } from '../../data/dataset'
import type { IndicatorValues } from '../../api'
import { districtOptions, measureAvailability, primaryIndicator } from '../../lib/availability'
import { f1, lagText, signed } from '../../lib/format'
import { Button, Chip, DirectionDot, Hint, SectionTitle } from '../ui'

interface Props {
  catalog: CatalogT
  decisions: Decision[]
  remainingBudget: number
  /** Текущие значения показателей (после уже выбранных мер) для подсказки «куда нужнее». */
  currentValues: Record<DistrictId, IndicatorValues>
  onAdd: (d: Decision) => void
}

export function Catalog({ catalog, decisions, remainingBudget, currentValues, onAdd }: Props) {
  const [filter, setFilter] = useState<'all' | DirectionId>('all')
  const [picking, setPicking] = useState<string | null>(null)

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
    onAdd({ measureId: m.id, districtId })
    setPicking(null)
  }

  return (
    <section aria-label="Каталог мероприятий" className="flex min-h-0 flex-col">
      <SectionTitle aside={`${catalog.measures.length} мер`}>Каталог мер</SectionTitle>
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
                    className={clsx(
                      'card p-3 transition-opacity',
                      !a.ok && a.inPlan === false && 'opacity-55',
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
                        <Button size="sm" onClick={() => (m.scope === 'district' ? setPicking(isPicking ? null : m.id) : add(m, null))} aria-expanded={m.scope === 'district' ? isPicking : undefined}>
                          <Plus className="size-3.5" /> {m.scope === 'district' ? 'Выбрать район' : 'Добавить'}
                        </Button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[12px] text-serious"><Ban className="size-3.5" /> {a.reason}</span>
                      )}
                    </div>

                    {isPicking && a.ok && (
                      <DistrictPicker catalog={catalog} measure={m} decisions={decisions} currentValues={currentValues} onPick={(d) => add(m, d)} onCancel={() => setPicking(null)} />
                    )}
                  </article>
                )
              })}
            </div>
          </div>
        ))}
      </div>
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
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors',
        active ? 'border-ink bg-ink text-white' : 'border-line-2 bg-surface text-ink-2 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

function DistrictPicker({ catalog, measure, decisions, currentValues, onPick, onCancel }: {
  catalog: CatalogT
  measure: Measure
  decisions: Decision[]
  currentValues: Record<DistrictId, IndicatorValues>
  onPick: (d: DistrictId) => void
  onCancel: () => void
}) {
  const options = districtOptions(catalog, measure, decisions, currentValues)
  const ind = catalog.indicators.find((i) => i.id === primaryIndicator(measure))!
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-2.5 animate-fade-up">
      <div className="mb-2 flex items-baseline justify-between text-[12px]">
        <span className="text-ink-2">Куда? Сейчас «{ind.name}»:</span>
        <button type="button" className="text-ink-3 hover:text-ink" onClick={onCancel}>отмена</button>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {options.map((o) => {
          const d = catalog.districts.find((x) => x.id === o.districtId)!
          const critical = o.value < catalog.rules.criticalThreshold
          return (
            <button
              key={o.districtId}
              type="button"
              disabled={!!o.blockedReason}
              title={o.blockedReason ?? undefined}
              onClick={() => onPick(o.districtId)}
              className={clsx(
                'flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left text-[13px] transition-colors',
                o.blockedReason ? 'cursor-not-allowed border-line text-ink-3' : 'border-line bg-surface hover:border-ink',
                o.isWorst && !o.blockedReason && 'border-accent bg-accent-soft/40',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-medium">{d.name}</span>
                {o.isWorst && !o.blockedReason && <Chip tone="accent">нужнее всего</Chip>}
                {o.blockedReason && <span className="text-[11px]">{o.blockedReason}</span>}
              </span>
              <span className={clsx('tnum text-[13px]', critical ? 'font-semibold text-critical' : 'text-ink-2')}>{f1(o.value)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
