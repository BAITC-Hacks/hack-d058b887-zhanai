import { clsx } from 'clsx'
import { X } from 'lucide-react'
import type { Catalog, Decision, DistrictId, IndicatorId } from '../../data/dataset'
import type { DecisionResult } from '../../api'
import { sameDistrictConflicts } from '../../lib/availability'
import { f0, signedDelta } from '../../lib/format'
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
  const indicatorName = (id: IndicatorId) => catalog.indicators.find((x) => x.id === id)?.name ?? id

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
          // Районы, где мера конфликтует с другими решениями плана («в одном районе нельзя»).
          const conflicts = m.scope === 'district' ? sameDistrictConflicts(catalog, m, decisions.filter((_, j) => j !== i)) : null
          const currentConflict = d.districtId ? conflicts?.get(d.districtId) : undefined
          return (
            <li key={d.measureId} className={clsx('rounded-lg border px-3 py-2 animate-fade-up', hasError ? 'border-critical bg-critical-soft/40' : 'border-line bg-surface')}>
              <div className="flex items-center gap-2">
                <DirectionDot id={m.directionId} />
                <span className="text-[11px] text-ink-3 tnum">{m.id}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{m.name}</span>
                <span className="text-[13px] font-semibold tnum">{m.cost}</span>
                <button type="button" aria-label={`Убрать ${m.id}`} onClick={() => onRemove(i)} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[18px]">
                {m.scope === 'district' ? (
                  <select
                    aria-label={`Район для ${m.id}`}
                    aria-invalid={currentConflict ? true : undefined}
                    value={d.districtId ?? ''}
                    onChange={(e) => onSetDistrict(i, e.target.value as DistrictId)}
                    className={clsx(
                      'h-6 max-w-full rounded-md border bg-surface px-1.5 text-[12px] text-ink-2 hover:bg-surface-2',
                      currentConflict ? 'border-critical' : 'border-line',
                    )}
                  >
                    {!d.districtId && <option value="" disabled>Выберите район</option>}
                    {catalog.districts.map((x) => {
                      const reason = conflicts?.get(x.id)
                      // Текущий район не блокируем, иначе список покажет пустое значение.
                      const blocked = Boolean(reason) && x.id !== d.districtId
                      return (
                        <option key={x.id} value={x.id} disabled={blocked}>
                          {reason ? `${x.name} — нельзя: ${reason.replace(': ', ', ')}` : x.name}
                        </option>
                      )
                    })}
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
                      // Отрицательный эффект — обычная плашка со знаком минус: красный
                      // оставлен только для критических значений показателей.
                      <Chip key={ind} title={`${indicatorName(ind)}: ${signedDelta(v)}, реализовано ${r.realizedShare * catalog.rules.horizonQuarters}/${catalog.rules.horizonQuarters}`}>
                        <span className="sr-only">{indicatorName(ind)}</span>
                        <span aria-hidden="true">{ind}</span> <b className="font-semibold tnum">{signedDelta(v)}</b>
                      </Chip>
                    ))}
                  </span>
                )}
              </div>
              {currentConflict && (
                <p className="mt-1 pl-[18px] text-[12px] leading-snug text-[#7a1f1f]">Нельзя в этом районе: {currentConflict.replace(': ', ' — ')}. Выберите другой район.</p>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
