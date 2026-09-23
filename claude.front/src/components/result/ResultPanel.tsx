import { clsx } from 'clsx'
import { CircleAlert, Link2, Link2Off } from 'lucide-react'
import type { Catalog } from '../../data/dataset'
import type { ImproveResponse, SimulateResponse } from '../../api'
import { useCountUp } from '../../lib/useCountUp'
import { f1, f2 } from '../../lib/format'
import { Delta, DirectionDot, SectionTitle } from '../ui'
import type { PlanStatus } from '../../App'

interface Props {
  catalog: Catalog
  sim: SimulateResponse | null
  loading: boolean
  status: PlanStatus
  decisionCount: number
  improve: ImproveResponse | null
}

export function ResultPanel({ catalog, sim, loading, status, decisionCount, improve }: Props) {
  const shown = sim?.result ?? sim?.preview ?? null
  const base = sim?.baseline
  const score = shown && decisionCount > 0 ? shown.score : (base?.score ?? 0)
  const animated = useCountUp(score, 600)
  const delta = shown && decisionCount > 0 ? shown.delta : 0
  const critBefore = base?.criticalCount ?? 0
  const critAfter = shown && decisionCount > 0 ? shown.criticalCount : critBefore
  const minBefore = base ? catalog.districts.find((d) => d.id === base.minDistrictId)! : null
  const minAfter = shown && decisionCount > 0 ? catalog.districts.find((d) => d.id === shown.minDistrictId)! : minBefore

  return (
    <section aria-label="Результат" className={clsx('card p-4 transition-opacity', loading && 'opacity-80')} aria-busy={loading}>
      <SectionTitle aside={base ? <span className="tnum">база {f2(base.score)}</span> : null}>{status === 'draft' ? 'Предварительная оценка' : 'Astana Quality of Life Score'}</SectionTitle>
      <div className="flex items-end gap-3">
        <div data-testid="score" className="score-number text-[48px] leading-none font-semibold tracking-tight">{sim && status !== 'invalid' ? f2(animated) : '—'}</div>
        {shown && decisionCount > 0 && <Delta value={delta} className="mb-1 text-xl font-medium" />}
      </div>
      <div className="mt-2 min-h-5 text-[12px]">
        {loading ? <span className="text-ink-2" role="status">Пересчитываем текущий план…</span> : status === 'empty' && <span className="text-ink-3">Соберите пять мер, и балл пересчитается на каждом шаге</span>}
        {status === 'draft' && <span className="text-ink-2">Предварительно · {decisionCount} из {catalog.rules.decisions} решений</span>}
        {status === 'valid' && (
          <span className="text-ink-2">
            План допустим
            {improve?.percentile !== null && improve?.percentile !== undefined && (
              <>
                {' · '}лучше {improve.percentileExact ? '' : '≈ '}<span className="font-medium text-ink tnum">{f1(improve.percentile)} %</span>
                {improve.totalPlans ? <> из <span className="tnum">{improve.totalPlans.toLocaleString('ru-RU')}</span> допустимых планов</> : ' возможных планов'}
              </>
            )}
          </span>
        )}
        {status === 'invalid' && sim && (
          <ul className="space-y-1">
            {sim.errors.filter((e) => e.code !== 'EXACTLY_FIVE_REQUIRED' || decisionCount > catalog.rules.decisions).map((e) => (
              <li key={e.code + e.measureIds.join()} className="flex items-start gap-1.5 text-down"><CircleAlert className="mt-0.5 size-3.5 shrink-0" /> {e.message}</li>
            ))}
          </ul>
        )}
      </div>

      {sim && <div className="mt-4 grid grid-cols-3 gap-2">
        <Tile label="Критических" value={critAfter} before={decisionCount > 0 ? critBefore : null} lowerIsBetter />
        <Tile label="Худший район" text={minAfter?.name ?? '—'} sub={shown && decisionCount > 0 ? `${f1(base!.minDistrictScore)} → ${f1(shown.minDistrictScore)}` : base ? f1(base.minDistrictScore) : ''} />
        <Tile label="Средняя по городу" text={shown && decisionCount > 0 ? f1(shown.cityAverage) : base ? f1(base.cityAverage) : '—'} sub={shown && decisionCount > 0 ? `было ${f1(base!.cityAverage)}` : 'взвешено по населению'} />
      </div>}

      {shown && (
        <div className="mt-4 grid grid-cols-5 gap-1" aria-label="Покрытие направлений">
          {catalog.directions.map((d) => {
            const n = decisionCount > 0 ? shown.directionCoverage[d.id] : 0
            return (
              <div key={d.id} className={clsx('rounded-md border px-1.5 py-1 text-center text-[11px]', n === 0 ? 'border-dashed border-line text-ink-3' : 'border-line bg-surface-2 text-ink-2')} title={d.tzName}>
                <div className="flex items-center justify-center gap-1"><DirectionDot id={d.id} /><span className="tnum">{n}/{catalog.rules.maxPerDirection}</span></div>
                <div className="truncate">{d.name}</div>
              </div>
            )
          })}
        </div>
      )}

      {shown && decisionCount > 0 && (shown.synergies.length > 0 || shown.missedSynergies.length > 0) && (
        <ul className="mt-3 space-y-1 text-[12px]">
          {shown.synergies.map((s) => (
            <li key={s.measureIds.join()} className="flex items-center gap-1.5 text-up"><Link2 className="size-3.5" /> Синергия {s.measureIds[0]} + {s.measureIds[1]}: {catalog.indicators.find((i) => i.id === s.indicator)?.name} +{s.bonus}</li>
          ))}
          {shown.missedSynergies.map((s) => (
            <li key={s.have + s.need} className="flex items-center gap-1.5 text-ink-2"><Link2Off className="size-3.5 text-ink-3" /> К {s.have} добавьте {s.need}: +{s.bonus} к «{catalog.indicators.find((i) => i.id === s.indicator)?.name}»</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Tile({ label, value, before, text, sub, lowerIsBetter }: { label: string; value?: number; before?: number | null; text?: string; sub?: string; lowerIsBetter?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      {value !== undefined ? (
        <div className="mt-0.5 text-[20px] leading-tight font-semibold tnum">
          {before !== null && before !== undefined && before !== value ? (
            <>
              <span className="text-[14px] font-medium text-ink-3">{before} → </span>
              <span className={clsx(lowerIsBetter ? (value < before ? 'text-up' : 'text-down') : '')}>{value}</span>
            </>
          ) : value}
        </div>
      ) : (
        <div className="mt-0.5 truncate text-[16px] leading-tight font-semibold">{text}</div>
      )}
      {sub && <div className="text-[11px] text-ink-3 tnum">{sub}</div>}
    </div>
  )
}
