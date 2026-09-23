import { useCallback, useReducer } from 'react'
import { DATASET } from '../data/dataset'
import type { Decision, DistrictId } from '../data/dataset'

interface PlanState {
  decisions: Decision[]
  /** Растёт при каждом изменении плана: по нему сбрасываем устаревший AI-анализ. */
  version: number
}

type Action =
  | { type: 'add'; decision: Decision }
  | { type: 'remove'; index: number }
  | { type: 'setDistrict'; index: number; districtId: DistrictId }
  | { type: 'replace'; decisions: Decision[] }
  | { type: 'clear' }

function reducer(state: PlanState, action: Action): PlanState {
  switch (action.type) {
    case 'add':
      if (state.decisions.some((d) => d.measureId === action.decision.measureId)) return state
      return { decisions: [...state.decisions, action.decision], version: state.version + 1 }
    case 'remove':
      return { decisions: state.decisions.filter((_, i) => i !== action.index), version: state.version + 1 }
    case 'setDistrict':
      return {
        decisions: state.decisions.map((d, i) => (i === action.index ? { ...d, districtId: action.districtId } : d)),
        version: state.version + 1,
      }
    case 'replace':
      return { decisions: action.decisions.map((d) => ({ ...d })), version: state.version + 1 }
    case 'clear':
      return { decisions: [], version: state.version + 1 }
  }
}

/** Ссылка вида `/#example` сразу открывает готовый сценарий (удобно для демо). */
function initialState(): PlanState {
  const id = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')
  const preset = DATASET.presets.find((p) => p.id === id)
  return { decisions: preset ? preset.decisions.map((d) => ({ ...d })) : [], version: 0 }
}

export function usePlan() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const add = useCallback((decision: Decision) => dispatch({ type: 'add', decision }), [])
  const remove = useCallback((index: number) => dispatch({ type: 'remove', index }), [])
  const setDistrict = useCallback((index: number, districtId: DistrictId) => dispatch({ type: 'setDistrict', index, districtId }), [])
  const replace = useCallback((decisions: Decision[]) => dispatch({ type: 'replace', decisions }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  return { decisions: state.decisions, version: state.version, add, remove, setDistrict, replace, clear }
}
