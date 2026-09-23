// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DATASET } from '../data/dataset'
import { draftStorageKey, emptyPlan, planReducer, readDraft, writeDraft } from './planState'
import { usePlan } from './usePlan'

beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('draft lifecycle', () => {
  it('waits for the real catalogue without overwriting a stored server draft', () => {
    const serverCatalog = { ...DATASET, dataVersion: 'server-v2' }
    const saved = planReducer(emptyPlan(serverCatalog), { type: 'add', decision: { measureId: 'M7', districtId: 'nura' }, catalog: serverCatalog })
    writeDraft(saved, window.localStorage)
    const original = window.localStorage.getItem(draftStorageKey())
    const { result, rerender } = renderHook(({ catalog, ready }) => usePlan(catalog, ready), { initialProps: { catalog: DATASET, ready: false } })
    expect(result.current.ready).toBe(false)
    expect(window.localStorage.getItem(draftStorageKey())).toBe(original)
    rerender({ catalog: serverCatalog, ready: true })
    expect(result.current.ready).toBe(true)
    expect(result.current.decisions).toEqual(saved.decisions)
    expect(result.current.restored).toBe(true)
  })

  it('autosaves changes, and restores event and decisions together after reload', () => {
    const first = renderHook(() => usePlan(DATASET))
    act(() => first.result.current.add({ measureId: 'M7', districtId: 'nura' }))
    act(() => first.result.current.setEventId(DATASET.events[0].id))
    act(() => first.result.current.saveSnapshot('Школа в Нуре'))
    first.unmount()
    const second = renderHook(() => usePlan(DATASET))
    expect(second.result.current.decisions).toEqual([{ measureId: 'M7', districtId: 'nura' }])
    expect(second.result.current.eventId).toBe(DATASET.events[0].id)
    expect(second.result.current.savedPlan?.name).toBe('Школа в Нуре')
    expect(second.result.current.canUndo).toBe(false)
  })

  it('resets incompatible schema before writing the new draft', () => {
    window.localStorage.setItem(draftStorageKey(), JSON.stringify({ schemaVersion: 1, draft: { decisions: [{ measureId: 'M7', districtId: 'nura' }] } }))
    const { result } = renderHook(() => usePlan(DATASET))
    expect(result.current.decisions).toEqual([])
    expect(result.current.storageMessage).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem(draftStorageKey())!).schemaVersion).toBe(2)
  })

  it('keeps decisions and a valid snapshot while clearing undo when catalogue rules change', () => {
    const { result, rerender } = renderHook(({ catalog }) => usePlan(catalog), { initialProps: { catalog: DATASET } })
    act(() => result.current.add({ measureId: 'M7', districtId: 'nura' }))
    act(() => result.current.saveSnapshot())
    rerender({ catalog: { ...DATASET, rules: { ...DATASET.rules, ruleset: 'all_directions' } } })
    expect(result.current.decisions).toEqual([{ measureId: 'M7', districtId: 'nura' }])
    expect(result.current.savedPlan?.decisions).toEqual([{ measureId: 'M7', districtId: 'nura' }])
    expect(result.current.canUndo).toBe(false)
    expect(result.current.storageMessage).toContain('обновились')
    const saved = readDraft({ ...DATASET, rules: { ...DATASET.rules, ruleset: 'all_directions' } }, window.localStorage)
    expect(saved.storageMessage).toContain('Черновик восстановлен')
    expect(saved.signature).toBe(`${DATASET.dataVersion}:all_directions`)
  })

  it('retains a draft after a budget update even when fresh validation may reject it', () => {
    const { result, rerender } = renderHook(({ catalog }) => usePlan(catalog), { initialProps: { catalog: DATASET } })
    act(() => result.current.add({ measureId: 'M7', districtId: 'nura' }))
    act(() => result.current.setEventId(DATASET.events[0].id))
    rerender({ catalog: { ...DATASET, dataVersion: 'budget-v2', rules: { ...DATASET.rules, budget: 20 } } })
    expect(result.current.decisions).toEqual([{ measureId: 'M7', districtId: 'nura' }])
    expect(result.current.eventId).toBe(DATASET.events[0].id)
    expect(result.current.storageMessage).toContain('допустимость и результат проверяются заново')
    expect(result.current.ready).toBe(true)
  })

  it('keeps editing usable when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const { result } = renderHook(() => usePlan(DATASET))
    act(() => result.current.add({ measureId: 'M7', districtId: 'nura' }))
    expect(result.current.decisions).toHaveLength(1)
    expect(result.current.storageMessage).toContain('Не удалось сохранить')
    act(() => result.current.undo())
    expect(result.current.decisions).toEqual([])
  })
})
