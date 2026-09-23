import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

interface ActiveDrag {
  measureId: string
  pointerId: number
  startX: number
  startY: number
  moved: boolean
  element: HTMLElement
}

interface Callbacks {
  onDragMeasure?: (measureId: string | null) => void
  onPointerDrop?: (measureId: string, clientX: number, clientY: number) => void
}

function releaseCapture(drag: ActiveDrag) {
  try {
    if (drag.element.hasPointerCapture?.(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
  } catch { /* The browser may already have cancelled this pointer. */ }
}

/** Mouse and pen placement. Touch remains available for native page scrolling. */
export function useMeasurePointerDrag(callbacks: Callbacks) {
  const active = useRef<ActiveDrag | null>(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks
  const [preview, setPreview] = useState<{ measureId: string; x: number; y: number } | null>(null)

  const finish = useCallback((drop: boolean, x = 0, y = 0) => {
    const drag = active.current
    if (!drag) return
    active.current = null
    releaseCapture(drag)
    setPreview(null)
    if (drag.moved) {
      if (drop) callbacksRef.current.onPointerDrop?.(drag.measureId, x, y)
      callbacksRef.current.onDragMeasure?.(null)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(false) }
    const onBlur = () => finish(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
      const drag = active.current
      active.current = null
      if (drag) {
        releaseCapture(drag)
        if (drag.moved) callbacksRef.current.onDragMeasure?.(null)
      }
    }
  }, [finish])

  const handlers = (measureId: string, enabled: boolean) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || !callbacksRef.current.onPointerDrop || active.current || event.button !== 0 || event.isPrimary === false || !['mouse', 'pen'].includes(event.pointerType)) return
      if (event.target instanceof Element && event.target.closest('button, select, input, textarea, a, label, [role="button"]')) return
      // Keep native drag as a fallback if pointer capture is not supported.
      if (!event.currentTarget.setPointerCapture) return
      try { event.currentTarget.setPointerCapture(event.pointerId) } catch { return }
      event.preventDefault()
      active.current = { measureId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, element: event.currentTarget }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = active.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= 6) return
      event.preventDefault()
      if (!drag.moved) {
        drag.moved = true
        callbacksRef.current.onDragMeasure?.(drag.measureId)
      }
      setPreview({ measureId: drag.measureId, x: event.clientX, y: event.clientY })
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      if (active.current?.pointerId !== event.pointerId) return
      if (active.current.moved) event.preventDefault()
      finish(true, event.clientX, event.clientY)
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => { if (active.current?.pointerId === event.pointerId) finish(false) },
    onLostPointerCapture: (event: ReactPointerEvent<HTMLElement>) => { if (active.current?.pointerId === event.pointerId) finish(false) },
  })

  return { handlers, preview, isActive: () => active.current !== null }
}
