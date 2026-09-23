import { clsx } from 'clsx'
import { Check, Wand2 } from 'lucide-react'
import type { Catalog, Decision } from '../../data/dataset'
import type { ImproveResponse } from '../../api'
import { f1, f2, pluralRu } from '../../lib/format'
import { hasDecision, lcFirst, replaceDecision, swapPhrase } from '../../lib/text'
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
  // Замена актуальна, только если убираемая мера ещё есть в плане (ответ мог устареть).
  const swap = data?.swap && hasDecision(currentDecisions, data.swap.remove) ? data.swap : null
  const optimum = data?.optimum ?? null
  const optimumReached = optimum !== null && currentScore !== null && currentScore >= optimum.score - 1e-6
  const toOptimum = optimum && currentScore !== null ? optimum.score - currentScore : null
  const percentile = data?.percentile ?? null

  return (
    <section aria-label="Улучшение плана" aria-busy={loading} className="card flex flex-col gap-3 p-4">
      <div className="-mb-2">
        <SectionTitle aside={loading ? 'ищем замену…' : undefined}>Улучшить план</SectionTitle>
      </div>

      {!data && loading && (
        <div className="flex flex-col gap-2"><div className="skeleton h-16" /><div className="skeleton h-4 w-2/3" /></div>
      )}

      {data && (
        // Пока ищем замену для нового плана, прежний ответ приглушён, а кнопки не работают.
        <div className={clsx('flex flex-col gap-3 transition-opacity', loading && 'opacity-50')}>
          {swap ? (
            <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
              <p className="flex items-start gap-2 text-[13px] leading-normal">
                <Wand2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  <span className="text-ink-2">Лучшая замена одной меры: </span>
                  {lcFirst(swapPhrase(catalog, swap.remove, swap.add))}
                </span>
              </p>
              <div className="flex items-center justify-between gap-2 pl-6">
                <span className="text-[13px] tnum">
                  Score <b className="font-semibold">{f2(swap.score)}</b> <Delta value={swap.delta} className="ml-0.5" />
                  <span className="text-ink-2"> · стоимость {swap.cost}</span>
                </span>
                <Button size="sm" aria-label="Применить замену" disabled={loading} onClick={() => onApply(replaceDecision(currentDecisions, swap.remove, swap.add))}>Применить</Button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">{data.message ?? 'Лучшая замена одной меры не найдена'}</p>
          )}

          {(optimum || percentile !== null) && (
            <dl className="flex flex-col text-[13px]">
              {optimum && (
                <div className="flex items-center justify-between gap-3 border-t border-line py-2">
                  <dt className="text-ink-2">Оптимум по перебору</dt>
                  <dd className="flex items-center gap-2 text-right tnum">
                    {optimumReached ? (
                      <span className="flex items-center gap-1 font-medium text-up"><Check aria-hidden="true" className="size-4" /> это ваш план</span>
                    ) : (
                      <>
                        <span>
                          <b className="font-semibold">{f2(optimum.score)}</b>
                          {toOptimum !== null && toOptimum > 0.005 && <span className="text-ink-2"> · ещё {f2(toOptimum)}</span>}
                        </span>
                        <Button variant="ghost" size="sm" aria-label="Применить оптимальный план" title={`Заменить план оптимальным (стоимость ${optimum.cost})`} disabled={loading} onClick={() => onApply(optimum.decisions)}>
                          Применить
                        </Button>
                      </>
                    )}
                  </dd>
                </div>
              )}
              {percentile !== null && (
                <div className="flex items-center justify-between gap-3 border-t border-line py-2">
                  <dt className="text-ink-2">Ваш план лучше</dt>
                  <dd className="text-right tnum">
                    <b className="font-semibold">{data.percentileExact ? '' : '≈ '}{f1(Math.min(99.9, percentile))}&nbsp;%</b>
                    {data.totalPlans ? <span className="text-ink-2"> из {data.totalPlans.toLocaleString('ru-RU')} {pluralRu(data.totalPlans, 'плана', 'планов', 'планов')}</span> : <span className="text-ink-2"> планов</span>}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <p className="text-[12px] leading-snug text-ink-2">
            Перебор идёт по модели датасета и правилу «{catalog.rules.ruleset === 'dataset' ? `не больше ${catalog.rules.maxPerDirection} мер из направления` : 'все направления'}». План меняется только по кнопке.
          </p>
        </div>
      )}
    </section>
  )
}
