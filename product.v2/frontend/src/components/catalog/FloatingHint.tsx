import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'

const GAP = 6
const EDGE = 8

/**
 * Подсказка по наведению и фокусу, как `Hint` из ui.tsx, но рисуется в
 * document.body с position: fixed. Невидимые подсказки `Hint` лежат внутри
 * прокручиваемого списка и выходят за его край — из-за них появлялась
 * горизонтальная полоса прокрутки, а у краёв текст обрезался. Здесь подсказки
 * нет в разметке, пока она не открыта, и она прижимается к границам окна.
 * Для скринридера текст всегда есть внутри якоря (sr-only).
 */
export function FloatingHint({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const show = () => setOpen(true)
  const hide = () => {
    setOpen(false)
    setPos(null)
  }

  useLayoutEffect(() => {
    if (!open) return
    const a = anchorRef.current?.getBoundingClientRect()
    const t = tipRef.current
    if (!a || !t) return
    const w = t.offsetWidth
    const h = t.offsetHeight
    const left = Math.min(Math.max(EDGE, a.left + a.width / 2 - w / 2), Math.max(EDGE, window.innerWidth - EDGE - w))
    const above = a.top - GAP - h
    setPos({ left, top: above >= EDGE ? above : a.bottom + GAP })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => {
      setOpen(false)
      setPos(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span
      ref={anchorRef}
      tabIndex={0}
      className={clsx('inline-flex max-w-full rounded-md', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <span className="sr-only">. {text}</span>
      {open &&
        createPortal(
          <span
            ref={tipRef}
            aria-hidden="true"
            className="pointer-events-none fixed z-50 w-max max-w-64 rounded-md bg-ink px-2 py-1.5 text-[12px] leading-snug text-white shadow-pop"
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  )
}
