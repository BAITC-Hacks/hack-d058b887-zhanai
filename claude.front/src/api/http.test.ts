import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixtureJson from './__fixtures__/backend.json?raw'
import { httpApi, errorMessage } from './http'
import { parseCatalog, parseEntry, parseEvent, parseExplanation, parseImprovement, parseLeaderboard, parseSimulation } from './wire'

// Captured from the deterministic Python TestClient with OPENAI_API_KEY unset.
const fixtures = JSON.parse(fixtureJson)
const example = [{ measureId: 'M7', districtId: 'nura' as const }, { measureId: 'M8', districtId: 'nura' as const }, { measureId: 'M10', districtId: 'nura' as const }, { measureId: 'M12', districtId: null }, { measureId: 'M5', districtId: 'saryarka' as const }]
beforeEach(() => { parseCatalog(fixtures.catalog) })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('real backend to Claude view model', () => {
  it('uses authoritative catalog values, scoped conflicts and server event IDs', () => {
    const catalog = parseCatalog(fixtures.catalog)
    expect(catalog.dataVersion).toBe('akim-dataset-v1')
    expect(catalog.measures.find(m => m.id === 'M7')).toMatchObject({ directionId: 'social', cost: 24, lag: 3 })
    expect(catalog.incompatibilities.find(c => c.a === 'M4')).toMatchObject({ b: 'M7', scope: 'sameDistrict' })
    expect(catalog.events.map(e => e.id)).toContain('budget_cut')
    expect(catalog.events.map(e => e.id)).not.toContain('sequester')
    expect(catalog.rules.weights.S1).toBe(0.11)
  })
  it('provides only valid scenario choices for the all-directions ruleset', () => {
    const catalog = parseCatalog({ ...fixtures.catalog, ruleset: 'all_directions' })
    expect(catalog.presets).toHaveLength(1)
    const directions = catalog.presets[0].decisions.map(d => catalog.measures.find(m => m.id === d.measureId)!.directionId)
    expect(new Set(directions).size).toBe(5)
  })
  it('preserves reference result, critical values and baseline district', () => {
    const response = parseSimulation(fixtures.complete)
    expect(response.result?.score).toBeCloseTo(56.54307, 8)
    expect(response.result?.delta).toBeCloseTo(3.98539, 8)
    expect(response.result?.criticalCount).toBe(0)
    expect(response.result?.minDistrictId).toBe('nura')
    expect(response.baseline.minDistrictId).toBe('nura')
    expect(response.result?.districts.find(d => d.districtId === 'nura')?.criticalBefore).toEqual(['S1', 'S2'])
  })
  it('keeps incomplete map preview separate from the official result', () => {
    const response = parseSimulation(fixtures.draft)
    expect(response.valid).toBe(false)
    expect(response.result).toBeNull()
    expect(response.preview?.districts.find(d => d.districtId === 'nura')?.afterIndicators.S1).toBe(48)
    expect(response.preview?.missedSynergies).toEqual([])
  })
  it('translates honest fallback commentary and restores district context', () => {
    const response = parseExplanation(fixtures.explanation, example)
    expect(response.status).toBe('fallback')
    expect(response.model).toBeNull()
    expect(response.grounded).toBe(true)
    expect(response.decisions.find(d => d.measureId === 'M7')?.districtId).toBe('nura')
  })
  it('reports exact search population and a real positive one-measure diff', () => {
    const response = parseImprovement(fixtures.improvement)
    expect(response.percentileExact).toBe(true)
    expect(response.totalPlans).toBe(694395)
    expect(response.optimum?.score).toBeCloseTo(57.236735, 8)
    expect(response.swap?.delta).toBeGreaterThan(0)
    expect(response.swap?.delta).toBeCloseTo(response.swap!.score - fixtures.complete.result.score, 8)
  })
  it('turns the server event into a correct budget and title', () => {
    const event = parseEvent(fixtures.catalog.events.find((e: { id: string }) => e.id === 'budget_cut'))
    expect(event.budget).toBe(90)
    expect(event.budgetDelta).toBe(-10)
    expect(event.title).toBe('Секвестр бюджета')
  })
  it('normalizes leaderboard entries without inventing timestamps or scores', () => {
    const result = fixtures.complete.result
    const response = parseEntry({ teamName: 'Нура', score: result.score, delta: result.delta, cost: 95, criticalCount: 0, decisions: example, updatedAt: '2026-09-23T10:00:00Z' })
    expect(response.id).toContain('akim-dataset-v1:Нура')
    expect(response.createdAt).toBe('2026-09-23T10:00:00Z')
    expect(response.eventId).toBeNull()
  })
  it('rejects malformed or misleading results at the HTTP boundary', () => {
    expect(() => parseSimulation({ ...fixtures.complete, valid: false })).toThrow('несовместимые')
    expect(() => parseSimulation({ ...fixtures.complete, result: null })).toThrow('несовместимые')
    expect(() => parseSimulation({ ...fixtures.complete, result: { ...fixtures.complete.result, score: NaN } })).toThrow('несовместимые')
    expect(() => parseCatalog({ ...fixtures.catalog, districts: [] })).toThrow('несовместимые')
    expect(() => parseImprovement({ ...fixtures.improvement, percentile: 101 })).toThrow('несовместимые')
  })
  it('requires a catalog refresh when the server changes data or rules', () => {
    expect(() => parseSimulation({ ...fixtures.complete, dataVersion: 'akim-dataset-v2' })).toThrow('версия данных')
    expect(() => parseLeaderboard({ ruleset: 'all_directions', dataVersion: fixtures.catalog.dataVersion, entries: [] })).toThrow('Правила')
  })
})

describe('HTTP failure recovery', () => {
  it('unpacks nested FastAPI validation errors into readable text', () => {
    expect(errorMessage({ detail: { errors: [{ message: 'Нужен район.' }, { message: 'Бюджет превышен.' }] } })).toBe('Нужен район. Бюджет превышен.')
    expect(errorMessage({ detail: [{ msg: 'Field required' }] })).toBe('Field required')
  })
  it('sends a plan without client costs or scores and adapts the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(fixtures.complete), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const response = await httpApi.simulate(example)
    expect(response.cost).toBe(95)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/simulate')
    expect(JSON.parse(init.body)).toEqual({ decisions: example, eventId: null })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
  it('retains meaningful server errors, including forbidden event ranking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Событие здесь не допускается.' }), { status: 422 })))
    await expect(httpApi.submit('Team', example, 'smog')).rejects.toThrow('Событие здесь не допускается.')
  })
  it('makes lost connectivity understandable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(httpApi.catalog()).rejects.toThrow('Нет связи с сервером')
  })
  it('rejects a proxy HTML page instead of treating it as a catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy</html>', { status: 200 })))
    await expect(httpApi.catalog()).rejects.toThrow('несовместимые')
  })
  it('aborts a stalled request and clears its timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))))
    const pending = expect(httpApi.catalog()).rejects.toThrow('Сервер не успел ответить')
    await vi.advanceTimersByTimeAsync(45_000)
    await pending
    expect(vi.getTimerCount()).toBe(0)
  })
})
