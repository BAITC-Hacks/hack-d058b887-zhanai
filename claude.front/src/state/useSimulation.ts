import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { Decision, SimulateResponse } from '../api'

interface SimulationState {
  data: SimulateResponse | null
  loading: boolean
  error: string | null
  key: string
}

/**
 * An answer is visible only for the exact plan/event that produced it.
 */
export function useSimulation(decisions: Decision[], eventId: string | null, contextKey = '', enabled = true) {
  const key = JSON.stringify([decisions, eventId, contextKey])
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<SimulationState>({ data: null, loading: true, error: null, key: '' })
  const requestId = useRef(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    const id = ++requestId.current
    let active = true
    if (!enabled) {
      setState({ data: null, loading: false, error: null, key })
      return
    }
    setState({ data: null, loading: true, error: null, key })
    const timer = setTimeout(() => {
      api
        .simulate(decisions, eventId)
        .then((data) => {
          if (!active || id !== requestId.current) return
          setState({ data, loading: false, error: null, key })
        })
        .catch((e: unknown) => {
          if (!active || id !== requestId.current) return
          setState({ data: null, loading: false, error: e instanceof Error ? e.message : 'Не удалось выполнить расчёт', key })
        })
    }, 120)
    return () => { active = false; clearTimeout(timer) }
  // The serialized key also deduplicates equivalent arrays recreated by a caller.
  }, [key, attempt, enabled])

  // React renders changed props before effect cleanup. Hide the old answer in that render.
  const current = enabled && state.key === key
  return {
    data: current ? state.data : null,
    loading: enabled ? current ? state.loading : true : false,
    error: current ? state.error : null,
    stale: !current || state.loading,
    retry,
  }
}
