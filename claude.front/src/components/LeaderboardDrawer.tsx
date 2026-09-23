import { useEffect, useState, type FormEvent } from 'react'
import { clsx } from 'clsx'
import { Trophy } from 'lucide-react'
import { api } from '../api'
import type { Decision, LeaderboardEntry } from '../api'
import { f2 } from '../lib/format'
import { Button, Delta, Drawer } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  decisions: Decision[]
  eventId: string | null
  canSubmit: boolean
  currentScore: number | null
}

export function LeaderboardDrawer({ open, onClose, decisions, eventId, canSubmit, currentScore }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [team, setTeam] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastId, setLastId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    api.leaderboard().then((e) => { if (alive) setEntries(e) }).catch(() => { if (alive) setEntries([]) })
    return () => { alive = false }
  }, [open])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!team.trim()) { setError('Введите название команды'); return }
    setSubmitting(true)
    setError(null)
    try {
      const entry = await api.submit(team, decisions, eventId)
      setLastId(entry.id)
      setEntries(await api.leaderboard())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось записать результат')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Trophy className="size-4" /> Лидерборд команд</span>}>
      <form onSubmit={submit} className="rounded-lg bg-surface-2 p-3">
        <div className="text-[12px] text-ink-2">
          {canSubmit && currentScore !== null ? <>Текущий план: Score <span className="font-medium text-ink tnum">{f2(currentScore)}</span>. Все команды играют с одним бюджетом и одними данными.</> : 'Соберите допустимый план из пяти мер, чтобы записать результат.'}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={team}
            onChange={(e) => { setTeam(e.target.value); setError(null) }}
            placeholder="Название команды"
            aria-label="Название команды"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line-2 bg-surface px-3 text-sm placeholder:text-ink-3"
            disabled={!canSubmit}
          />
          <Button variant="primary" type="submit" disabled={!canSubmit || submitting}>{submitting ? 'Запись…' : 'Записать'}</Button>
        </div>
        {error && <p className="mt-1.5 text-[12px] text-down">{error}</p>}
      </form>

      <div className="mt-4">
        {entries === null && <p className="text-[13px] text-ink-3">Загружаем…</p>}
        {entries && entries.length === 0 && <p className="text-[13px] text-ink-3">Пока никто не записал результат. Будьте первыми.</p>}
        {entries && entries.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="text-left text-[11px] text-ink-3 uppercase">
              <tr><th className="py-1 font-medium">#</th><th className="py-1 font-medium">Команда</th><th className="py-1 text-right font-medium">Score</th><th className="py-1 text-right font-medium">Δ</th><th className="py-1 text-right font-medium">Крит.</th></tr>
            </thead>
            <tbody className="tnum">
              {entries.map((e, i) => (
                <tr key={e.id} className={clsx('border-t border-line', e.id === lastId && 'bg-accent-soft/40')}>
                  <td className="py-1.5 text-ink-3">{i + 1}</td>
                  <td className="py-1.5 font-medium">{e.teamName}{e.eventId ? <span className="ml-1 text-[11px] font-normal text-ink-3">· событие</span> : null}</td>
                  <td className="py-1.5 text-right font-medium">{f2(e.score)}</td>
                  <td className="py-1.5 text-right"><Delta value={e.delta} /></td>
                  <td className="py-1.5 text-right">{e.criticalCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Drawer>
  )
}
