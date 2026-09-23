import { useId, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ArrowRightLeft, Check, Info, Plus } from 'lucide-react'
import type { Catalog as CatalogT, Decision, DirectionId, DistrictId, IndicatorId, Measure } from '../../data/dataset'
import type { IndicatorValues } from '../../api'
import { measureAvailability, neediestDistrict, realizedShare, swapOptions } from '../../lib/availability'
import { f2, pluralRu, signed } from '../../lib/format'
import { DIRECTION_COLOR } from '../../lib/scales'
import { Button, Chip, Delta } from '../ui'
import { FloatingHint } from './FloatingHint'
import { AddDistrictPicker, SwapPicker, fmtValue } from './pickers'

export type PickerMode = 'add' | 'swap'

/** Лучшая замена одной меры (из /improve), уже сверенная с текущим планом. */
export interface BestSwap {
  /** Индекс вытесняемого решения в плане. */
  index: number
  remove: Decision
  add: Decision
  score: number
  delta: number
  text: string
}

type Values = Record<DistrictId, IndicatorValues>

interface Props {
  catalog: CatalogT
  measure: Measure
  decisions: Decision[]
  remainingBudget: number
  budget: number
  currentValues: Values
  /** Только если лучшая замена добавляет именно эту меру. */
  bestSwap: BestSwap | null
  open: PickerMode | null
  onOpenChange: (mode: PickerMode | null) => void
  onAdd: (d: Decision) => void
  onSwap: (index: number, d: Decision) => void
}

/** «+4,5», «+3», «−1,5»: одна цифра после запятой, без лишней «,0». */
const fmtEffect = (v: number) => signed(v, 1).replace(/,0$/, '')

export function MeasureCard({ catalog, measure: m, decisions, remainingBudget, budget, currentValues, bestSwap, open, onOpenChange, onAdd, onSwap }: Props) {
  const titleId = useId()
  const toggleId = useId()
  const pickerId = useId()

  const a = measureAvailability(catalog, m, decisions, remainingBudget)
  const inPlan = a.inPlan !== false
  const planFull = a.code === 'full'
  /** Мера недоступна по правилу (направление, несовместимость, бюджет) при неполном плане. */
  const blockedCalm = !inPlan && !a.ok && !planFull
  const options = !inPlan && !a.ok && decisions.length > 0 ? swapOptions(catalog, m, decisions, budget) : null
  // В полном плане «Заменить» есть всегда (в списке видно, что мешает);
  // при неполном — только если есть хотя бы одна допустимая замена.
  const canSwap = options !== null && (planFull || options.some((o) => !o.blockedReason))
  const isDistrict = m.scope === 'district'
  const addOpen = open === 'add' && a.ok && isDistrict
  const swapOpen = open === 'swap' && canSwap

  const toggle = (mode: PickerMode) => onOpenChange(open === mode ? null : mode)
  const close = () => {
    onOpenChange(null)
    document.getElementById(toggleId)?.focus()
  }

  const inPlanDistrict = a.inPlan ? catalog.districts.find((d) => d.id === a.inPlan)?.name : null

  let action: ReactNode = null
  if (a.ok) {
    action = (
      <Button
        id={toggleId}
        size="sm"
        className="shrink-0"
        aria-label={isDistrict ? `Выбрать район для ${m.id}` : `Добавить ${m.id}: ${m.name}`}
        aria-expanded={isDistrict ? addOpen : undefined}
        aria-controls={addOpen ? pickerId : undefined}
        onClick={() => (isDistrict ? toggle('add') : onAdd({ measureId: m.id, districtId: null }))}
      >
        <Plus aria-hidden="true" className="size-3.5" /> {isDistrict ? 'Выбрать район' : 'Добавить'}
      </Button>
    )
  } else if (canSwap && bestSwap) {
    action = (
      <button
        id={toggleId}
        type="button"
        aria-expanded={swapOpen}
        aria-controls={swapOpen ? pickerId : undefined}
        onClick={() => toggle('swap')}
        className="shrink-0 rounded px-1 py-0.5 text-[12px] font-medium text-ink-2 underline decoration-dotted underline-offset-2 hover:text-ink"
      >
        Другая замена
      </button>
    )
  } else if (canSwap) {
    action = (
      <Button
        id={toggleId}
        size="sm"
        className="shrink-0"
        aria-label={`Заменить на ${m.id}: ${m.name}`}
        aria-expanded={swapOpen}
        aria-controls={swapOpen ? pickerId : undefined}
        onClick={() => toggle('swap')}
      >
        <ArrowRightLeft aria-hidden="true" className="size-3.5" /> Заменить
      </Button>
    )
  }

  return (
    <article aria-labelledby={titleId} className={clsx('card flex min-w-0 flex-col gap-2.5 p-3.5', inPlan && 'ring-2 ring-accent/50')}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h4 id={titleId} className={clsx('text-[15px] leading-snug font-semibold [overflow-wrap:break-word]', blockedCalm ? 'text-ink-2' : 'text-ink')}>
            {m.name}
          </h4>
          <p className="text-[12px] text-ink-2">
            <span className="tnum">{m.id}</span> · {isDistrict ? 'в одном районе' : 'весь город'}
          </p>
        </div>
        <div className="shrink-0 text-right tnum">
          <div className="text-[18px] leading-tight font-bold">{m.cost}</div>
          <div className="text-[11px] text-ink-3">ед.</div>
        </div>
      </header>

      <Effects catalog={catalog} measure={m} synergyHint={a.synergyHint} />
      <QuarterTimeline lag={m.lag} horizon={catalog.rules.horizonQuarters} directionId={m.directionId} />

      <footer className="flex flex-col gap-2 border-t border-surface-3 pt-2.5">
        {inPlan ? (
          <div className="flex items-center gap-2">
            <Chip tone="accent">
              <Check aria-hidden="true" className="size-3" /> в плане{inPlanDistrict ? ` · ${inPlanDistrict}` : ''}
            </Chip>
          </div>
        ) : (
          <>
            {blockedCalm && a.reason && (
              <p className="flex items-start gap-1.5 text-[12px] leading-snug text-ink-3">
                <Info aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0">{a.reason}</span>
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <Placement catalog={catalog} measure={m} currentValues={currentValues} />
              {action}
            </div>
          </>
        )}
        {bestSwap && <BestSwapBox catalog={catalog} measure={m} swap={bestSwap} onSwap={onSwap} />}
      </footer>

      {addOpen && (
        <AddDistrictPicker
          id={pickerId}
          catalog={catalog}
          measure={m}
          decisions={decisions}
          currentValues={currentValues}
          onPick={(districtId) => onAdd({ measureId: m.id, districtId })}
          onClose={close}
        />
      )}
      {swapOpen && options && (
        <SwapPicker
          id={pickerId}
          catalog={catalog}
          measure={m}
          decisions={decisions}
          currentValues={currentValues}
          options={options}
          suggestion={bestSwap ? { index: bestSwap.index, districtId: bestSwap.add.districtId } : null}
          onSwap={onSwap}
          onClose={close}
        />
      )}
    </article>
  )
}

function effectHint(indicatorName: string, meaning: string, full: number, realized: number, lag: number, horizon: number) {
  const quarters = (n: number) => pluralRu(n, 'квартал', 'квартала', 'кварталов')
  const prep =
    lag <= 0 ? 'действует с первого квартала'
    : lag >= horizon ? 'за горизонт не успевает проявиться'
    : lag === 1 ? 'первый квартал мера готовится'
    : `первые ${lag} ${quarters(lag)} мера готовится`
  return `Полный эффект ${fmtEffect(full)}, за ${horizon} ${quarters(horizon)} успевает ${fmtEffect(realized)}: ${prep}. ${indicatorName}: ${meaning}.`
}

/** Эффект, который мера успевает дать за горизонт: значение × (H − лаг) / H. */
function Effects({ catalog, measure: m, synergyHint }: { catalog: CatalogT; measure: Measure; synergyHint: string | null }) {
  const H = catalog.rules.horizonQuarters
  const share = realizedShare(m.lag, H)
  return (
    <ul aria-label={`Эффект за ${H} ${pluralRu(H, 'квартал', 'квартала', 'кварталов')}`} className="flex min-w-0 flex-wrap gap-1.5">
      {(Object.entries(m.effects) as [IndicatorId, number][]).map(([id, full]) => {
        const info = catalog.indicators.find((i) => i.id === id)
        const realized = full * share
        return (
          <li key={id} className="flex max-w-full">
            <FloatingHint text={effectHint(info?.name ?? id, info?.meaning ?? '', full, realized, m.lag, H)}>
              <span
                className={clsx(
                  'inline-flex max-w-full flex-wrap items-baseline gap-x-1 rounded-md px-2 py-1 text-[12.5px] leading-tight',
                  full < 0 ? 'bg-critical-soft text-[#7a1f1f]' : 'bg-accent-soft/50 text-accent-ink',
                )}
              >
                <span>{info?.name ?? id}</span>
                <b className="font-semibold tnum">{fmtEffect(realized)}</b>
              </span>
            </FloatingHint>
          </li>
        )
      })}
      {synergyHint && (
        <li className="flex max-w-full">
          <span className="inline-flex max-w-full items-center rounded-md bg-good-soft px-2 py-1 text-[12.5px] leading-tight text-[#0a4d0a]">{synergyHint}</span>
        </li>
      )}
    </ul>
  )
}

/** Мини-шкала кварталов: первые `lag` серые (мера готовится), дальше — цвет направления. */
function QuarterTimeline({ lag, horizon, directionId }: { lag: number; horizon: number; directionId: DirectionId }) {
  if (horizon <= 0) return null
  const idle = Math.min(horizon, Math.max(0, lag))
  const works = horizon - idle
  const of = pluralRu(horizon, 'квартала', 'кварталов', 'кварталов')
  const start = works === 0 ? 'эффект не успевает начаться' : idle === 0 ? 'эффект с первого квартала' : `эффект с ${idle + 1}-го квартала`
  const label = `Работает ${works} из ${horizon} ${of}: ${start}`
  return (
    <div className="flex items-center gap-2">
      <div role="img" aria-label={label} title={label} className="grid w-24 shrink-0 gap-0.5" style={{ gridTemplateColumns: `repeat(${horizon}, minmax(0, 1fr))` }}>
        {Array.from({ length: horizon }, (_, i) => (
          <span key={i} className={clsx('h-1.5 rounded-[2px]', i < idle && 'bg-line')} style={i >= idle ? { background: DIRECTION_COLOR[directionId] } : undefined} />
        ))}
      </div>
      <span aria-hidden="true" className="text-[12px] text-ink-2">
        работает {works} из {horizon} {of}
      </span>
    </div>
  )
}

/** «Нужнее всего: Нура · Доступность транспорта 40» или «Действует во всех районах». */
function Placement({ catalog, measure: m, currentValues }: { catalog: CatalogT; measure: Measure; currentValues: Values }) {
  if (m.scope === 'city') return <p className="min-w-0 flex-1 text-[12px] leading-snug text-ink-2">Действует во всех районах</p>
  const n = neediestDistrict(catalog, m, currentValues)
  if (!n) return <span className="flex-1" />
  const d = catalog.districts.find((x) => x.id === n.districtId)
  const ind = catalog.indicators.find((i) => i.id === n.indicator)
  const critical = n.value < catalog.rules.criticalThreshold
  return (
    <p className="min-w-0 flex-1 text-[12px] leading-snug text-ink-2">
      Нужнее всего: <span className="font-semibold text-ink">{d?.name ?? n.districtId}</span> · {ind?.name ?? n.indicator}{' '}
      <span className={clsx('tnum', critical && 'font-semibold text-critical')}>{fmtValue(n.value)}</span>
    </p>
  )
}

/** Зелёная подсказка «Вместо M5 в Сарыарке → в Нуре: Score 57,21 +0,66» с кнопкой в один клик. */
function BestSwapBox({ catalog, measure: m, swap, onSwap }: { catalog: CatalogT; measure: Measure; swap: BestSwap; onSwap: (index: number, d: Decision) => void }) {
  const locative = (id: DistrictId | null) => (id ? (catalog.districts.find((d) => d.id === id)?.locative ?? id) : 'по городу')
  const removed = catalog.measures.find((x) => x.id === swap.remove.measureId)
  const isMove = swap.remove.measureId === m.id
  const addPlace = swap.add.districtId ? locative(swap.add.districtId) : null
  const label = isMove
    ? `Перенести ${m.id}${addPlace ? `: лучше ${addPlace}` : ''}`
    : `Заменить ${swap.remove.measureId} ${locative(swap.remove.districtId)} на ${m.id}${addPlace ? ` ${addPlace}` : ''}`
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-good-soft px-2.5 py-2">
      <p className="min-w-0 text-[12.5px] leading-snug text-[#0a4d0a]" title={swap.text}>
        {isMove ? (
          <>Лучше {addPlace}</>
        ) : (
          <>
            Вместо <span title={removed?.name}>{swap.remove.measureId}</span> {locative(swap.remove.districtId)}
            {addPlace && <> → {addPlace}</>}
          </>
        )}
        : Score <b className="font-semibold tnum">{f2(swap.score)}</b> <Delta value={swap.delta} className="font-semibold" />
      </p>
      <Button variant="primary" size="sm" className="shrink-0" aria-label={label} onClick={() => onSwap(swap.index, swap.add)}>
        {isMove ? 'Перенести' : 'Заменить'}
      </Button>
    </div>
  )
}
