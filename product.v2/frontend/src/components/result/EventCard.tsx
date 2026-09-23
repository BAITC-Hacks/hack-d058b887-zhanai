import { CloudLightning, Dices, RotateCcw } from 'lucide-react'
import type { Catalog } from '../../data/dataset'
import type { ActiveEvent } from '../../api'
import { f0, signedDelta } from '../../lib/format'
import { Button, Chip, SectionTitle } from '../ui'

interface Props {
  catalog: Catalog
  event: ActiveEvent | null
  loading: boolean
  onDraw: () => void
  onReset: () => void
}

export function EventCard({ catalog, event, loading, onDraw, onReset }: Props) {
  return (
    <section aria-label="Городское событие" className="card p-4" aria-busy={loading}>
      <SectionTitle aside={event ? 'действует' : undefined}>Неожиданное событие</SectionTitle>
      {event ? (
        <div className="animate-fade-up">
          <div className="flex items-start gap-2">
            <CloudLightning className="mt-0.5 size-4 shrink-0 text-serious" />
            <div>
              <div className="text-[14px] font-semibold">{event.title}</div>
              <p className="text-[13px] text-ink-2">{event.text}</p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 pl-6">
            {event.effects.map((e, i) => (
              <Chip key={i} tone="critical">
                {catalog.indicators.find((x) => x.id === e.indicator)?.name} {signedDelta(e.delta)} {catalog.districts.find((d) => d.id === e.districtId)?.locative}
              </Chip>
            ))}
            {event.budgetDelta !== 0 && <Chip tone="critical">бюджет {signedDelta(event.budgetDelta)} → {f0(event.budget)}</Chip>}
          </div>
          <p className="mt-2 pl-6 text-[12px] text-ink-3">База пересчитана с учётом события. Перепланируйте: замените одну меру или перераспределите бюджет.</p>
          <div className="mt-2 flex gap-2 pl-6">
            <Button size="sm" onClick={onDraw} disabled={loading}><Dices className="size-3.5" /> Другое событие</Button>
            <Button size="sm" variant="ghost" onClick={onReset}><RotateCcw className="size-3.5" /> Сбросить</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-ink-2">Проверьте план на прочность: случайное событие меняет показатели или бюджет, и план придётся пересобрать.</p>
          <Button size="sm" onClick={onDraw} disabled={loading}><Dices className="size-3.5" /> Разыграть</Button>
        </div>
      )}
    </section>
  )
}
