import { RotateCcw, Sparkles, Trophy } from 'lucide-react'
import { clsx } from 'clsx'
import { useSyncExternalStore } from 'react'
import { getApiStatus, subscribeApiStatus } from '../api'
import type { Catalog, Decision } from '../data/dataset'
import { DIRECTION_COLOR } from '../lib/scales'
import { f0 } from '../lib/format'
import { Button, Chip } from './ui'

interface Props {
  catalog: Catalog
  decisions: Decision[]
  /** Стоимость текущего плана по ценам каталога. */
  cost: number
  budget: number
  /** План допустим и пересчитан сервером. */
  canAnalyze: boolean
  apiMode: 'mock' | 'http'
  onPreset: (id: string) => void
  onReset: () => void
  onAnalyze: () => void
  onOpenLeaderboard: () => void
}

export function Header({ catalog, decisions, cost, budget, canAnalyze, apiMode, onPreset, onReset, onAnalyze, onOpenLeaderboard }: Props) {
  // Режим auto определяется после проверки сервера — берём живое значение.
  const apiStatus = useSyncExternalStore(subscribeApiStatus, getApiStatus)
  const mode = apiStatus.resolving ? apiMode : apiStatus.mode
  const aiNote = apiStatus.aiConfigured === null ? '' : apiStatus.aiConfigured ? ` · AI подключён${apiStatus.aiModel ? ` (${apiStatus.aiModel})` : ''}` : ' · AI не настроен, пояснения по правилам'
  const remaining = budget - cost
  const over = remaining < 0
  const segments = decisions.flatMap((d) => {
    const m = catalog.measures.find((x) => x.id === d.measureId)
    return m ? [{ id: m.id, name: m.name, cost: m.cost, color: DIRECTION_COLOR[m.directionId] }] : []
  })

  return (
    // На узких экранах шапка прокручивается вместе со страницей, а сверху
    // закрепляется компактная плашка Score (MobileScoreBar); с xl шапка липкая.
    <header className="border-b border-line bg-page/90 backdrop-blur xl:sticky xl:top-0 xl:z-30">
      {/*
        < lg: три строки — название, бюджет во всю ширину, кнопки (на телефоне сеткой 2 × 2);
        lg–xl: название и кнопки в одной строке, бюджет под ними;
        ≥ xl: всё в одну строку.
      */}
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-6 xl:flex-nowrap">
        <div className="order-1 min-w-0 xl:min-w-[210px]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-[17px] font-semibold tracking-tight">Аким на 5 часов</h1>
            <Chip title={mode === 'mock' ? 'Расчёт идёт в браузере, сервер не подключён' : `Расчёт на сервере${aiNote}`}>{apiStatus.resolving ? 'подключение…' : mode === 'mock' ? 'демо-режим' : 'сервер'}</Chip>
          </div>
          <p className="text-[12px] text-ink-3">Симулятор городских решений · условный датасет</p>
        </div>

        <div className="order-2 w-full min-w-0 lg:order-3 xl:order-2 xl:w-auto xl:flex-1">
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px]">
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
            aria-valuetext={over ? `${f0(cost)} из ${f0(budget)}, превышен на ${f0(-remaining)}` : `${f0(cost)} из ${f0(budget)}, осталось ${f0(remaining)}`}
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

        <div className="order-3 grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center lg:order-2 lg:ml-auto xl:order-3 xl:ml-0">
          <select
            aria-label="Готовые сценарии"
            className="h-9 w-full min-w-0 rounded-lg border border-line-2 bg-surface px-2.5 text-sm text-ink-2 hover:bg-surface-2 sm:w-auto"
            value=""
            onChange={(e) => { if (e.target.value) onPreset(e.target.value) }}
          >
            <option value="">Сценарии…</option>
            {catalog.presets.map((p) => (
              <option key={p.id} value={p.id} title={p.hint}>{p.name}</option>
            ))}
          </select>
          <Button
            onClick={onReset}
            disabled={decisions.length === 0}
            aria-label="Сбросить план"
            title={decisions.length === 0 ? 'План пуст' : 'Убрать все меры из плана'}
            className="w-full sm:w-auto"
          >
            {/* На самых узких экранах (< 360 px) слово «план» не помещается в сетку 2 × 2. */}
            <RotateCcw aria-hidden="true" className="size-4" /> Сбросить<span className="hidden min-[360px]:inline"> план</span>
          </Button>
          <Button variant="ghost" onClick={onOpenLeaderboard} title="Лидерборд команд" className="w-full sm:w-auto">
            <Trophy aria-hidden="true" className="size-4" /> Команды
          </Button>
          <Button
            variant="primary"
            onClick={onAnalyze}
            disabled={!canAnalyze}
            title={canAnalyze ? 'Разобрать план с помощью AI' : 'Сначала соберите допустимый план из пяти мер'}
            className="w-full sm:w-auto"
          >
            <Sparkles aria-hidden="true" className="size-4" /> AI-анализ
          </Button>
        </div>
      </div>
    </header>
  )
}
