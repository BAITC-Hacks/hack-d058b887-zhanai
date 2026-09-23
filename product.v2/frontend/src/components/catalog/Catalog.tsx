import { useMemo, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { Catalog as CatalogT, Decision, DirectionId, DistrictId } from '../../data/dataset'
import type { ImproveResponse, IndicatorValues } from '../../api'
import { isSwapAllowed } from '../../lib/availability'
import { pluralRu } from '../../lib/format'
import { DIRECTION_COLOR } from '../../lib/scales'
import { DirectionDot, SectionTitle } from '../ui'
import { MeasureCard, type BestSwap, type PickerMode } from './MeasureCard'

interface Props {
  catalog: CatalogT
  decisions: Decision[]
  remainingBudget: number
  /** Весь бюджет (с учётом события). */
  budget: number
  /** Текущие значения показателей (после уже выбранных мер) для подсказки «куда нужнее». */
  currentValues: Record<DistrictId, IndicatorValues>
  /** Результат /improve: из него берём лучшую замену одной меры. */
  improve: ImproveResponse | null
  onAdd: (d: Decision) => void
  onSwap: (index: number, d: Decision) => void
}

type Filter = 'all' | DirectionId

export function Catalog({ catalog, decisions, remainingBudget, budget, currentValues, improve, onAdd, onSwap }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<{ id: string; mode: PickerMode } | null>(null)
  const max = catalog.rules.maxPerDirection
  const full = decisions.length >= catalog.rules.decisions
  const hasPlan = decisions.length > 0

  const counts = useMemo(() => {
    const c = Object.fromEntries(catalog.directions.map((d) => [d.id, 0])) as Record<DirectionId, number>
    for (const d of decisions) {
      const m = catalog.measures.find((x) => x.id === d.measureId)
      if (m) c[m.directionId] = (c[m.directionId] ?? 0) + 1
    }
    return c
  }, [catalog, decisions])

  const bestSwap = useMemo(() => resolveBestSwap(catalog, decisions, budget, improve), [catalog, decisions, budget, improve])

  const groups = catalog.directions
    .filter((d) => filter === 'all' || d.id === filter)
    .map((d) => ({ direction: d, measures: catalog.measures.filter((m) => m.directionId === d.id) }))

  const add = (d: Decision) => {
    onAdd(d)
    setOpen(null)
  }
  const swap = (index: number, d: Decision) => {
    onSwap(index, d)
    setOpen(null)
  }

  return (
    <section aria-label="Каталог мероприятий" className="flex min-h-0 min-w-0 flex-col">
      <SectionTitle aside={`${catalog.measures.length} ${pluralRu(catalog.measures.length, 'мера', 'меры', 'мер')}`}>Каталог мер</SectionTitle>

      <div className="pb-3">
        {/* Живая область есть всегда, чтобы скринридер объявил появление баннера. */}
        <div role="status" aria-live="polite">
          {full && (
            <div className="pb-3">
              <PlanFullBanner count={decisions.length} total={catalog.rules.decisions} cost={budget - remainingBudget} budget={budget} />
            </div>
          )}
        </div>
        <DirectionFilter catalog={catalog} counts={counts} hasPlan={hasPlan} filter={filter} onChange={setFilter} />
      </div>

      <div className="-mx-1.5 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1.5 pt-1 pb-6 scrollbar-thin [scrollbar-gutter:stable]">
        <div className="flex flex-col gap-5">
          {groups.map(({ direction, measures }) => {
            const n = counts[direction.id] ?? 0
            const uncovered = n === 0 && hasPlan
            const showTz = direction.tzName.trim().toLowerCase() !== direction.name.trim().toLowerCase()
            return (
              <section key={direction.id} aria-labelledby={`catalog-dir-${direction.id}`} className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <DirectionDot id={direction.id} />
                    <h3 id={`catalog-dir-${direction.id}`} className="text-[15px] leading-snug font-semibold">{direction.name}</h3>
                    {showTz && <span className="text-[12px] text-ink-3" title="Формулировка из ТЗ">{direction.tzName}</span>}
                  </div>
                  <Badge tone={uncovered ? 'warn' : 'neutral'}>
                    <span className="sr-only">В плане: </span>
                    {uncovered ? `не охвачен · 0 из ${max}` : `${n} из ${max}`}
                  </Badge>
                </div>
                <div className="flex flex-col gap-2.5">
                  {measures.map((m) => (
                    <MeasureCard
                      key={m.id}
                      catalog={catalog}
                      measure={m}
                      decisions={decisions}
                      remainingBudget={remainingBudget}
                      budget={budget}
                      currentValues={currentValues}
                      bestSwap={bestSwap && bestSwap.add.measureId === m.id ? bestSwap : null}
                      open={open?.id === m.id ? open.mode : null}
                      onOpenChange={(mode) => setOpen(mode ? { id: m.id, mode } : null)}
                      onAdd={add}
                      onSwap={swap}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/**
 * Лучшая замена из /improve, сверенная с текущим планом: ответ мог устареть,
 * поэтому ищем вытесняемое решение и проверяем правила каталога.
 */
function resolveBestSwap(catalog: CatalogT, decisions: Decision[], budget: number, improve: ImproveResponse | null): BestSwap | null {
  const s = improve?.swap
  if (!s) return null
  const index = decisions.findIndex((d) => d.measureId === s.remove.measureId && (d.districtId ?? null) === (s.remove.districtId ?? null))
  if (index < 0) return null
  if (!isSwapAllowed(catalog, decisions, index, s.add, budget)) return null
  return { index, remove: s.remove, add: s.add, score: s.score, delta: s.delta, text: s.text }
}

function PlanFullBanner({ count, total, cost, budget }: { count: number; total: number; cost: number; budget: number }) {
  const over = cost > budget
  const Icon = over ? TriangleAlert : CircleCheck
  return (
    <div className={clsx('flex items-start gap-2.5 rounded-[10px] p-3 ring-1 ring-inset', over ? 'bg-warn-soft ring-warn/50' : 'bg-accent-soft/40 ring-accent-soft')}>
      <Icon aria-hidden="true" className={clsx('mt-px size-[18px] shrink-0', over ? 'text-[#6b4a00]' : 'text-accent-ink')} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className={clsx('text-[13.5px] leading-snug font-semibold', over ? 'text-[#6b4a00]' : 'text-accent-ink')}>
          План собран: {count} из {total} · <span className="tnum">{cost} из {budget}</span>
          {over && ' — бюджет превышен'}
        </p>
        <p className={clsx('text-[12.5px] leading-snug', over ? 'text-[#6b4a00]/90' : 'text-accent-ink/80')}>
          {over
            ? 'Замените дорогую меру более дешёвой: нажмите «Заменить» и выберите, какую меру из плана она вытеснит.'
            : 'Чтобы взять другую меру, нажмите «Заменить» — выберете, какую меру из плана она вытеснит.'}
        </p>
      </div>
    </div>
  )
}

/** «Безопасность» → «Безопасн.»: в узкой сетке фильтра длинное имя сокращаем с точкой, а не обрезаем многоточием. */
function shortName(name: string) {
  return name.length > 10 ? `${name.slice(0, 8)}.` : name
}

function DirectionFilter({ catalog, counts, hasPlan, filter, onChange }: {
  catalog: CatalogT
  counts: Record<DirectionId, number>
  hasPlan: boolean
  filter: Filter
  onChange: (f: Filter) => void
}) {
  const max = catalog.rules.maxPerDirection
  return (
    // @container: в узкой колонке (десктоп, 320px) — короткие имена, в широкой — полные.
    <div role="group" aria-label="Фильтр по направлениям" className="@container">
      <div className="grid grid-cols-3 gap-1.5">
        <FilterButton active={filter === 'all'} onClick={() => onChange('all')}>
          Все
        </FilterButton>
        {catalog.directions.map((d) => {
          const n = counts[d.id] ?? 0
          const uncovered = n === 0 && hasPlan
          const short = shortName(d.name)
          const label = `${d.name}: ${n} из ${max} в плане${uncovered ? ', направление не охвачено' : ''}`
          return (
            <FilterButton key={d.id} active={filter === d.id} warn={uncovered} label={label} onClick={() => onChange(d.id)}>
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: DIRECTION_COLOR[d.id] }} />
              {short === d.name ? (
                <span className="min-w-0 truncate">{d.name}</span>
              ) : (
                <>
                  <span className="min-w-0 truncate @min-[26rem]:hidden">{short}</span>
                  <span className="hidden min-w-0 truncate @min-[26rem]:block">{d.name}</span>
                </>
              )}
              <span className={clsx('shrink-0 tnum', filter === d.id ? 'text-white/75' : uncovered ? 'font-semibold' : 'text-ink-2')}>{n}</span>
            </FilterButton>
          )
        })}
      </div>
    </div>
  )
}

function FilterButton({ active, warn = false, label, onClick, children }: { active: boolean; warn?: boolean; label?: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={clsx(
        // Отступы и кегль подобраны под колонку 320px: «Транспорт 0» помещается без обрезки.
        'flex h-[34px] w-full min-w-0 items-center justify-center gap-1 rounded-lg border px-1 text-[12.5px] transition-colors',
        active
          ? 'border-ink bg-ink font-semibold text-white'
          : warn
            ? 'border-warn/70 bg-warn-soft font-medium text-[#6b4a00] hover:border-warn'
            : 'border-line bg-surface font-medium text-ink hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  )
}

function Badge({ tone, children }: { tone: 'neutral' | 'warn'; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-md px-2 py-[3px] text-[12px] leading-tight font-semibold whitespace-nowrap tnum',
        tone === 'warn' ? 'bg-warn-soft text-[#6b4a00]' : 'bg-surface-2 text-ink-2',
      )}
    >
      {children}
    </span>
  )
}
