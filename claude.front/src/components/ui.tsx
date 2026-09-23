import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { DIRECTION_COLOR } from '../lib/scales'
import type { DirectionId } from '../data/dataset'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'min-h-10 px-2.5 text-[13px]' : 'min-h-11 px-3.5 text-sm',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-ink active:bg-accent-ink',
        variant === 'secondary' && 'bg-surface text-ink border border-line-2 hover:bg-surface-2',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
    />
  )
}

export function Chip({ children, tone = 'neutral', className, title }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'critical'; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium leading-none whitespace-nowrap',
        tone === 'neutral' && 'bg-surface-2 text-ink-2',
        tone === 'accent' && 'bg-accent-soft text-accent-ink',
        tone === 'good' && 'bg-good-soft text-[#0a4d0a]',
        tone === 'warn' && 'bg-warn-soft text-[#6b4a00]',
        tone === 'critical' && 'bg-critical-soft text-[#7a1f1f]',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function DirectionDot({ id, className }: { id: DirectionId; className?: string }) {
  return <span aria-hidden="true" className={clsx('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ background: DIRECTION_COLOR[id] }} />
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-[13px] font-medium tracking-wide text-ink-3 uppercase">{children}</h2>
      {aside && <div className="text-[12px] text-ink-3">{aside}</div>}
    </div>
  )
}

/** Подсказка по наведению; содержимое дублируется для скринридера через aria-label. */
export function Hint({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className={clsx('group/hint relative inline-flex', className)} tabIndex={0} role="button" aria-label={text} aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen(!open)} onBlur={() => setOpen(false)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open) } }}>
      {children}
      <span
        id={id} role="tooltip"
        className={clsx('pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 w-48 max-w-[70vw] rounded-md bg-ink px-2 py-1.5 text-[12px] leading-snug text-white transition-opacity group-hover/hint:opacity-100 group-focus-visible/hint:opacity-100', open ? 'opacity-100' : 'opacity-0')}
      >
        {text}
      </span>
    </span>
  )
}

export function Drawer({ open, onClose, title, children, width = 'w-[440px]' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((el) => !el.hidden)
    focusable()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return }
      if (e.key !== 'Tab') return
      const list = focusable()
      const first = list[0], last = list.at(-1)
      if (!first) { e.preventDefault(); panel.current?.focus(); return }
      if (e.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = bodyOverflow; previous?.focus() }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <button tabIndex={-1} aria-label="Закрыть панель" className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={clsx('absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-line bg-surface animate-fade-up', width)}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" aria-label="Закрыть" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
      </aside>
    </div>
  )
}

export function Delta({ value, digits = 2, className }: { value: number; digits?: 1 | 2; className?: string }) {
  const abs = Math.abs(value)
  const zero = abs < 0.5 * 10 ** -digits
  const text = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs)
  return (
    <span className={clsx('tnum', zero ? 'text-ink-3' : value > 0 ? 'text-up' : 'text-down', className)}>
      {zero ? text : value > 0 ? `+${text}` : `−${text}`}
    </span>
  )
}
