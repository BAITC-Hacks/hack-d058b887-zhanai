import { Sparkles, Trophy } from 'lucide-react'
import { clsx } from 'clsx'
import type { Catalog, Decision } from '../data/dataset'
import { DIRECTION_COLOR } from '../lib/scales'
import { f0 } from '../lib/format'
import { Button, Chip } from './ui'
import type { PlanStatus } from '../App'

interface Props {
  catalog: Catalog
  decisions: Decision[]
  cost: number
  budget: number
  status: PlanStatus
  apiMode: 'mock' | 'http'
  onPreset: (id: string) => void
  onAnalyze: () => void
  onOpenLeaderboard: () => void
}

export function Header({ catalog, decisions, cost, budget, status, apiMode, onPreset, onAnalyze, onOpenLeaderboard }: Props) {
  const remaining = budget - cost
  const over = remaining < 0
  const segments = decisions.flatMap((d) => {
    const m = catalog.measures.find((x) => x.id === d.measureId)
    return m ? [{ id: m.id, name: m.name, cost: m.cost, color: DIRECTION_COLOR[m.directionId] }] : []
  })

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-page/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-6 py-3">
        <div className="min-w-[210px]">
          <div className="flex items-center gap-2">
            <h1 className="text-[17px] font-semibold tracking-tight">Аким на 5 часов</h1>
            <Chip title={apiMode === 'mock' ? 'Расчёт идёт в браузере, сервер не подключён' : 'Расчёт на сервере'}>{apiMode === 'mock' ? 'демо-режим' : 'сервер'}</Chip>
          </div>
          <p className="text-[12px] text-ink-3">Симулятор городских решений · условный датасет</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
            <span className="text-ink-2">
              Бюджет <span className="font-medium text-ink tnum">{f0(cost)}</span> из <span className="tnum">{f0(budget)}</span>
            </span>
            <span className={clsx('tnum', over ? 'font-medium text-down' : 'text-ink-2')}>
              {over ? `превышен на ${f0(-remaining)}` : `осталось ${f0(remaining)}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Использование бюджета"
            aria-valuemin={0}
            aria-valuemax={budget}
            aria-valuenow={Math.min(cost, budget)}
            className={clsx('flex h-2.5 w-full overflow-hidden rounded-full bg-surface-3', over && 'ring-2 ring-critical')}
          >
            {segments.map((s) => (
              <div
                key={s.id}
                title={`${s.id} ${s.name}: ${s.cost}`}
                className="h-full shrink-0 border-r-2 border-page last:border-r-0 transition-[width] duration-300"
                style={{ width: `${(s.cost / budget) * 100}%`, background: s.color }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Готовые сценарии"
            className="h-9 rounded-lg border border-line-2 bg-surface px-2.5 text-sm text-ink-2 hover:bg-surface-2"
            value=""
            onChange={(e) => { if (e.target.value) onPreset(e.target.value) }}
          >
            <option value="">Сценарии…</option>
            {catalog.presets.map((p) => (
              <option key={p.id} value={p.id} title={p.hint}>{p.name}</option>
            ))}
            <option value="__clear">Очистить план</option>
          </select>
          <Button variant="ghost" onClick={onOpenLeaderboard} aria-label="Лидерборд команд" title="Лидерборд команд">
            <Trophy className="size-4" /> Команды
          </Button>
          <Button variant="primary" onClick={onAnalyze} disabled={status !== 'valid'} title={status === 'valid' ? 'Разобрать план с помощью AI' : 'Сначала соберите допустимый план из пяти мер'}>
            <Sparkles className="size-4" /> AI-анализ
          </Button>
        </div>
      </div>
    </header>
  )
}
