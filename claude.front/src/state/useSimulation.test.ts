// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Decision, SimulateResponse } from '../api/types'
import { useSimulation } from './useSimulation'

const simulate = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ api: { simulate } }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject })
  return { promise, resolve, reject }
}

const response = (decisionCount: number): SimulateResponse => ({
  decisionCount, valid: false, errors: [], cost: 0, remainingBudget: 100,
  ruleset: 'dataset', dataVersion: 'districts-v1', preview: null, result: null, event: null,
  baseline: { score: 52.55, cityAverage: 56, minDistrictScore: 49, minDistrictId: 'nura', criticalCount: 2, districts: [] },
})

beforeEach(() => { vi.useFakeTimers(); simulate.mockReset() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('simulation freshness', () => {
  it('waits for an enabled context and recalculates when data or rules change', async () => {
    simulate.mockResolvedValue(response(0))
    const { result, rerender } = renderHook(({ context, enabled }) => useSimulation([], null, context, enabled), { initialProps: { context: 'catalog:v1:dataset', enabled: false } })
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(simulate).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
    rerender({ context: 'catalog:v1:dataset', enabled: true })
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(simulate).toHaveBeenCalledTimes(1)
    expect(result.current.data).not.toBeNull()
    rerender({ context: 'catalog:v2:all_directions', enabled: true })
    expect(result.current.data).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(simulate).toHaveBeenCalledTimes(2)
    rerender({ context: 'catalog:v2:all_directions', enabled: false })
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('hides a successful old answer as soon as decisions change and ignores a late old response', async () => {
    const first = deferred<SimulateResponse>()
    const second = deferred<SimulateResponse>()
    simulate.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result, rerender } = renderHook(({ decisions }) => useSimulation(decisions, null), { initialProps: { decisions: [] as Decision[] } })
    await act(() => vi.advanceTimersByTimeAsync(120))
    rerender({ decisions: [{ measureId: 'M12', districtId: null }] })
    expect(result.current.data).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(120))
    await act(async () => second.resolve(response(1)))
    expect(result.current.data?.decisionCount).toBe(1)
    await act(async () => first.resolve(response(0)))
    expect(result.current.data?.decisionCount).toBe(1)
  })

  it('removes the last result during a new request, handles errors, and retries the same plan', async () => {
    simulate.mockResolvedValueOnce(response(0)).mockRejectedValueOnce(new Error('Нет связи')).mockResolvedValueOnce(response(1))
    const { result, rerender } = renderHook(({ decisions }) => useSimulation(decisions, null), { initialProps: { decisions: [] as Decision[] } })
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(result.current.data?.decisionCount).toBe(0)
    rerender({ decisions: [{ measureId: 'M12', districtId: null }] })
    expect(result.current.data).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBe('Нет связи')
    act(() => result.current.retry())
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(result.current.data?.decisionCount).toBe(1)
    expect(result.current.error).toBeNull()
  })

  it('invalidates the result when only the event changes', async () => {
    simulate.mockResolvedValueOnce(response(0)).mockImplementation(() => new Promise(() => {}))
    const { result, rerender } = renderHook(({ eventId }) => useSimulation([], eventId), { initialProps: { eventId: null as string | null } })
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(result.current.data).not.toBeNull()
    rerender({ eventId: 'event-1' })
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(true)
  })

  it('debounces rapid changes and does not issue a request after unmount', async () => {
    simulate.mockResolvedValue(response(1))
    const { rerender, unmount } = renderHook(({ decisions }) => useSimulation(decisions, null), { initialProps: { decisions: [] as Decision[] } })
    rerender({ decisions: [{ measureId: 'M12', districtId: null }] })
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(simulate).toHaveBeenCalledTimes(1)
    rerender({ decisions: [] })
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(120))
    expect(simulate).toHaveBeenCalledTimes(1)
  })
})
