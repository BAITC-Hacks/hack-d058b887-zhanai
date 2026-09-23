import { clsx } from 'clsx'
import { CircleAlert, Link2, Link2Off } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import type { Catalog, Decision, DirectionId, Measure } from '../../data/dataset'
import type { ApiError, ImproveResponse, MissedSynergy, SimulateResponse } from '../../api'
import { useCountUp } from '../../lib/useCountUp'
import { f1, f2, pluralRu } from '../../lib/format'
import { DIRECTION_COLOR } from '../../lib/scales'
import { districtLocative, indicatorName, lcFirst, measureName } from '../../lib/text'
import { scoreResult, type PlanStatus } from '../../state/useSimulation'
import { Chip, Delta, DirectionDot, SectionTitle } from '../ui'

interface Props {
  catalog: Catalog
  /** Последний ответ /simulate; пока идёт пересчёт, он относится к прежнему плану. */
  sim: SimulateResponse | null
  /** Ответ ещё не соответствует текущему плану: числа приглушены. */
  pending: boolean
  status: PlanStatus
  decisions: Decision[]
  /** Стоимость текущего плана по ценам каталога. */
  cost: number
  /** Бюджет с учётом события. */
  budget: number
  /** Только ответ /improve для текущего плана. */
  improve: ImproveResponse | null
}

export function ResultPanel({ catalog, sim, pending, status, decisions, cost, budget, improve }: Props) {
  const need = catalog.rules.decisions
  const count = decisions.length
  const invalid = status === 'invalid'
  // Для недопустимого плана Score не считается: ни result, ни preview здесь не показываем.
  const cur = count > 0 ? scoreResult(sim, status) : null
  const base = sim?.baseline ?? null
  const score = cur?.score ?? base?.score ?? 0
  const animated = useCountUp(score, 600)

  const critBefore = base?.criticalCount ?? 0
  const critAfter = cur?.criticalCount ?? critBefore
  const worstBefore = base ? catalog.districts.find((d) => d.id === base.minDistrictId) : undefined
  const worstAfter = cur ? catalog.districts.find((d) => d.id === cur.minDistrictId) : worstBefore

  const optimum = status === 'valid' ? (improve?.optimum?.score ?? null) : null
  const errors = pendingErrors(sim?.errors.filter((e) => e.code !== 'EXACTLY_FIVE_REQUIRED' || count > need) ?? [], pending, cost, budget)

  // Охват направлений считаем по самому плану: он нужен и для недопустимого набора.
  const coverage = useMemo(() => {
    const c = Object.fromEntries(catalog.directions.map((d) => [d.id, 0])) as Record<DirectionId, number>
    for (const d of decisions) {
      const m = catalog.measures.find((x) => x.id === d.measureId)
      if (m) c[m.directionId] = (c[m.directionId] ?? 0) + 1
    }
    return c
  }, [catalog, decisions])

  return (
    <section
      id="result"
      tabIndex={-1}
      aria-label="Результат"
      aria-busy={pending}
      className={clsx('card flex scroll-mt-16 flex-col gap-3.5 p-4 transition-opacity focus:outline-none', pending && sim && 'opacity-60')}
    >
      <div>
        <SectionTitle aside={pending && sim ? 'пересчёт…' : undefined}>Astana Quality of Life Score</SectionTitle>
        {!sim ? (
          <div className="skeleton h-14 w-44" />
        ) : invalid ? (
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-[56px] leading-none font-bold tracking-tight text-ink-3">—</span>
            <span className="flex flex-col items-start gap-1">
              <Chip tone="critical">План недопустим</Chip>
              <span className="text-[13px] leading-snug text-ink-2">Score не считается, пока план нарушает правила</span>
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-2.5">
            <span aria-hidden="true" className="text-[56px] leading-none font-bold tracking-tight tnum">{f2(animated)}</span>
            <span className="sr-only">{status === 'draft' ? 'Предварительный Score' : 'Score'} {f2(score)}</span>
            {cur && <Delta value={cur.delta} className="text-xl font-semibold" />}
          </div>
        )}
      </div>

      {base && !invalid && (
        <ScoreScale base={base.score} score={score} optimum={optimum} hasPlan={cur !== null} eventActive={Boolean(sim?.event) && status === 'valid'} />
      )}

      {/* Живая область: скринридер объявит смену статуса плана. */}
      <div aria-live="polite" className="flex flex-col gap-2">
        {invalid ? (
          <InvalidReasons catalog={catalog} sim={sim} pending={pending} errors={errors} decisions={decisions} cost={cost} budget={budget} />
        ) : (
          <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
            {status === 'empty' && <span>Соберите {need} {pluralRu(need, 'меру', 'меры', 'мер')} — Score пересчитается после каждой</span>}
            {status === 'draft' && (
              <>
                <Chip>Предварительно</Chip>
                <span className="tnum">{count} из {need} {pluralRu(need, 'решения', 'решений', 'решений')}</span>
              </>
            )}
            {status === 'valid' && (
              <>
                <Chip tone="good">План допустим</Chip>
                {improve?.percentile !== null && improve?.percentile !== undefined && (
                  <span className="tnum">
                    лучше {improve.percentileExact ? '' : '≈ '}{f1(Math.min(99.9, improve.percentile))}&nbsp;%
                    {improve.totalPlans ? <> из {improve.totalPlans.toLocaleString('ru-RU')} {pluralRu(improve.totalPlans, 'плана', 'планов', 'планов')}</> : ' возможных планов'}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {!invalid && (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Критических" title={`Показатели ниже ${catalog.rules.criticalThreshold} во всех районах`}>
            {cur && critBefore !== critAfter ? (
              <>
                <span className="font-medium text-ink-2">{critBefore} →</span>{' '}
                <span className={critAfter < critBefore ? 'text-up' : 'text-down'}>{critAfter}</span>
              </>
            ) : (
              critAfter
            )}
          </Tile>
          <Tile
            label="Худший район"
            title={`Район с самой низкой оценкой; он даёт ${Math.round(catalog.rules.score.minWeight * 100)} % веса Score`}
            valueClassName="text-[16px]"
            sub={base ? (cur ? `${f1(base.minDistrictScore)} → ${f1(cur.minDistrictScore)}` : f1(base.minDistrictScore)) : undefined}
          >
            {worstAfter?.name ?? '—'}
          </Tile>
          <Tile
            label="Средняя"
            title="Средняя оценка районов, взвешенная по населению"
            sub={base ? (cur ? `было ${f1(base.cityAverage)}` : 'по городу') : undefined}
          >
            {cur ? f1(cur.cityAverage) : base ? f1(base.cityAverage) : '—'}
          </Tile>
        </div>
      )}

      <div>
        <h3 className="pb-1.5 text-[12px] font-semibold text-ink-2">
          Направления · {catalog.rules.ruleset === 'dataset'
            ? `≤ ${catalog.rules.maxPerDirection} ${pluralRu(catalog.rules.maxPerDirection, 'мера', 'меры', 'мер')} в каждом`
            : 'нужны все'}
        </h3>
        <ul>
          {catalog.directions.map((d) => {
            const max = catalog.rules.maxPerDirection
            const n = coverage[d.id] ?? 0
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 border-t border-line py-1.5">
                <span className="flex min-w-0 items-center gap-2 text-[13px]" title={`По ТЗ: ${d.tzName}`}>
                  <DirectionDot id={d.id} />
                  {d.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {n === 0 && count > 0 && <span className="text-[12px] font-semibold text-[#6b4a00]">не охвачен</span>}
                  {n > max && <span className="text-[12px] font-semibold text-down">больше {max}</span>}
                  <span aria-hidden="true" className="flex gap-[3px]">
                    {Array.from({ length: Math.max(max, n) }, (_, i) => (
                      <span
                        key={i}
                        className="h-1.5 w-3.5 rounded-full transition-colors"
                        style={{ background: i < n ? (i < max ? DIRECTION_COLOR[d.id] : 'var(--color-down)') : 'var(--color-line)' }}
                      />
                    ))}
                  </span>
                  <span className="sr-only">{n} из {max}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {cur && (cur.synergies.length > 0 || cur.missedSynergies.length > 0) && (
        <ul aria-label="Синергии" className="flex flex-col gap-2 text-[13px] leading-snug">
          {cur.synergies.map((s) => (
            <li key={`${s.measureIds.join('+')}-${s.districtId}-${s.indicator}`} className="flex items-start gap-2 text-up">
              <Link2 aria-hidden="true" className="mt-px size-4 shrink-0" />
              <span>
                <b className="font-semibold">Синергия работает:</b>{' '}
                {lcFirst(measureName(catalog, s.measureIds[0]))} + {lcFirst(measureName(catalog, s.measureIds[1]))} → {lcFirst(indicatorName(catalog, s.indicator))}{' '}
                <b className="font-semibold tnum">+{s.bonus.toLocaleString('ru-RU')}</b> {districtLocative(catalog, s.districtId)}
              </span>
            </li>
          ))}
          {uniqueMissed(cur.missedSynergies).map((s) => (
            <li key={`${s.have}-${s.need}-${s.indicator}`} className="flex items-start gap-2 text-ink-2">
              <Link2Off aria-hidden="true" className="mt-px size-4 shrink-0 text-ink-3" />
              <span>
                <b className="font-semibold text-ink">Упущено:</b> к «{measureName(catalog, s.have)}» добавьте «{measureName(catalog, s.need)}» → {lcFirst(indicatorName(catalog, s.indicator))}{' '}
                <b className="font-semibold text-ink tnum">+{s.bonus.toLocaleString('ru-RU')}</b>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Пока сервер пересчитывает план, его прежние ошибки могут устареть. Бюджет —
 * единственное правило, которое мы знаем точно без сервера: ошибку превышения
 * сверяем с текущей стоимостью, остальные показываем как есть (приглушёнными).
 */
function pendingErrors(errors: ApiError[], pending: boolean, cost: number, budget: number): ApiError[] {
  if (!pending) return errors
  const rest = errors.filter((e) => e.code !== 'BUDGET_EXCEEDED')
  return cost > budget ? [{ code: 'BUDGET_EXCEEDED', message: `Бюджет превышен: ${cost} из ${budget}`, measureIds: [] }, ...rest] : rest
}

/** Почему план недопустим и что сделать, чтобы Score снова считался. */
function InvalidReasons({ catalog, sim, pending, errors, decisions, cost, budget }: {
  catalog: Catalog
  sim: SimulateResponse | null
  pending: boolean
  errors: ApiError[]
  decisions: Decision[]
  cost: number
  budget: number
}) {
  const need = catalog.rules.decisions
  const missing = need - decisions.length
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-critical-soft/70 p-3 ring-1 ring-critical/25 ring-inset">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-[#7a1f1f]">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
        {errors.length > 1 ? `Что нарушено · ${errors.length}` : 'Что нарушено'}
      </h3>
      {errors.length > 0 ? (
        <ul className="flex flex-col gap-2.5">
          {errors.map((e, i) => {
            const hint = fixHint(catalog, e, decisions, cost, budget, sim)
            return (
              <li key={`${e.code}-${i}`} className="flex flex-col gap-0.5 text-[13px] leading-snug">
                <span className="font-medium text-[#7a1f1f]">{e.message}</span>
                {hint && <span className="text-ink-2">{hint}</span>}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-[13px] leading-snug text-ink-2">
          {pending ? 'Проверяем план…' : 'Сервер отклонил план. Проверьте районы и совместимость мер в портфеле.'}
        </p>
      )}
      {missing > 0 && (
        <p className="border-t border-critical/20 pt-2 text-[12.5px] leading-snug text-ink-2">
          Ещё не хватает {missing} {pluralRu(missing, 'меры', 'мер', 'мер')} до полного плана из {need}.
        </p>
      )}
    </div>
  )
}

/** Конкретный следующий шаг для каждой ошибки правил. */
function fixHint(catalog: Catalog, e: ApiError, decisions: Decision[], cost: number, budget: number, sim: SimulateResponse | null): string | null {
  const need = catalog.rules.decisions
  switch (e.code) {
    case 'BUDGET_EXCEEDED': {
      const over = cost - budget
      if (over <= 0) return 'Замените одну из мер более дешёвой.'
      const cut = sim?.event && sim.event.budgetDelta < 0 ? `Событие «${sim.event.title}» урезало бюджет до ${budget}. ` : ''
      let priciest: Measure | undefined
      for (const d of decisions) {
        const m = catalog.measures.find((x) => x.id === d.measureId)
        if (m && (!priciest || m.cost > priciest.cost)) priciest = m
      }
      const example = priciest
        ? priciest.cost > over
          ? ` Например, «${measureName(catalog, priciest.id)}» (${priciest.cost} ед.) — на меру до ${priciest.cost - over} ед.`
          : ` Например, уберите «${measureName(catalog, priciest.id)}» (${priciest.cost} ед.).`
        : ''
      return `${cut}Сэкономьте ${over} ед.: замените дорогую меру более дешёвой (кнопка «Заменить» в каталоге).${example}`
    }
    case 'DIRECTION_LIMIT':
      return `Замените одну из этих мер (${e.measureIds.join(', ')}) мерой из другого направления.`
    case 'INCOMPATIBLE_MEASURES': {
      const [a, b] = e.measureIds
      const inc = catalog.incompatibilities.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))
      return inc?.scope === 'sameDistrict'
        ? `Перенесите ${b ?? 'одну из мер'} в другой район — выбор района в портфеле.`
        : `Оставьте только одну из них: ${e.measureIds.join(' или ')}.`
    }
    case 'DUPLICATE_MEASURE':
      return 'Уберите повтор в портфеле.'
    case 'DISTRICT_REQUIRED':
      return 'Выберите район для этой меры в портфеле.'
    case 'CITY_DISTRICT_FORBIDDEN':
      return 'Городская мера действует на весь город — район для неё не указывается.'
    case 'EXACTLY_FIVE_REQUIRED': {
      const extra = decisions.length - need
      return extra > 0 ? `Уберите ${extra} ${pluralRu(extra, 'меру', 'меры', 'мер')}: план состоит ровно из ${need} решений.` : null
    }
    case 'ALL_DIRECTIONS_REQUIRED':
      return 'Добавьте меру из направления, которого ещё нет в плане.'
    case 'UNKNOWN_MEASURE':
    case 'UNKNOWN_DISTRICT':
      return 'Уберите эту меру и добавьте её заново из каталога.'
    default:
      return null
  }
}

function uniqueMissed(list: MissedSynergy[]): MissedSynergy[] {
  const seen = new Map<string, MissedSynergy>()
  for (const s of list) seen.set(`${s.have}-${s.need}-${s.indicator}`, s)
  return [...seen.values()]
}

/**
 * Полоса «база → план → оптимум». Заливка — пройденная доля пути от базы до
 * оптимума; если план хуже базы, шкала продлевается влево и провал закрашен
 * цветом снижения. Без оптимума шкала не рисуется: показываем только базу.
 */
function ScoreScale({ base, score, optimum, hasPlan, eventActive }: { base: number; score: number; optimum: number | null; hasPlan: boolean; eventActive: boolean }) {
  const deficit = hasPlan ? base - score : 0
  const worse = deficit >= 0.005

  if (optimum === null || optimum - base <= 1e-6) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px] text-ink-2 tnum">
        <span>база {f2(base)}</span>
        {worse && <span className="text-down">· ниже базы на <b className="font-semibold">{f2(deficit)}</b></span>}
        {eventActive && <span>· оптимум для условий события считается…</span>}
      </div>
    )
  }

  const lo = Math.min(base, score)
  const hi = Math.max(optimum, score)
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100
  const basePos = pos(base)
  const planPos = pos(score)
  const left = hasPlan ? Math.max(0, optimum - score) : optimum - base
  const reached = hasPlan && left < 0.005

  const label = worse
    ? `Score ${f2(score)} ниже базы ${f2(base)} на ${f2(deficit)}; оптимум ${f2(optimum)}`
    : reached
      ? `Score ${f2(score)} — это оптимум по полному перебору; база ${f2(base)}`
      : `Score ${f2(score)}: база ${f2(base)}, оптимум ${f2(optimum)}, до оптимума ${f2(left)}`

  return (
    <div className="flex flex-col gap-1.5">
      <div role="img" aria-label={label} className="relative h-2.5 rounded-full bg-surface-3">
        {hasPlan && (
          <div
            className={clsx('absolute inset-y-0 rounded-full transition-[left,width] duration-500', worse ? 'bg-down' : 'bg-accent')}
            style={worse ? { left: `${planPos}%`, width: `${basePos - planPos}%` } : { left: `${basePos}%`, width: `${planPos - basePos}%` }}
          />
        )}
        {worse && <div className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-sm bg-ink-2" style={{ left: `${basePos}%` }} />}
        <div className="absolute -top-1 right-0 h-[18px] w-0.5 rounded-sm bg-ink-3" />
        {hasPlan && <div className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-sm bg-ink transition-[left] duration-500" style={{ left: `${planPos}%` }} />}
      </div>
      <div aria-hidden="true" className="flex justify-between gap-2 text-[12px] text-ink-2 tnum">
        {worse ? (
          <span className="text-down">ниже базы на <b className="font-semibold">{f2(deficit)}</b></span>
        ) : (
          <span>база {f2(base)}</span>
        )}
        {worse ? (
          <span>база {f2(base)}</span>
        ) : reached ? (
          <span className="font-semibold text-up">это оптимум</span>
        ) : (
          <span>до оптимума <b className="font-semibold text-ink">{f2(left)}</b></span>
        )}
        <span>оптимум {f2(optimum)}</span>
      </div>
    </div>
  )
}

function Tile({ label, title, sub, valueClassName, children }: { label: string; title?: string; sub?: string; valueClassName?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg bg-surface-2 px-2.5 py-2" title={title}>
      <span className="text-[12px] leading-tight whitespace-nowrap text-ink-2">{label}</span>
      <span className={clsx('leading-tight font-bold break-words tnum', valueClassName ?? 'text-[18px]')}>{children}</span>
      {sub && <span className="text-[12px] leading-tight whitespace-nowrap text-ink-2 tnum">{sub}</span>}
    </div>
  )
}
