import { useState } from 'react'
import { clsx } from 'clsx'
import { TriangleAlert } from 'lucide-react'
import type { Catalog } from '../../data/dataset'
import type { DistrictResult } from '../../api'
import { BAND_LABEL, indicatorBand } from '../../lib/scales'
import { f1 } from '../../lib/format'
import { Chip, Delta, DirectionDot, Hint } from '../ui'

interface Props {
  catalog: Catalog
  district: DistrictResult
  showAfter: boolean
}

export function DistrictDetail({ catalog, district, showAfter }: Props) {
  const [view, setView] = useState<'bars' | 'table'>('bars')
  const info = catalog.districts.find((d) => d.id === district.districtId)!
  const threshold = catalog.rules.criticalThreshold

  return (
    <div>
      <p className="text-[13px] text-ink-2">{info.profile}</p>
      <div className="mt-3 flex items-end gap-4">
        <div>
          <div className="text-[12px] text-ink-3">Оценка района</div>
          <div className="text-[28px] leading-none font-semibold">
            {showAfter ? (
              <>
                <span className="text-ink-3">{f1(district.beforeScore)}</span>
                <span className="mx-1.5 text-ink-3">→</span>
                {f1(district.afterScore)}
              </>
            ) : f1(district.beforeScore)}
          </div>
        </div>
        {showAfter && <Delta value={district.afterScore - district.beforeScore} digits={1} className="mb-0.5 text-lg font-medium" />}
        <div className="ml-auto text-right text-[12px] text-ink-3">
          доля населения <span className="tnum text-ink-2">{Math.round(info.populationShare * 100)} %</span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[12px] text-ink-2">
          {showAfter && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-r-sm bg-line-2" /> до</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-r-sm bg-accent" /> после</span>
            </>
          )}
        </div>
        <div className="flex rounded-md border border-line p-0.5 text-[12px]" role="tablist" aria-label="Вид">
          {(['bars', 'table'] as const).map((v) => (
            <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={clsx('rounded px-2 py-0.5', view === v ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2')}>
              {v === 'bars' ? 'Полосы' : 'Таблица'}
            </button>
          ))}
        </div>
      </div>

      {view === 'bars' ? (
        <ul className="mt-3 space-y-3">
          {catalog.indicators.map((ind) => {
            const before = district.beforeIndicators[ind.id]
            const after = district.afterIndicators[ind.id]
            const shown = showAfter ? after : before
            const band = indicatorBand(shown, threshold)
            return (
              <li key={ind.id}>
                <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <DirectionDot id={ind.directionId} />
                    <Hint text={ind.meaning}><span className="truncate underline decoration-dotted decoration-line-2 underline-offset-2">{ind.name}</span></Hint>
                    {band === 'critical' && (
                      <Chip tone="critical"><TriangleAlert className="size-3" /> {BAND_LABEL.critical}</Chip>
                    )}
                    {band === 'low' && <Chip tone="warn">{BAND_LABEL.low}</Chip>}
                  </span>
                  <span className="shrink-0 tnum">
                    {showAfter && <span className="text-ink-3">{f1(before)} → </span>}
                    <span className="font-medium">{f1(shown)}</span>
                    {showAfter && Math.abs(after - before) >= 0.05 && <Delta value={after - before} digits={1} className="ml-1.5 text-[12px]" />}
                  </span>
                </div>
                <div className="relative h-2 rounded-r-sm bg-surface-2">
                  <span aria-hidden="true" className="absolute inset-y-0 w-px bg-critical/50" style={{ left: `${threshold}%` }} />
                  {showAfter && <div className="absolute inset-y-0 left-0 rounded-r-sm bg-line-2" style={{ width: `${before}%` }} />}
                  <div className={clsx('absolute left-0 h-2 rounded-r-sm bg-accent transition-[width] duration-500', showAfter ? 'top-0 h-1' : 'top-0')} style={{ width: `${shown}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <table className="mt-3 w-full text-[13px]">
          <thead className="text-left text-[11px] text-ink-3 uppercase">
            <tr><th className="py-1 font-medium">Показатель</th><th className="py-1 text-right font-medium">До</th>{showAfter && <th className="py-1 text-right font-medium">После</th>}{showAfter && <th className="py-1 text-right font-medium">Δ</th>}</tr>
          </thead>
          <tbody className="tnum">
            {catalog.indicators.map((ind) => {
              const before = district.beforeIndicators[ind.id]
              const after = district.afterIndicators[ind.id]
              return (
                <tr key={ind.id} className="border-t border-line">
                  <td className="py-1.5">{ind.name} <span className="text-ink-3">{ind.id}</span></td>
                  <td className="py-1.5 text-right">{f1(before)}</td>
                  {showAfter && <td className="py-1.5 text-right font-medium">{f1(after)}</td>}
                  {showAfter && <td className="py-1.5 text-right"><Delta value={after - before} digits={1} /></td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-[11px] text-ink-3">Порог критического значения {threshold}: каждая пара «район × показатель» ниже него стоит 1 балл Score.</p>
    </div>
  )
}
