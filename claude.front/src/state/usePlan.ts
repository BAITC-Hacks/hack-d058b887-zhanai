import { useCallback, useEffect, useReducer, useRef } from 'react'
import { DATASET, type Catalog, type Decision, type DistrictId } from '../data/dataset'
import { catalogSignature, emptyPlan, planReducer, readDraft, writeDraft, type PlanState } from './planState'

function restore(catalog: Catalog, mode: string): PlanState {
  try {
    return readDraft(catalog, window.localStorage, mode)
  } catch {
    return { ...emptyPlan(catalog), storageMessage: 'Браузер запретил сохранение. План доступен до закрытия страницы.' }
  }
}

/** Only decisions and event IDs are stored. Scores always come from a fresh simulation. */
export function usePlan(catalog: Catalog = DATASET, catalogReady = true, mode = 'http') {
  const [state, dispatch] = useReducer(planReducer, { catalog, catalogReady, mode }, (initial) =>
    initial.catalogReady ? restore(initial.catalog, initial.mode) : emptyPlan(initial.catalog, false))
  const storageFailed = useRef(false)
  const signature = catalogSignature(catalog)

  useEffect(() => {
    if (!catalogReady) return
    if (!state.hydrated) dispatch({ type: 'hydrate', state: restore(catalog, mode) })
    else if (state.signature !== signature) dispatch({ type: 'catalogChanged', catalog })
  }, [catalog, catalogReady, mode, signature, state.hydrated, state.signature])

  useEffect(() => {
    if (!catalogReady || !state.hydrated || state.signature !== signature) return
    let saved = false
    try { saved = writeDraft(state, window.localStorage, mode) } catch { /* blocked storage */ }
    if (!saved && !storageFailed.current) {
      storageFailed.current = true
      dispatch({ type: 'message', message: 'Не удалось сохранить черновик на устройстве. Не закрывайте страницу, пока нужен текущий план.' })
    } else if (saved) {
      storageFailed.current = false
    }
  }, [catalogReady, mode, state.decisions, state.eventId, state.savedPlan, state.hydrated, state.signature, signature])

  const add = useCallback((decision: Decision) => dispatch({ type: 'add', decision, catalog }), [catalog])
  const remove = useCallback((index: number) => dispatch({ type: 'remove', index }), [])
  const setDistrict = useCallback((index: number, districtId: DistrictId) => dispatch({ type: 'setDistrict', index, districtId, catalog }), [catalog])
  const replace = useCallback((decisions: Decision[], eventId?: string | null) => dispatch({ type: 'replace', decisions, eventId, catalog }), [catalog])
  const setEventId = useCallback((eventId: string | null) => dispatch({ type: 'setEvent', eventId, catalog }), [catalog])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const saveSnapshot = useCallback((name = 'План А') => dispatch({ type: 'saveSnapshot', name, savedAt: new Date().toISOString() }), [])
  const restoreSnapshot = useCallback(() => dispatch({ type: 'restoreSnapshot' }), [])
  const dismissStorageMessage = useCallback(() => dispatch({ type: 'message', message: null }), [])

  return {
    decisions: state.decisions, version: state.version, eventId: state.eventId,
    add, remove, setDistrict, replace, clear, setEventId,
    canUndo: state.history.length > 0, undo,
    savedPlan: state.savedPlan, saveSnapshot, restoreSnapshot,
    storageMessage: state.storageMessage, restored: state.restored,
    ready: catalogReady && state.hydrated && state.signature === signature,
    dismissStorageMessage,
  }
}
