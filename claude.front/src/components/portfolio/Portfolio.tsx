import { clsx } from 'clsx'
import { Check, X } from 'lucide-react'
import type { Catalog, Decision, DistrictId, IndicatorId } from '../../data/dataset'
import type { DecisionResult } from '../../api'
import { f0, signed } from '../../lib/format'
import { Chip, DirectionDot, SectionTitle } from '../ui'
import { decisionUnavailableReason } from '../../lib/availability'

interface Props {
  catalog: Catalog
  decisions: Decision[]
  results: DecisionResult[] | null
  remainingBudget: number
  errorMeasureIds: Set<string>
  onRemove: (index: number) => void
  onSetDistrict: (index: number, districtId: DistrictId) => void
  onOpenDistrict: (id: DistrictId) => void
  onRequestMeasure?: () => void
}

export function Portfolio({ catalog, decisions, results, remainingBudget, errorMeasureIds, onRemove, onSetDistrict, onOpenDistrict, onRequestMeasure }: Props) {
  const slots = Array.from({ length: catalog.rules.decisions }, (_, i) => decisions[i] ?? null)
  const totalCost = decisions.reduce((a, d) => a + (catalog.measures.find((m) => m.id === d.measureId)?.cost ?? 0), 0)

  return (
    <section aria-label="Портфель решений" className="card p-4">
      <SectionTitle aside={<span className="tnum">{decisions.length} из {catalog.rules.decisions} · {f0(totalCost)} ед.</span>}>Пять решений акима</SectionTitle>
      <div className="mb-3 flex gap-1.5" role="progressbar" aria-label="Выбрано решений" aria-valuenow={decisions.length} aria-valuemin={0} aria-valuemax={catalog.rules.decisions}>
        {slots.map((decision, i) => <span key={i} aria-hidden="true" className={clsx('flex h-7 flex-1 items-center justify-center rounded-md border text-[12px] font-medium', decision ? 'border-accent/25 bg-accent-soft text-accent-ink' : 'border-line bg-surface-2 text-ink-3')}>{decision ? <Check className="size-3.5" /> : i + 1}</span>)}
      </div>
      <ol className="space-y-2">
        {slots.map((d, i) => {
          if (!d) {
            return (
              <li key={`empty-${i}`} className="flex h-[52px] items-center justify-between rounded-lg border border-dashed border-line-2 px-3 text-[13px] text-ink-3">
                {i === decisions.length ? onRequestMeasure
                  ? <button type="button" onClick={onRequestMeasure} className="inline-flex min-h-11 items-center text-ink-2 underline decoration-dotted underline-offset-4">Выбрать решение {i + 1}</button>
                  : <a href="#catalog" className="inline-flex min-h-11 items-center text-ink-2 underline decoration-dotted underline-offset-4">Выбрать решение {i + 1}</a>
                  : <span>Решение {i + 1}</span>}
                {i === decisions.length && remainingBudget > 0 && <span className="tnum">осталось {f0(remainingBudget)} ед.</span>}
              </li>
            )
          }
          const m = catalog.measures.find((x) => x.id === d.measureId)
          if (!m) return null
          const r = results?.find((x) => x.measureId === d.measureId)
          const hasError = errorMeasureIds.has(d.measureId)
          const others = decisions.filter((_, index) => index !== i)
          const budgetForMove = remainingBudget + m.cost
          const reassignmentReason = (districtId: DistrictId) => decisionUnavailableReason(catalog, { measureId: m.id, districtId }, others, budgetForMove)
          return (
            <li key={d.measureId} className={clsx('portfolio-row relative rounded-lg border py-2 pl-3 pr-12', hasError ? 'border-critical bg-critical-soft/40' : 'border-line bg-surface')}>
              <div className="flex items-center gap-2">
                <DirectionDot id={m.directionId} />
                <span className="text-[11px] text-ink-3 tnum">{m.id}</span>
                <span title={m.name} className="min-w-0 flex-1 text-[13px] leading-snug font-medium">{m.name}</span>
                <span className="text-[13px] font-semibold tnum">{m.cost}</span>
                <button type="button" aria-label={`Убрать ${m.id}`} onClick={() => onRemove(i)} className="absolute right-1 top-1 flex min-h-11 min-w-11 items-center justify-center rounded text-ink-2 hover:bg-surface-2 hover:text-ink">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-[18px]">
                {m.scope === 'district' ? (
                  <select
                    aria-label={`Район для ${m.id}`}
                    value={d.districtId ?? ''}
                    onChange={(e) => { const districtId = e.target.value as DistrictId; if (!reassignmentReason(districtId)) onSetDistrict(i, districtId) }}
                    className="min-h-11 max-w-full min-w-0 rounded-md border border-line bg-surface px-2 text-[12px] text-ink-2 hover:bg-surface-2"
                  >
                    {catalog.districts.map((x) => {
                      const reason = reassignmentReason(x.id)
                      return <option key={x.id} value={x.id} disabled={!!reason}>{x.name}{reason ? ` · ${reason}` : ''}</option>
                    })}
                  </select>
                ) : (
                  <Chip>весь город</Chip>
                )}
                {d.districtId && (
                  <button type="button" className="min-h-11 text-[11px] text-ink-2 underline decoration-dotted underline-offset-2 hover:text-ink" onClick={() => onOpenDistrict(d.districtId!)}>
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
      {decisions.length > 0 && <p className="mt-3 text-[12px] text-ink-2">{decisions.length === catalog.rules.decisions ? 'Пять решений выбраны. Проверьте результат и зафиксируйте план.' : `Хорошее начало. Осталось выбрать ${catalog.rules.decisions - decisions.length} из ${catalog.rules.decisions} решений.`} Район можно изменить в списке.</p>}
    </section>
  )
}
