import { ArrowRight, Wand2 } from 'lucide-react'
import type { Catalog, Decision } from '../../data/dataset'
import type { ImproveResponse } from '../../api'
import { f2 } from '../../lib/format'
import { Button, Delta, SectionTitle } from '../ui'

interface Props {
  catalog: Catalog
  data: ImproveResponse | null
  loading: boolean
  currentScore: number | null
  onApply: (decisions: Decision[]) => void
  currentDecisions: Decision[]
}

export function ImproveCard({ catalog, data, loading, currentScore, onApply, currentDecisions }: Props) {
  const applySwap = () => {
    if (!data?.swap) return
    const { remove, add } = data.swap
    onApply(currentDecisions.map((d) => (d.measureId === remove.measureId && d.districtId === remove.districtId ? add : d)))
  }
  const optimumReached = data?.optimum && currentScore !== null && currentScore >= data.optimum.score - 1e-6

  return (
    <section aria-label="Улучшение плана" className="card p-4" aria-busy={loading}>
      <SectionTitle aside={loading ? 'ищем замену…' : undefined}>Улучшить план</SectionTitle>
      {!data && loading && <div className="space-y-2"><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-1/2" /></div>}
      {data && (
        <div className="space-y-3 text-[13px]">
          {data.swap ? (
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-start gap-2"><Wand2 className="mt-0.5 size-4 shrink-0 text-accent" /><p>Замените {data.swap.remove.measureId} · {catalog.districts.find((d) => d.id === data.swap!.remove.districtId)?.name ?? 'город'} на {data.swap.add.measureId} · {catalog.districts.find((d) => d.id === data.swap!.add.districtId)?.name ?? 'город'}.</p></div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-6">
                <span className="tnum">
                  Score <span className="font-medium">{f2(data.swap.score)}</span> <Delta value={data.swap.delta} className="ml-1" /> · стоимость {data.swap.cost}
                </span>
                <Button size="sm" onClick={applySwap}>Применить <ArrowRight className="size-3.5" /></Button>
              </div>
            </div>
          ) : (
            <p className="text-ink-2">{data.message ?? 'Лучшая замена одной меры не найдена'}</p>
          )}
          {data.optimum && (
            <div className="flex items-center justify-between gap-2 text-ink-2">
              <span>
                {optimumReached ? 'Это оптимум по полному перебору' : <>Оптимум по перебору: <span className="font-medium text-ink tnum">{f2(data.optimum.score)}</span>, стоимость {data.optimum.cost}</>}
              </span>
              {!optimumReached && <Button variant="ghost" size="sm" onClick={() => onApply(data.optimum!.decisions)}>Применить оптимум</Button>}
            </div>
          )}
          <p className="text-[11px] text-ink-3">Оптимум считается в рамках модели датасета и правил «{catalog.rules.ruleset === 'dataset' ? 'не больше 2 мер из направления' : 'все направления'}». Ваш план не меняется без нажатия.</p>
        </div>
      )}
    </section>
  )
}
