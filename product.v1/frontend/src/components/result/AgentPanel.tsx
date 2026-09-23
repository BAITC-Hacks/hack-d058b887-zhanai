import { clsx } from 'clsx'
import { Bot, FlaskConical, Info, Lightbulb, Play, Search, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import type { Catalog, Decision } from '../../data/dataset'
import { api } from '../../api'
import type { AgentResponse, AgentStep } from '../../api'
import { f2 } from '../../lib/format'
import { Button, Chip, Delta, SectionTitle } from '../ui'

interface Props {
  catalog: Catalog
  decisions: Decision[]
  eventId: string | null
  onApply: (decisions: Decision[]) => void
}

const GOAL_MAX = 300

const planKey = (decisions: Decision[], eventId: string | null) =>
  JSON.stringify({ d: decisions.map((x) => [x.measureId, x.districtId ?? null]), e: eventId })

export function AgentPanel({ catalog, decisions, eventId, onApply }: Props) {
  const goalId = useId()
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<AgentResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runKey, setRunKey] = useState<string | null>(null)
  const requestId = useRef(0)

  const canRun = decisions.length > 0
  const stale = runKey !== null && (data !== null || error !== null) && runKey !== planKey(decisions, eventId)

  const run = () => {
    if (!canRun) return
    const id = ++requestId.current
    setLoading(true)
    setError(null)
    setRunKey(planKey(decisions, eventId))
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

  return (
    <section aria-label="AI-агент" className="card p-4" aria-busy={loading}>
      <SectionTitle aside={data?.status === 'ai' && !loading ? <Chip tone="accent"><Bot className="size-3" /> {data.model ?? 'AI'}</Chip> : null}>
        AI-агент
      </SectionTitle>

      <p className="text-[13px] text-ink-2">Агент сам вызывает симулятор: проверяет ваш план, ищет замены и перепроверяет лучший вариант. Все числа — из расчёта сервера.</p>

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
          <span className="text-[12px] text-ink-3">{canRun ? (stale ? 'план изменился — запустите агента снова' : '') : 'Добавьте хотя бы одну меру'}</span>
          <Button type="submit" variant="primary" size="sm" disabled={loading || !canRun}>
            <Play className="size-3.5" /> {loading ? 'Агент работает…' : 'Запустить агента'}
          </Button>
        </div>
      </form>

      {loading && (
        <div className="mt-4 space-y-2" aria-label="Агент работает">
          <p className="text-[13px] text-ink-2" role="status">Агент проверяет гипотезы в симуляторе… обычно 15–40 секунд</p>
          <div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-3/4" />
          <div className="skeleton mt-3 h-3 w-1/3" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-2/3" />
        </div>
      )}

      {!loading && error && (
        <div className="mt-4 rounded-lg bg-critical-soft px-3 py-2.5 text-[13px] text-[#7a1f1f]">
          <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div>
        </div>
      )}

      {!loading && data && data.status !== 'ai' && (
        <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-ink-3" />
            <div className="space-y-1">
              <p>{data.reason ?? (data.status === 'unavailable' ? 'AI-агент сейчас недоступен.' : 'Агент завершился с ошибкой.')}</p>
              {data.status === 'unavailable' && <p className="text-[12px] text-ink-3">Впишите OPENAI_API_KEY в product.v1/.env и перезапустите ./scripts/start.sh</p>}
            </div>
          </div>
        </div>
      )}

      {!loading && data?.status === 'ai' && (
        <div className={clsx('mt-4 space-y-4 text-[13px] leading-relaxed', stale && 'opacity-50')}>
          {!data.grounded && (
            <Chip tone="warn" title="В тексте модели есть числа, которых нет в результатах симулятора">
              <TriangleAlert className="size-3" /> числа в тексте не подтверждены
            </Chip>
          )}
          {data.summary && <p className="font-medium">{data.summary}</p>}

          {data.steps.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium tracking-wide text-ink-3 uppercase">Ход работы агента</div>
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
                <p className="mt-2 text-[12px] tnum">
                  Проверено симулятором: Score <span className="font-medium">{rec.score !== null ? f2(rec.score) : '—'}</span>
                  {rec.delta !== null && <> (<Delta value={rec.delta} />)</>}
                  {rec.cost !== null && <>, стоимость {rec.cost}</>}
                  {rec.criticalCount !== null && <>, критических {rec.criticalCount}</>}
                </p>
              ) : (
                <div className="mt-2 text-[12px] text-[#7a1f1f]">
                  <div className="font-medium">План недопустим:</div>
                  <ul className="list-disc pl-4">{rec.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </div>
              )}
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={() => onApply(rec.decisions)} disabled={!rec.valid}>Применить план</Button>
              </div>
            </div>
          )}

          <Block icon={<Lightbulb className="size-4 text-accent" />} title="Выводы" items={data.findings} />
          <Block icon={<TriangleAlert className="size-4 text-serious" />} title="Риски" items={data.risks} />
        </div>
      )}
    </section>
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
        {items.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-3" />{t}</li>)}
      </ul>
    </div>
  )
}
