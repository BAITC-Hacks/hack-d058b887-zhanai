import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Decision, SimulateResponse } from '../api'

interface SimulationState {
  data: SimulateResponse | null
  loading: boolean
  error: string | null
}

/**
 * Пересчитывает план на сервере при каждом изменении (с небольшой задержкой).
 * Предыдущий ответ остаётся на экране, пока идёт новый запрос, а запоздавший
 * ответ старого запроса не перекрывает новый.
 */
export function useSimulation(decisions: Decision[], eventId: string | null) {
  const [state, setState] = useState<SimulationState>({ data: null, loading: true, error: null })
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    setState((s) => ({ ...s, loading: true }))
    const timer = setTimeout(() => {
      api
        .simulate(decisions, eventId)
        .then((data) => {
          if (id !== requestId.current) return
          setState({ data, loading: false, error: null })
        })
        .catch((e: unknown) => {
          if (id !== requestId.current) return
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Не удалось выполнить расчёт' }))
        })
    }, 120)
    return () => clearTimeout(timer)
  }, [decisions, eventId])

  return state
}
