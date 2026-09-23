import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
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
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink/85 active:bg-ink/75',
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
  return (
    <span className={clsx('group/hint relative inline-flex', className)} tabIndex={0} aria-label={text}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max max-w-64 -translate-x-1/2 rounded-md bg-ink px-2 py-1.5 text-[12px] leading-snug text-white opacity-0 transition-opacity delay-100 group-hover/hint:opacity-100 group-focus-visible/hint:opacity-100"
      >
        {text}
      </span>
    </span>
  )
}

export function Drawer({ open, onClose, title, children, width = 'w-[440px]' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <button aria-label="Закрыть" className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <aside role="dialog" aria-modal="true" className={clsx('absolute inset-y-0 right-0 flex max-w-full flex-col bg-surface shadow-pop animate-fade-up', width)}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="text-base font-semibold">{title}</div>
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
