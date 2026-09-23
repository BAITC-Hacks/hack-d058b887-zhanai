import type { Catalog, Decision, SimulateResponse } from '../api'
import { useSimulation } from '../state/useSimulation'
import { f2 } from '../lib/format'
import { Button, Delta, SectionTitle } from './ui'

interface SavedPlan { name: string; decisions: Decision[]; eventId: string | null }
export function PlanComparison({ catalog, saved, current, currentDecisions, currentEventId, onRestore }: { catalog: Catalog; saved: SavedPlan; current: SimulateResponse | null; currentDecisions: Decision[]; currentEventId: string | null; onRestore: () => void }) {
  const previous = useSimulation(saved.decisions, saved.eventId, `${catalog.dataVersion}:${catalog.rules.ruleset}`)
  const a = previous.data?.result, b = current?.result
  const comparable = a && b && saved.eventId === currentEventId && previous.data?.ruleset === current?.ruleset && previous.data?.dataVersion === current?.dataVersion
  const same = (x: Decision, y: Decision) => x.measureId === y.measureId && x.districtId === y.districtId
  const removed = saved.decisions.filter((d) => !currentDecisions.some((c) => same(c, d)))
  const added = currentDecisions.filter((d) => !saved.decisions.some((c) => same(c, d)))
  const label = (d: Decision) => `${d.measureId} · ${catalog.districts.find((x) => x.id === d.districtId)?.name ?? 'город'}`
  return <section className="card p-4" aria-label="Сравнение планов">
    <SectionTitle aside={<Button size="sm" onClick={onRestore}>Вернуть А</Button>}>Сравнение с планом А</SectionTitle>
    <div className="flex flex-wrap gap-4 text-sm"><span>А: <strong>{a ? f2(a.score) : '—'}</strong></span><span>Сейчас: <strong>{b ? f2(b.score) : '—'}</strong></span>{comparable && <Delta value={b.score - a.score} />}</div>
    {!comparable && <p className="mt-2 text-xs text-ink-2">Разницу баллов показываем для двух допустимых планов с одинаковыми условиями.</p>}
    {previous.error && <div className="mt-2 text-xs text-down">Не удалось пересчитать А. <Button size="sm" onClick={previous.retry}>Повторить</Button></div>}
    <div className="mt-2 space-y-1 text-xs text-ink-2">{removed.map((d) => <p key={`removed-${d.measureId}`}>Убрано: {label(d)}</p>)}{added.map((d) => <p key={`added-${d.measureId}`}>Добавлено: {label(d)}</p>)}{!added.length && !removed.length && <p>Набор решений совпадает.</p>}</div>
  </section>
}
