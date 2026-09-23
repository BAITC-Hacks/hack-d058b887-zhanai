import { clsx } from 'clsx'
import { f0, f2 } from '../lib/format'
import type { PlanStatus } from '../state/useSimulation'
import { Chip, Delta } from './ui'

interface Props {
  status: PlanStatus
  /** Score для показа: null — не считается (план недопустим) или ещё нет расчёта. */
  score: number | null
  delta: number | null
  /** Ответ сервера ещё относится к прежнему плану. */
  pending: boolean
  count: number
  need: number
  cost: number
  budget: number
}

/**
 * Компактная плашка под шапкой на экранах уже xl: карточка результата там
 * в самом низу, а обратная связь после каждого действия нужна сразу.
 * Нажатие прокручивает к карточке результата.
 */
export function MobileScoreBar({ status, score, delta, pending, count, need, cost, budget }: Props) {
  const over = cost > budget
  const scoreText = score === null ? '—' : f2(score)
  const statusText =
    status === 'invalid' ? 'план недопустим, Score не считается'
    : status === 'draft' ? 'предварительно'
    : status === 'empty' ? 'без мер'
    : 'план допустим'
  const label = `Score ${score === null ? 'не считается' : scoreText}, ${statusText}; решений ${count} из ${need}; бюджет ${f0(cost)} из ${f0(budget)}. Перейти к результату`

  // Не меняем адрес (#…): по хэшу при загрузке открывается готовый сценарий.
  const goToResult = () => {
    const el = document.getElementById('result')
    if (!el) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }

  return (
    <div className="sticky top-0 z-30 border-b border-line bg-page/95 backdrop-blur xl:hidden">
      <button
        type="button"
        onClick={goToResult}
        aria-label={label}
        className="mx-auto flex w-full max-w-[1600px] items-center gap-2 px-4 py-2 text-left md:px-6"
      >
        <span className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">Score</span>
        <span className={clsx('text-[19px] leading-none font-bold tnum transition-opacity', score === null && 'text-ink-3', pending && 'opacity-50')}>
          {scoreText}
        </span>
        {delta !== null && status !== 'invalid' && <Delta value={delta} className={clsx('text-[13px] font-semibold', pending && 'opacity-50')} />}
        {status === 'draft' && <Chip>предв.</Chip>}
        {status === 'invalid' && <Chip tone="critical">недопустим</Chip>}
        <span className="ml-auto flex shrink-0 items-center gap-2.5 text-[12.5px] text-ink-2 tnum">
          <span>
            <span className="hidden sm:inline">мер </span>
            <b className="font-semibold text-ink">{count}</b>/{need}
          </span>
          <span className={clsx(over && 'font-semibold text-down')}>
            <span className={clsx('hidden sm:inline', !over && 'text-ink-3')}>бюджет </span>
            {f0(cost)}/{f0(budget)}
          </span>
        </span>
      </button>
    </div>
  )
}
