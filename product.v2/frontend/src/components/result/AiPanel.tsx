import { clsx } from 'clsx'
import { ArrowRightLeft, Check, ChevronDown, Download, RefreshCw, ShieldAlert, Sparkles, TriangleAlert, Wand2 } from 'lucide-react'
import { Fragment, useId, useState, type ReactNode } from 'react'
import type { Catalog, Decision } from '../../data/dataset'
import type { ExplainResponse, ImproveResponse, SimulateResponse } from '../../api'
import { f2, pluralRu } from '../../lib/format'
import { DIRECTION_COLOR } from '../../lib/scales'
import { districtName, hasDecision, lcFirst, measureName, replaceDecision, ruNumbers, splitNumbers, swapPhrase } from '../../lib/text'
import { Button, Chip, Delta, SectionTitle } from '../ui'

export type AiStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error'

/** Что изменилось после анализа: план, событие или и то и другое. */
export type AiStaleReason = 'plan' | 'event' | 'both'

const STALE_TEXT: Record<AiStaleReason, string> = {
  plan: 'План изменился — анализ относится к прежнему набору',
  event: 'Событие изменилось — анализ сделан для прежних условий',
  both: 'План и событие изменились — анализ относится к прежним условиям',
}

interface Props {
  catalog: Catalog
  status: AiStatus
  data: ExplainResponse | null
  error: string | null
  /** План допустим и пересчитан сервером: анализ можно запустить. */
  canRun: boolean
  onRun: () => void
  onDownload: () => void
  downloading: boolean
  /** Ошибка подготовки презентации для текущего плана. */
  downloadError?: string | null
  staleReason?: AiStaleReason
  /** Текущий расчёт (только для текущего плана): из него, а не из текста модели, берутся числа плашек. */
  sim: SimulateResponse | null
  improve: ImproveResponse | null
  /** Текущий план — чтобы собрать план с заменой. */
  decisions: Decision[]
  onApply: (decisions: Decision[]) => void
}

export function AiPanel({ catalog, status, data, error, canRun, onRun, onDownload, downloading, downloadError = null, staleReason = 'plan', sim, improve, decisions, onApply }: Props) {
  const need = catalog.rules.decisions
  const result = status === 'ready' || status === 'stale' ? data : null
  // Презентация собирается для текущего плана: только допустимого и со свежим анализом.
  const canDownload = canRun && status === 'ready'

  return (
    <section aria-label="AI-анализ плана" aria-busy={status === 'loading'} className="card flex flex-col gap-3.5 p-4">
      <div className="-mb-2">
        <SectionTitle
          aside={
            result ? (
              result.status !== 'ai' ? (
                <Chip tone="warn" title={result.fallbackReason ? `Почему без AI: ${result.fallbackReason}` : 'Сервис AI недоступен: текст собран по правилам из фактов расчёта'}>без AI · из фактов расчёта</Chip>
              ) : result.grounded ? (
                <Chip tone="accent" title="Каждое число в тексте найдено в фактах расчёта">
                  <Check aria-hidden="true" className="size-3" /> {result.model ?? 'AI'} · числа сверены
                </Chip>
              ) : (
                <Chip tone="accent">{result.model ?? 'AI'}</Chip>
              )
            ) : null
          }
        >
          AI-анализ плана
        </SectionTitle>
      </div>

      {status === 'idle' && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-2 px-4 py-5 text-center">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Модель объяснит сильные стороны, риски и последствия плана и подскажет, что сделать. Опирается на факты расчёта; числа в тексте сверяются с ними, а если не сходятся — вы увидите предупреждение.
          </p>
          <Button variant="primary" size="sm" disabled={!canRun} onClick={onRun}>
            <Sparkles aria-hidden="true" className="size-3.5" /> Получить анализ
          </Button>
          <p className="text-[12px] text-ink-2">
            {canRun ? 'То же делает кнопка «AI-анализ» в шапке' : `Сначала соберите допустимый план из ${need} ${pluralRu(need, 'меры', 'мер', 'мер')}`}
          </p>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-[12px] text-ink-2">Модель разбирает план…</p>
          <div className="skeleton h-5 w-11/12" />
          <div className="skeleton h-5 w-2/3" />
          <div className="mt-1 grid grid-cols-3 gap-2"><div className="skeleton h-11" /><div className="skeleton h-11" /><div className="skeleton h-11" /></div>
          <div className="skeleton mt-2 h-3.5 w-1/3" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-3/4" />
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-lg bg-critical-soft px-3 py-2.5 text-[13px] text-[#7a1f1f]">
          <div className="flex items-start gap-2"><ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{error ?? 'Сервис AI не ответил.'} Расчёт при этом не пострадал.</span></div>
          <Button size="sm" onClick={onRun} disabled={!canRun}><RefreshCw aria-hidden="true" className="size-3.5" /> Повторить</Button>
        </div>
      )}

      {/* Живая область: смена «анализ устарел» объявляется скринридеру. */}
      <div aria-live="polite">
        {result && status === 'stale' && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-[#6b4a00]">
            <span className="min-w-0 flex-1">
              {STALE_TEXT[staleReason]}
              {!canRun && <span className="block text-[12px] opacity-90">Обновить можно, когда план снова станет допустимым.</span>}
            </span>
            <Button size="sm" onClick={onRun} disabled={!canRun}><RefreshCw aria-hidden="true" className="size-3.5" /> Обновить</Button>
          </div>
        )}
      </div>

      {result && (
        <>
          {result.status === 'ai' && !result.grounded && (
            <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-[#6b4a00]">
              <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              <span>В тексте есть числа, которых нет в расчёте, — опирайтесь на плашки с числами и на карточку результата.</span>
            </p>
          )}
          <Analysis catalog={catalog} data={result} faded={status === 'stale'} sim={sim} improve={improve} decisions={decisions} onApply={onApply} />
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-2">
                {canDownload
                  ? catalog.rules.ruleset === 'dataset'
                    ? `Правила: ровно ${need} ${pluralRu(need, 'мера', 'меры', 'мер')}, не больше ${catalog.rules.maxPerDirection} из направления`
                    : 'Правила: все пять направлений'
                  : !canRun
                    ? 'Презентация — только для допустимого плана'
                    : 'Обновите анализ, чтобы скачать презентацию текущего плана'}
              </span>
              <Button size="sm" onClick={onDownload} disabled={downloading || !canDownload}>
                <Download aria-hidden="true" className="size-3.5" /> {downloading ? 'Готовим…' : 'Скачать презентацию'}
              </Button>
            </div>
            <div aria-live="assertive">
              {downloadError && (
                <p className="flex items-start gap-2 rounded-lg bg-critical-soft px-3 py-2 text-[12.5px] leading-snug text-[#7a1f1f]">
                  <ShieldAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
                  <span>Не удалось подготовить презентацию: {downloadError}</span>
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function Analysis({ catalog, data, faded, sim, improve, decisions, onApply }: { catalog: Catalog; data: ExplainResponse; faded: boolean; sim: SimulateResponse | null; improve: ImproveResponse | null; decisions: Decision[]; onApply: (decisions: Decision[]) => void }) {
  const [open, setOpen] = useState(false)
  const listId = useId()

  const r = sim?.result ?? null
  const b = sim?.baseline ?? null
  const worst = r ? r.districts.find((d) => d.districtId === r.minDistrictId) : undefined
  const budget = sim?.event?.budget ?? catalog.rules.budget
  const cost = sim?.cost ?? null
  const swap = improve?.swap && hasDecision(decisions, improve.swap.remove) ? improve.swap : null
  const recs = data.recommendations

  return (
    <div className={clsx('flex flex-col gap-4 transition-opacity', faded && 'opacity-50')}>
      <p className="text-[17px] leading-snug font-semibold text-pretty">
        <RichNumbers text={data.summary} />
      </p>

      {/* Плашки — числа текущего расчёта; к устаревшему анализу их не прикладываем. */}
      {r && b && !faded && (
        <div role="group" aria-label="Ключевые числа расчёта" className="grid grid-cols-3 gap-2">
          <FactTile label="Score"><FromTo from={f2(b.score)} to={f2(r.score)} /></FactTile>
          {worst && (
            <FactTile label={districtName(catalog, worst.districtId)} srPrefix="Худший район: " title="Худший район после плана">
              <FromTo from={f2(worst.beforeScore)} to={f2(worst.afterScore)} />
            </FactTile>
          )}
          {cost !== null && (
            <FactTile label="Бюджет">
              <span className="whitespace-nowrap">{cost} из {budget}</span>
            </FactTile>
          )}
        </div>
      )}

      <Points icon={<Check aria-hidden="true" className="size-4 text-up" />} title="Сильные стороны" items={data.strengths} />
      <Points icon={<TriangleAlert aria-hidden="true" className="size-4 text-[#b44a1d]" />} title="Риски" items={data.risks} />
      <Points icon={<ArrowRightLeft aria-hidden="true" className="size-4 text-accent" />} title="Последствия" items={data.consequences} />

      {(recs.length > 0 || swap) && (
        <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
          <h3 className="text-[14px] font-semibold">Что сделать</h3>
          {recs.length > 0 && <p className="text-[13.5px] leading-normal"><RichNumbers text={recs[0]} /></p>}
          {recs.length > 1 && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-normal text-ink-2 marker:text-ink-3">
              {recs.slice(1).map((t, i) => <li key={i}><RichNumbers text={t} /></li>)}
            </ul>
          )}
          {swap && (
            <div className={clsx('flex flex-col items-start gap-2', recs.length > 0 && 'border-t border-line pt-2.5')}>
              <p className="flex items-start gap-2 text-[13px] leading-normal">
                <Wand2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                <span>
                  <span className="text-ink-2">Лучшая замена по расчёту: </span>
                  {lcFirst(swapPhrase(catalog, swap.remove, swap.add))} — Score <b className="font-semibold tnum">{f2(swap.score)}</b> (<Delta value={swap.delta} />)
                </span>
              </p>
              <Button variant="primary" size="sm" onClick={() => onApply(replaceDecision(decisions, swap.remove, swap.add))}>
                Применить замену
              </Button>
            </div>
          )}
        </div>
      )}

      {data.decisions.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 self-start rounded-md py-0.5 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            <ChevronDown aria-hidden="true" className={clsx('size-4 transition-transform', open && 'rotate-180')} />
            {open ? 'Скрыть разбор по решениям' : `Показать по каждому решению (${data.decisions.length})`}
          </button>
          <ul id={listId} hidden={!open} className={clsx(open ? 'flex' : 'hidden', 'flex-col gap-2.5')}>
            {data.decisions.map((d) => {
              const m = catalog.measures.find((x) => x.id === d.measureId)
              return (
                <li key={d.measureId} className="flex flex-col gap-0.5 border-l-2 pl-2.5" style={{ borderColor: m ? DIRECTION_COLOR[m.directionId] : 'var(--color-line-2)' }}>
                  <span className="text-[12px] font-medium text-ink-2">
                    {measureName(catalog, d.measureId)} · {m?.scope === 'city' ? 'весь город' : districtName(catalog, d.districtId)}
                  </span>
                  <span className="text-[13px] leading-normal"><RichNumbers text={d.text} /></span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Текст модели: десятичная запятая и выделенные табличные числа. */
function RichNumbers({ text }: { text: string }) {
  return (
    <>
      {splitNumbers(ruNumbers(text)).map((p, i) =>
        p.num ? <span key={i} className="font-semibold tnum whitespace-nowrap">{p.text}</span> : <Fragment key={i}>{p.text}</Fragment>,
      )}
    </>
  )
}

function Points({ icon, title, items }: { icon: ReactNode; title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-[14px] font-semibold">
        {icon}
        {title}
        <span className="font-medium text-ink-3 tnum">{items.length}</span>
      </h3>
      <ul className="flex list-disc flex-col gap-1 pl-6 text-[13.5px] leading-normal marker:text-ink-3">
        {items.map((t, i) => <li key={i}><RichNumbers text={t} /></li>)}
      </ul>
    </div>
  )
}

function FactTile({ label, srPrefix, title, children }: { label: string; srPrefix?: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-surface-2 px-2.5 py-2" title={title}>
      <span className="text-[12px] leading-tight whitespace-nowrap text-ink-2">
        {srPrefix && <span className="sr-only">{srPrefix}</span>}
        {label}
      </span>
      <span className="text-[14px] leading-snug font-semibold tnum">{children}</span>
    </div>
  )
}

/** «52,56 → 56,54»; в узкой плашке переносится ровно после стрелки. */
function FromTo({ from, to }: { from: string; to: string }) {
  return (
    <>
      <span className="font-medium whitespace-nowrap text-ink-2">{from} →</span> <span className="whitespace-nowrap">{to}</span>
    </>
  )
}
