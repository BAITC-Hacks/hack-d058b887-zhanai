import { clsx } from 'clsx'
import { Bot, Check, FlaskConical, Info, Lightbulb, Play, RefreshCw, Search, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import type { Catalog, Decision } from '../../data/dataset'
import { api } from '../../api'
import type { AgentResponse, AgentStep } from '../../api'
import { f2 } from '../../lib/format'
import { planKey } from '../../state/useSimulation'
import { Button, Chip, Delta, SectionTitle } from '../ui'

interface Props {
  catalog: Catalog
  decisions: Decision[]
  eventId: string | null
  onApply: (decisions: Decision[]) => void
}

const GOAL_MAX = 300

/** С чем запускали агента: план и событие отдельно, чтобы объяснить, что именно устарело. */
interface RunTag {
  plan: string
  eventId: string | null
}

export function AgentPanel({ catalog, decisions, eventId, onApply }: Props) {
  const goalId = useId()
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AgentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runTag, setRunTag] = useState<RunTag | null>(null)
  const requestId = useRef(0)

  const canRun = decisions.length > 0
  const hasOutput = data !== null || error !== null
  const planChanged = runTag !== null && runTag.plan !== planKey(decisions, null)
  const eventChanged = runTag !== null && runTag.eventId !== eventId
  const stale = hasOutput && (planChanged || eventChanged)

  const run = () => {
    if (!canRun) return
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    setRunTag({ plan: planKey(decisions, null), eventId })
    api
      .agent(decisions, eventId, goal)
      .then((r) => { if (id === requestId.current) setData(r) })
      .catch((e: unknown) => {
        if (id !== requestId.current) return
        setData(null)
        setError(e instanceof Error ? e.message : 'Агент не ответил')
      })
      .finally(() => { if (id === requestId.current) setLoading(false) })
  }

  const describe = (d: Decision) => {
    const m = catalog.measures.find((x) => x.id === d.measureId)
    const district = d.districtId ? (catalog.districts.find((x) => x.id === d.districtId)?.name ?? d.districtId) : 'весь город'
    return `${d.measureId} · ${m?.name ?? 'неизвестная мера'} · ${district}`
  }

  const rec = data?.recommendation ?? null
  // Числа рекомендации посчитаны при прежнем событии: применять её после смены события нельзя.
  const recBlocked = !rec?.valid || eventChanged
  const staleText = eventChanged
    ? planChanged
      ? 'План и событие изменились — выводы агента относятся к прежним условиям'
      : 'Событие изменилось — агент считал при прежних условиях'
    : 'План изменился — выводы агента относятся к прежнему набору'

  return (
    <section aria-label="AI-агент" className="card p-4" aria-busy={loading}>
      <SectionTitle aside={data?.status === 'ai' && !loading ? <Chip tone="accent"><Bot aria-hidden="true" className="size-3" /> {data.model ?? 'AI'}</Chip> : null}>
        AI-агент
      </SectionTitle>

      <p className="text-[13px] text-ink-2">
        Агент сам вызывает симулятор: проверяет ваш план, ищет замены и перепроверяет лучший вариант. Числа в шагах и в рекомендации посчитал симулятор сервера, текст агента — пояснение к ним.
      </p>

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => { e.preventDefault(); if (!loading) run() }}
      >
        <label htmlFor={goalId} className="block text-[12px] font-medium text-ink-2">Цель для агента (необязательно)</label>
        <input
          id={goalId}
          type="text"
          value={goal}
          maxLength={GOAL_MAX}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="например: подтянуть Нуру и уложиться в 90"
          className="h-9 w-full rounded-lg border border-line-2 bg-surface px-3 text-[13px] placeholder:text-ink-3 focus:border-ink-3 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-3">{canRun ? '' : 'Добавьте хотя бы одну меру'}</span>
          <Button type="submit" variant="primary" size="sm" disabled={loading || !canRun}>
            <Play aria-hidden="true" className="size-3.5" /> {loading ? 'Агент работает…' : 'Запустить агента'}
          </Button>
        </div>
      </form>

      {/* Живая область: скринридер узнает, что выводы агента устарели. */}
      <div aria-live="polite">
        {!loading && stale && data?.status === 'ai' && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-[#6b4a00]">
            <span className="min-w-0 flex-1">{staleText}</span>
            <Button size="sm" onClick={run} disabled={!canRun}><RefreshCw aria-hidden="true" className="size-3.5" /> Запустить снова</Button>
          </div>
        )}
      </div>

      {loading && (
        <div className="mt-4 space-y-2" aria-label="Агент работает">
          <p className="text-[13px] text-ink-2" role="status">Агент проверяет гипотезы в симуляторе… обычно 15–40 секунд</p>
          <div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-3/4" />
          <div className="skeleton mt-3 h-3 w-1/3" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-2/3" />
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mt-4 flex flex-col items-start gap-2 rounded-lg bg-critical-soft px-3 py-2.5 text-[13px] text-[#7a1f1f]">
          <div className="flex items-start gap-2"><ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>
          <Button size="sm" onClick={run} disabled={!canRun}><RefreshCw aria-hidden="true" className="size-3.5" /> Повторить</Button>
        </div>
      )}

      {!loading && data && data.status !== 'ai' && (
        <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
          <div className="flex items-start gap-2">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="space-y-1">
              <p>{data.reason ?? (data.status === 'unavailable' ? 'AI-агент сейчас недоступен.' : 'Агент завершился с ошибкой.')}</p>
              {data.status === 'unavailable' && <p className="text-[12px] text-ink-3">Впишите OPENAI_API_KEY в product.v2/.env и перезапустите ./scripts/start.sh</p>}
            </div>
          </div>
        </div>
      )}

      {!loading && data?.status === 'ai' && (
        <div className={clsx('mt-4 space-y-4 text-[13px] leading-relaxed transition-opacity', stale && 'opacity-50')}>
          {data.grounded ? (
            <Chip tone="good" title="Каждое число в тексте агента найдено в результатах симулятора">
              <Check aria-hidden="true" className="size-3" /> числа в тексте сверены с расчётом
            </Chip>
          ) : (
            <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-[#6b4a00]" title="В тексте агента есть числа, которых нет в результатах симулятора">
              <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              <span>{data.groundingNote ?? 'В тексте есть неподтверждённые числа — опирайтесь на расчёт в шагах.'}</span>
            </p>
          )}
          {data.summary && <p className="font-medium">{data.summary}</p>}

          {data.steps.length > 0 && (
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">Ход работы агента</span>
                <VerifiedChip />
              </div>
              <ol className="space-y-2">
                {data.steps.map((s, i) => <StepRow key={i} step={s} />)}
              </ol>
            </div>
          )}

          {rec && (
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="mb-1.5 text-[12px] font-semibold">Рекомендация агента</div>
              <ul className="space-y-0.5">
                {rec.decisions.map((d) => <li key={`${d.measureId}-${d.districtId ?? 'city'}`} className="tnum">{describe(d)}</li>)}
              </ul>
              {rec.rationale && <p className="mt-2 text-ink-2">{rec.rationale}</p>}
              {rec.valid ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] tnum">
                  <VerifiedChip />
                  <span>
                    Score <span className="font-medium">{rec.score !== null ? f2(rec.score) : '—'}</span>
                    {rec.delta !== null && <> (<Delta value={rec.delta} />)</>}
                    {rec.cost !== null && <>, стоимость {rec.cost}</>}
                    {rec.criticalCount !== null && <>, критических {rec.criticalCount}</>}
                  </span>
                </div>
              ) : (
                <div className="mt-2 text-[12px] text-[#7a1f1f]">
                  <div className="font-medium">План недопустим:</div>
                  <ul className="list-disc pl-4">{rec.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              <div className="mt-2 flex items-center justify-end gap-2">
                {rec.valid && eventChanged && <span className="text-[12px] text-ink-3">событие сменилось — запустите агента снова</span>}
                <Button size="sm" onClick={() => onApply(rec.decisions)} disabled={recBlocked}>Применить план</Button>
              </div>
            </div>
          )}

          <Block icon={<Lightbulb aria-hidden="true" className="size-4 text-accent" />} title="Выводы" items={data.findings} />
          <Block icon={<TriangleAlert aria-hidden="true" className="size-4 text-serious" />} title="Риски" items={data.risks} />
        </div>
      )}
    </section>
  )
}

/** Числа шагов и рекомендации сервер получает из симулятора — они проверены всегда. */
function VerifiedChip() {
  return (
    <Chip tone="good" title="Эти числа посчитал симулятор сервера, а не модель">
      <FlaskConical aria-hidden="true" className="size-3" /> проверено симулятором
    </Chip>
  )
}

function StepRow({ step }: { step: AgentStep }) {
  const Icon = step.tool === 'simulate_plan' ? FlaskConical : Search
  return (
    <li className="flex gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span>{step.title}</span>
          <span className="shrink-0 text-[12px] tnum">
            {step.valid === false ? (
              <Chip tone="critical">недопустим</Chip>
            ) : (
              <>
                {step.score !== null && <>Score <span className="font-medium">{f2(step.score)}</span></>}
                {step.delta !== null && <Delta value={step.delta} className="ml-1" />}
                {step.cost !== null && <span className="ml-1 text-ink-3">· стоимость {step.cost}</span>}
              </>
            )}
          </span>
        </div>
        {step.note && <p className="text-[12px] text-ink-3">{step.note}</p>}
      </div>
    </li>
  )
}

function Block({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">{icon} {title}</div>
      <ul className="space-y-1 pl-1">
        {items.map((t, i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-3" />{t}</li>)}
      </ul>
    </div>
  )
}
