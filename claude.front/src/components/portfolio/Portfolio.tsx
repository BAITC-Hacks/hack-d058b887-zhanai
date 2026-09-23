import { clsx } from 'clsx'
import { X } from 'lucide-react'
import type { Catalog, Decision, DistrictId, IndicatorId } from '../../data/dataset'
import type { DecisionResult } from '../../api'
import { f0, signed } from '../../lib/format'
import { Chip, DirectionDot, SectionTitle } from '../ui'

interface Props {
  catalog: Catalog
  decisions: Decision[]
  results: DecisionResult[] | null
  remainingBudget: number
  errorMeasureIds: Set<string>
  onRemove: (index: number) => void
  onSetDistrict: (index: number, districtId: DistrictId) => void
  onOpenDistrict: (id: DistrictId) => void
}

export function Portfolio({ catalog, decisions, results, remainingBudget, errorMeasureIds, onRemove, onSetDistrict, onOpenDistrict }: Props) {
  const slots = Array.from({ length: catalog.rules.decisions }, (_, i) => decisions[i] ?? null)
  const totalCost = decisions.reduce((a, d) => a + (catalog.measures.find((m) => m.id === d.measureId)?.cost ?? 0), 0)

  return (
    <section aria-label="Портфель решений" className="card p-4">
      <SectionTitle aside={<span className="tnum">{decisions.length} из {catalog.rules.decisions} · {f0(totalCost)} ед.</span>}>Пять решений акима</SectionTitle>
      <ol className="space-y-2">
        {slots.map((d, i) => {
          if (!d) {
            return (
              <li key={`empty-${i}`} className="flex h-[52px] items-center justify-between rounded-lg border border-dashed border-line-2 px-3 text-[13px] text-ink-3">
                <span>{i === decisions.length ? 'Добавьте меру из каталога' : `Решение ${i + 1}`}</span>
                {i === decisions.length && remainingBudget > 0 && <span className="tnum">осталось {f0(remainingBudget)} ед.</span>}
              </li>
            )
          }
          const m = catalog.measures.find((x) => x.id === d.measureId)
          if (!m) return null
          const r = results?.find((x) => x.measureId === d.measureId)
          const hasError = errorMeasureIds.has(d.measureId)
          return (
            <li key={d.measureId} className={clsx('rounded-lg border px-3 py-2 animate-fade-up', hasError ? 'border-critical bg-critical-soft/40' : 'border-line bg-surface')}>
              <div className="flex items-center gap-2">
                <DirectionDot id={m.directionId} />
                <span className="text-[11px] text-ink-3 tnum">{m.id}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.name}</span>
                <span className="text-[13px] font-semibold tnum">{m.cost}</span>
                <button type="button" aria-label={`Убрать ${m.id}`} onClick={() => onRemove(i)} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[18px]">
                {m.scope === 'district' ? (
                  <select
                    aria-label={`Район для ${m.id}`}
                    value={d.districtId ?? ''}
                    onChange={(e) => onSetDistrict(i, e.target.value as DistrictId)}
                    className="h-6 rounded-md border border-line bg-surface px-1.5 text-[12px] text-ink-2 hover:bg-surface-2"
                  >
                    {catalog.districts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                ) : (
                  <Chip>весь город</Chip>
                )}
                {d.districtId && (
                  <button type="button" className="text-[11px] text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink" onClick={() => onOpenDistrict(d.districtId!)}>
                    показатели района
                  </button>
                )}
                {r && (
                  <span className="ml-auto flex flex-wrap gap-1">
                    {(Object.entries(r.realizedEffects) as [IndicatorId, number][]).map(([ind, v]) => (
                      <Chip key={ind} tone={v < 0 ? 'critical' : 'neutral'} title={`${catalog.indicators.find((x) => x.id === ind)?.name}: реализовано ${r.realizedShare * catalog.rules.horizonQuarters}/${catalog.rules.horizonQuarters}`}>
                        {ind} {signed(v, 1)}
                      </Chip>
                    ))}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
