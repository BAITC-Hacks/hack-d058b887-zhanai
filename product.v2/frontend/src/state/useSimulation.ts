import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import type { Decision, SimResult, SimulateResponse } from '../api'

export type PlanStatus = 'empty' | 'draft' | 'invalid' | 'valid'

/** Ключ запроса «план + событие»: по нему сверяем, к чему относится ответ. */
export const planKey = (decisions: Decision[], eventId: string | null) =>
  JSON.stringify({ d: decisions.map((x) => [x.measureId, x.districtId ?? null]), e: eventId ?? null })

/**
 * Какой расчёт можно показывать как Score. Для допустимого плана — только
 * официальный `result`; для незаконченного — `preview` (интерфейс помечает его
 * «Предварительно»); для недопустимого Score не считается по правилам датасета.
 */
export function scoreResult(sim: SimulateResponse | null, status: PlanStatus): SimResult | null {
  if (!sim) return null
  if (status === 'valid') return sim.result
  if (status === 'draft') return sim.preview
  return null
}

interface SimulationState {
  /** Последний полученный ответ; пока идёт пересчёт, он относится к прежнему плану. */
  last: SimulateResponse | null
  /** Ключ запроса, на который получен `last`. */
  lastKey: string | null
  loading: boolean
  error: string | null
}

/**
 * Пересчитывает план на сервере при каждом изменении (с небольшой задержкой).
 * Запоздавший ответ старого запроса не перекрывает новый. Ответ хранится вместе
 * с ключом запроса: `data` отдаётся, только когда он совпадает с текущим планом
 * и событием (`isCurrent`). Пока идёт пересчёт, прежние числа доступны как
 * `last` — их можно показать приглушёнными, но нельзя использовать для логики
 * доступности, бюджета и действий.
 */
export function useSimulation(decisions: Decision[], eventId: string | null) {
  const [state, setState] = useState<SimulationState>({ last: null, lastKey: null, loading: true, error: null })
  const [attempt, setAttempt] = useState(0)
  const requestId = useRef(0)
  const key = useMemo(() => planKey(decisions, eventId), [decisions, eventId])

  useEffect(() => {
    const id = ++requestId.current
    const requestKey = planKey(decisions, eventId)
    setState((s) => ({ ...s, loading: true }))
    const timer = setTimeout(() => {
      api
        .simulate(decisions, eventId)
        .then((data) => {
          if (id !== requestId.current) return
          setState({ last: data, lastKey: requestKey, loading: false, error: null })
        })
        .catch((e: unknown) => {
          if (id !== requestId.current) return
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'Не удалось выполнить расчёт' }))
        })
    }, 120)
    return () => clearTimeout(timer)
  }, [decisions, eventId, attempt])

  /** Повторить расчёт текущего плана (после ошибки сети или сервера). */
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const isCurrent = state.lastKey === key
  return {
    /** Ответ для текущего плана и события; null, пока идёт пересчёт. */
    data: isCurrent ? state.last : null,
    last: state.last,
    isCurrent,
    loading: state.loading,
    error: state.error,
    retry,
  }
}
