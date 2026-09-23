import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { clsx } from 'clsx'
import { Ban } from 'lucide-react'
import type { Catalog as CatalogT, Decision, DistrictId, Measure } from '../../data/dataset'
import type { IndicatorValues } from '../../api'
import { districtOptions, primaryIndicator, valuesWithout, type DistrictOption, type SwapOption } from '../../lib/availability'
import { f1 } from '../../lib/format'
import { Chip, DirectionDot } from '../ui'

type Values = Record<DistrictId, IndicatorValues>

/** «40», «43,8»: без лишней «,0». */
export const fmtValue = (v: number) => f1(v).replace(/,0$/, '')

/** Общая рамка встроенного выбора: заголовок, «Отмена», Esc закрывает. */
function PickerFrame({ id, label, title, onClose, children }: { id: string; label: string; title: ReactNode; onClose: () => void; children: ReactNode }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    onClose()
  }
  return (
    <div id={id} role="group" aria-label={label} onKeyDown={onKeyDown} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-2.5 animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[12px] leading-snug font-medium text-ink-2">{title}</div>
        <button type="button" onClick={onClose} className="-my-0.5 shrink-0 rounded px-1 py-0.5 text-[12px] text-ink-3 hover:bg-surface-3 hover:text-ink">
          Отмена
        </button>
      </div>
      {children}
    </div>
  )
}

const Step = ({ n, of }: { n: number; of: number }) => <span className="font-normal text-ink-3"> · шаг {n} из {of}</span>

/** Список районов с текущим значением главного показателя меры. */
function DistrictChoiceList({ catalog, options, recommended, listRef, onPick }: {
  catalog: CatalogT
  options: DistrictOption[]
  recommended?: DistrictId | null
  listRef?: RefObject<HTMLDivElement | null>
  onPick: (d: DistrictId) => void
}) {
  return (
    <div ref={listRef} className="flex flex-col gap-1">
      {options.map((o) => {
        const d = catalog.districts.find((x) => x.id === o.districtId)
        const blocked = !!o.blockedReason
        const critical = o.value < catalog.rules.criticalThreshold
        const preferred = !blocked && (recommended ? recommended === o.districtId : o.isWorst)
        return (
          <button
            key={o.districtId}
            type="button"
            disabled={blocked}
            data-preferred={preferred || undefined}
            onClick={() => onPick(o.districtId)}
            className={clsx(
              'flex min-h-9 w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-[13px] transition-colors',
              blocked
                ? 'cursor-not-allowed border-transparent text-ink-3'
                : o.isWorst
                  ? 'border-accent bg-accent-soft/40 hover:bg-accent-soft/70'
                  : 'border-line bg-surface hover:border-ink',
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className={clsx('font-medium', blocked ? 'text-ink-2' : 'text-ink')}>{d?.name ?? o.districtId}</span>
                {o.isWorst && !blocked && <Chip tone="accent">нужнее всего</Chip>}
                {recommended === o.districtId && !blocked && <Chip tone="good">лучшая замена</Chip>}
              </span>
              {blocked && (
                <span className="flex items-start gap-1 text-[12px] leading-snug">
                  <Ban aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                  {o.blockedReason}
                </span>
              )}
            </span>
            <span className={clsx('shrink-0 tnum text-[13px]', critical ? 'font-semibold text-critical' : 'text-ink-2')}>{fmtValue(o.value)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Выбор района при добавлении районной меры. */
export function AddDistrictPicker({ id, catalog, measure, decisions, currentValues, onPick, onClose }: {
  id: string
  catalog: CatalogT
  measure: Measure
  decisions: Decision[]
  currentValues: Values
  onPick: (d: DistrictId) => void
  onClose: () => void
}) {
  const options = districtOptions(catalog, measure, decisions, currentValues)
  const ind = catalog.indicators.find((i) => i.id === primaryIndicator(measure))
  return (
    <PickerFrame id={id} label={`Район для ${measure.id}`} title={<>Куда? Сейчас «{ind?.name}»:</>} onClose={onClose}>
      <DistrictChoiceList catalog={catalog} options={options} onPick={onPick} />
    </PickerFrame>
  )
}

export interface SwapSuggestion {
  index: number
  districtId: DistrictId | null
}

/**
 * Замена меры в полном плане. Шаг 1 — какое решение вытеснить (городская мера
 * меняется сразу по клику). Шаг 2 для районной меры — район, с подсказкой
 * «нужнее всего» по показателям без вытесняемой меры.
 */
export function SwapPicker({ id, catalog, measure, decisions, currentValues, options, suggestion, onSwap, onClose }: {
  id: string
  catalog: CatalogT
  measure: Measure
  decisions: Decision[]
  currentValues: Values
  options: SwapOption[]
  suggestion: SwapSuggestion | null
  onSwap: (index: number, d: Decision) => void
  onClose: () => void
}) {
  const isDistrict = measure.scope === 'district'
  const [removeIndex, setRemoveIndex] = useState<number | null>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const districtsRef = useRef<HTMLDivElement>(null)
  /** Фокус переносим только после действий пользователя, не при открытии. */
  const moved = useRef(false)
  const lastIndex = useRef<number | null>(null)

  useEffect(() => {
    if (!moved.current) return
    if (removeIndex !== null) {
      const list = districtsRef.current
      const target = list?.querySelector<HTMLButtonElement>('button[data-preferred]:not(:disabled)') ?? list?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      target?.focus()
    } else {
      const rows = rowsRef.current
      const target = rows?.querySelector<HTMLButtonElement>(`button[data-index="${lastIndex.current}"]`) ?? rows?.querySelector<HTMLButtonElement>('button:not(:disabled)')
      target?.focus()
    }
  }, [removeIndex])

  const selected = removeIndex !== null ? options.find((o) => o.index === removeIndex) ?? null : null

  const place = (d: Decision) => (d.districtId ? (catalog.districts.find((x) => x.id === d.districtId)?.name ?? d.districtId) : 'весь город')
  const ind = catalog.indicators.find((i) => i.id === primaryIndicator(measure))

  const pickRow = (o: SwapOption) => {
    if (!isDistrict) {
      onSwap(o.index, { measureId: measure.id, districtId: null })
      return
    }
    moved.current = true
    lastIndex.current = o.index
    setRemoveIndex(o.index)
  }
  const back = () => {
    moved.current = true
    setRemoveIndex(null)
  }

  if (selected && isDistrict) {
    const rm = selected.removed
    // Подсказываем район по показателям так, будто вытесняемой меры уже нет.
    const rest = decisions.filter((_, i) => i !== selected.index)
    const districtChoices = districtOptions(catalog, measure, rest, valuesWithout(catalog, currentValues, selected.decision))
    return (
      <PickerFrame id={id} label={`Замена на ${measure.id}: выбор района`} title={<>Куда поставить {measure.id}?<Step n={2} of={2} /></>} onClose={onClose}>
        <div className="flex items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5 ring-1 ring-line">
          <span className="min-w-0 text-[12px] leading-snug text-ink-2">
            Убрать: <span className="font-semibold text-ink">{rm?.name ?? selected.decision.measureId}</span> · {place(selected.decision)}
          </span>
          <button type="button" onClick={back} className="shrink-0 rounded px-1 text-[12px] text-ink-2 underline decoration-dotted underline-offset-2 hover:text-ink">
            изменить
          </button>
        </div>
        <p className="text-[12px] text-ink-3">«{ind?.name}» по районам без убранной меры:</p>
        <DistrictChoiceList
          catalog={catalog}
          options={districtChoices}
          recommended={suggestion && suggestion.index === selected.index ? suggestion.districtId : null}
          listRef={districtsRef}
          onPick={(districtId) => onSwap(selected.index, { measureId: measure.id, districtId })}
        />
      </PickerFrame>
    )
  }

  return (
    <PickerFrame
      id={id}
      label={`Замена на ${measure.id}: какую меру убрать`}
      title={<>Какую меру из плана убрать?{isDistrict && <Step n={1} of={2} />}</>}
      onClose={onClose}
    >
      <div ref={rowsRef} className="flex flex-col gap-1">
        {options.map((o) => {
          const blocked = !!o.blockedReason
          const recommended = !blocked && suggestion?.index === o.index
          return (
            <button
              key={`${o.index}-${o.decision.measureId}`}
              type="button"
              data-index={o.index}
              disabled={blocked}
              onClick={() => pickRow(o)}
              className={clsx(
                'flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
                blocked
                  ? 'cursor-not-allowed border-transparent'
                  : recommended
                    ? 'border-good/50 bg-good-soft/60 hover:border-good'
                    : 'border-line bg-surface hover:border-ink',
              )}
            >
              {o.removed && <DirectionDot id={o.removed.directionId} className="mt-[5px]" />}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={clsx('text-[13px] leading-snug font-medium', blocked ? 'text-ink-2' : 'text-ink')}>{o.removed?.name ?? o.decision.measureId}</span>
                <span className="text-[12px] text-ink-3">
                  <span className="tnum">{o.decision.measureId}</span> · {place(o.decision)}
                  {o.removed && <> · <span className="tnum">{o.removed.cost}</span> ед.</>}
                </span>
                {blocked && (
                  <span className="flex items-start gap-1 text-[12px] leading-snug text-ink-3">
                    <Ban aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                    {o.blockedReason}
                  </span>
                )}
              </span>
              {recommended && <Chip tone="good" className="mt-px shrink-0">лучшая</Chip>}
            </button>
          )
        })}
      </div>
    </PickerFrame>
  )
}
