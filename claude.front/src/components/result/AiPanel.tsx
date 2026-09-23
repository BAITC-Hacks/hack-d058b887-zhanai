import { clsx } from 'clsx'
import { ArrowRightLeft, Download, RefreshCw, ShieldAlert, Sparkles, ThumbsUp, TriangleAlert } from 'lucide-react'
import type { Catalog } from '../../data/dataset'
import type { ExplainResponse } from '../../api'
import { Button, Chip, SectionTitle } from '../ui'

export type AiStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error'

interface Props {
  catalog: Catalog
  status: AiStatus
  data: ExplainResponse | null
  error: string | null
  canRun: boolean
  onRun: () => void
  onDownload: () => void
  downloading: boolean
}

export function AiPanel({ catalog, status, data, error, canRun, onRun, onDownload, downloading }: Props) {
  return (
    <section aria-label="AI-анализ" className="card p-4" aria-busy={status === 'loading'}>
      <SectionTitle
        aside={
          data && status !== 'idle' ? (
            data.status === 'ai' ? <Chip tone="accent"><Sparkles className="size-3" /> {data.model ?? 'AI'}{data.grounded ? ' · числа сверены' : ''}</Chip>
              : <Chip tone="warn" title="Сервис AI недоступен: текст собран из фактов расчёта по шаблону">без AI · из фактов расчёта</Chip>
          ) : null
        }
      >
        AI-анализ плана
      </SectionTitle>

      {status === 'idle' && (
        <div className="rounded-lg border border-dashed border-line-2 px-3 py-4 text-center">
          <p className="text-[13px] text-ink-2">Разбор сильных сторон, рисков и последствий. Числа рассчитывает симулятор; текст модели проходит проверку чисел. Если AI недоступен, покажем пояснение по правилам.</p>
          <Button variant="primary" size="sm" className="mt-3" disabled={!canRun} onClick={onRun} title={canRun ? undefined : 'Нужен допустимый план из пяти мер'}>
            <Sparkles className="size-3.5" /> Получить анализ
          </Button>
        </div>
      )}

      {status === 'loading' && (
        <div className="space-y-2" aria-label="Загрузка анализа">
          <div className="skeleton h-4 w-11/12" /><div className="skeleton h-4 w-3/4" />
          <div className="skeleton mt-3 h-3 w-1/3" /><div className="skeleton h-4 w-5/6" /><div className="skeleton h-4 w-2/3" />
          <div className="skeleton mt-3 h-3 w-1/4" /><div className="skeleton h-4 w-4/5" />
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-lg bg-critical-soft px-3 py-2.5 text-[13px] text-[#7a1f1f]">
          <div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><span>{error ?? 'Сервис AI не ответил.'} Расчёт при этом не пострадал.</span></div>
          <Button size="sm" className="mt-2" onClick={onRun} disabled={!canRun}><RefreshCw className="size-3.5" /> Повторить</Button>
        </div>
      )}

      {(status === 'ready' || status === 'stale') && data && (
        <div className="relative">
          {status === 'stale' && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-[#6b4a00]">
              <span>План изменился, анализ относится к прежнему набору</span>
              <Button size="sm" onClick={onRun} disabled={!canRun}><RefreshCw className="size-3.5" /> Обновить</Button>
            </div>
          )}
          <div className={clsx('space-y-4 text-[13px] leading-relaxed', status === 'stale' && 'opacity-50')}>
            <p className="font-medium">{data.summary}</p>
            <Block icon={<ThumbsUp className="size-4 text-up" />} title="Сильные стороны" items={data.strengths} />
            <Block icon={<TriangleAlert className="size-4 text-serious" />} title="Риски" items={data.risks} />
            <Block icon={<ArrowRightLeft className="size-4 text-accent" />} title="Последствия" items={data.consequences} />
            {data.decisions.length > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium tracking-wide text-ink-3 uppercase">По каждому решению</div>
                <ul className="space-y-1">
                  {data.decisions.map((d) => (
                    <li key={d.measureId} className="flex gap-2"><span className="w-8 shrink-0 text-ink-3 tnum">{d.measureId}</span><span>{d.text}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {data.recommendations.length > 0 && <Block icon={<Sparkles className="size-4 text-ink-2" />} title="Рекомендации" items={data.recommendations} />}
          </div>
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-[11px] text-ink-3">{catalog.rules.ruleset === 'dataset' ? 'Правила: ровно 5 мер, не больше 2 из направления' : 'Правила: все пять направлений'}</span>
            <Button size="sm" onClick={onDownload} disabled={downloading || !canRun || status === 'stale'}><Download className="size-3.5" /> {downloading ? 'Готовим…' : 'Скачать план (.md)'}</Button>
          </div>
        </div>
      )}
    </section>
  )
}

function Block({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold">{icon} {title}</div>
      {items.length ? (
        <ul className="space-y-1 pl-1">
          {items.map((t, i) => <li key={i} className="flex gap-2"><span className="mt-[9px] size-1 shrink-0 rounded-full bg-ink-3" />{t}</li>)}
        </ul>
      ) : (
        <p className="pl-1 text-ink-3">нет</p>
      )}
    </div>
  )
}
