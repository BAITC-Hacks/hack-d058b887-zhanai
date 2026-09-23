import { describe, expect, it } from 'vitest'
import { DATASET, type Decision } from '../data/dataset'
import { draftStorageKey, emptyPlan, planReducer, readDraft, writeDraft } from './planState'

const school: Decision = { measureId: 'M7', districtId: 'nura' }
const service: Decision = { measureId: 'M12', districtId: null }
const eventId = DATASET.events[0].id

function memoryStorage() {
  const data = new Map<string, string>()
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value) } }
}

describe('saved draft', () => {
  it('restores decisions, the event and Plan A, without retaining results or undo history', () => {
    const storage = memoryStorage()
    let state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    state = planReducer(state, { type: 'setEvent', eventId, catalog: DATASET })
    state = planReducer(state, { type: 'saveSnapshot', name: 'Школа', savedAt: '2026-09-23T10:00:00Z' })
    state = planReducer(state, { type: 'add', decision: service, catalog: DATASET })
    expect(writeDraft(state, storage)).toBe(true)
    const restored = readDraft(DATASET, storage)
    expect(restored.decisions).toEqual([school, service])
    expect(restored.eventId).toBe(eventId)
    expect(restored.savedPlan?.decisions).toEqual([school])
    expect(restored.savedPlan?.eventId).toBe(eventId)
    expect(restored.history).toEqual([])
    expect(restored.restored).toBe(true)
    expect(JSON.parse(storage.getItem(draftStorageKey())!)).not.toHaveProperty('score')
    expect(JSON.parse(storage.getItem(draftStorageKey())!)).not.toHaveProperty('history')
  })

  it('keeps demo and server drafts separate', () => {
    const storage = memoryStorage()
    const state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    writeDraft(state, storage, 'mock')
    expect(readDraft(DATASET, storage, 'http').decisions).toEqual([])
    expect(readDraft(DATASET, storage, 'mock').decisions).toEqual([school])
  })

  it.each(['{broken', '{}', '{"schemaVersion":1}', 'null'])('recovers from invalid storage: %s', (raw) => {
    const storage = memoryStorage()
    storage.setItem(draftStorageKey(), raw)
    const result = readDraft(DATASET, storage)
    expect(result.decisions).toEqual([])
    expect(result.storageMessage).toBeTruthy()
  })

  it.each(['data', 'rules'] as const)('retains known decisions and events for fresh validation when %s changed', (change) => {
    const storage = memoryStorage()
    let state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    state = planReducer(state, { type: 'setEvent', eventId, catalog: DATASET })
    state = planReducer(state, { type: 'saveSnapshot', name: 'Школа', savedAt: '2026-09-23T10:00:00Z' })
    writeDraft(state, storage)
    const changed = change === 'data' ? { ...DATASET, dataVersion: 'new-dataset' } : { ...DATASET, rules: { ...DATASET.rules, ruleset: 'all_directions' as const } }
    const restored = readDraft(changed, storage)
    expect(restored.decisions).toEqual([school])
    expect(restored.eventId).toBe(eventId)
    expect(restored.savedPlan?.decisions).toEqual([school])
    expect(restored.history).toEqual([])
    expect(restored.signature).toBe(`${changed.dataVersion}:${changed.rules.ruleset}`)
    expect(restored.storageMessage).toContain('Решения сохранены')
  })

  it('keeps the current draft when an old saved comparison uses a removed measure', () => {
    const storage = memoryStorage()
    let state = planReducer(emptyPlan(DATASET), { type: 'add', decision: service, catalog: DATASET })
    state = planReducer(state, { type: 'saveSnapshot', name: 'Сервисы', savedAt: '2026-09-23T10:00:00Z' })
    state = planReducer(state, { type: 'replace', decisions: [school], catalog: DATASET })
    writeDraft(state, storage)
    const updatedCatalog = { ...DATASET, dataVersion: 'v2', measures: DATASET.measures.filter((measure) => measure.id !== 'M12') }
    const restored = readDraft(updatedCatalog, storage)
    expect(restored.decisions).toEqual([school])
    expect(restored.savedPlan).toBeNull()
    expect(restored.storageMessage).toContain('план А недоступен')
    const live = planReducer(state, { type: 'catalogChanged', catalog: updatedCatalog })
    expect(live.decisions).toEqual([school])
    expect(live.savedPlan).toBeNull()
    expect(live.history).toEqual([])
  })

  it('still resets a draft containing unknown IDs after a catalogue update', () => {
    const storage = memoryStorage()
    const state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    writeDraft(state, storage)
    const updatedCatalog = { ...DATASET, dataVersion: 'v2', measures: DATASET.measures.filter((measure) => measure.id !== 'M7') }
    expect(readDraft(updatedCatalog, storage).decisions).toEqual([])
    const live = planReducer(state, { type: 'catalogChanged', catalog: updatedCatalog })
    expect(live.decisions).toEqual([])
    expect(live.storageMessage).toContain('сброшен')
  })

  it('rejects an unavailable event instead of displaying a plan with phantom event effects', () => {
    const storage = memoryStorage()
    const state = planReducer(emptyPlan(DATASET), { type: 'setEvent', eventId, catalog: DATASET })
    writeDraft(state, storage)
    expect(readDraft({ ...DATASET, events: [] }, storage).storageMessage).toContain('повреждён')
    expect(readDraft({ ...DATASET, events: [] }, storage).eventId).toBeNull()
  })

  it('survives denied access and exhausted storage', () => {
    expect(readDraft(DATASET, { getItem: () => { throw new Error('blocked') } }).storageMessage).toBeTruthy()
    expect(writeDraft(emptyPlan(DATASET), { setItem: () => { throw new Error('quota') } })).toBe(false)
  })
})

describe('reversible planning', () => {
  it('replaces an event scenario atomically so one undo restores all previous conditions', () => {
    let state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    state = planReducer(state, { type: 'setEvent', eventId, catalog: DATASET })
    state = planReducer(state, { type: 'replace', decisions: [service], eventId: null, catalog: DATASET })
    expect(state.decisions).toEqual([service])
    expect(state.eventId).toBeNull()
    state = planReducer(state, { type: 'undo' })
    expect(state.decisions).toEqual([school])
    expect(state.eventId).toBe(eventId)
    state = planReducer(state, { type: 'replace', decisions: [service], catalog: DATASET })
    expect(state.eventId).toBe(eventId)
  })

  it('undoes clear and event changes together with the decisions', () => {
    let state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    state = planReducer(state, { type: 'setEvent', eventId, catalog: DATASET })
    state = planReducer(state, { type: 'clear' })
    expect(state.eventId).toBeNull()
    state = planReducer(state, { type: 'undo' })
    expect(state.decisions).toEqual([school])
    expect(state.eventId).toBe(eventId)
    state = planReducer(state, { type: 'undo' })
    expect(state.eventId).toBeNull()
    expect(state.decisions).toEqual([school])
  })

  it('restores a named snapshot and allows undoing that restore', () => {
    let state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    state = planReducer(state, { type: 'saveSnapshot', name: 'План А', savedAt: '2026-09-23T10:00:00Z' })
    state = planReducer(state, { type: 'setEvent', eventId, catalog: DATASET })
    state = planReducer(state, { type: 'add', decision: service, catalog: DATASET })
    state = planReducer(state, { type: 'restoreSnapshot' })
    expect(state.decisions).toEqual([school])
    expect(state.eventId).toBeNull()
    state = planReducer(state, { type: 'undo' })
    expect(state.decisions).toEqual([school, service])
    expect(state.eventId).toBe(eventId)
  })

  it('rejects duplicates, sixth decisions and invalid district scope', () => {
    let state = planReducer(emptyPlan(DATASET), { type: 'add', decision: school, catalog: DATASET })
    expect(planReducer(state, { type: 'add', decision: school, catalog: DATASET })).toBe(state)
    expect(planReducer(state, { type: 'add', decision: { ...service, districtId: 'nura' }, catalog: DATASET })).toBe(state)
    const full: Decision[] = [school, service, { measureId: 'M8', districtId: 'nura' }, { measureId: 'M10', districtId: 'nura' }, { measureId: 'M5', districtId: 'saryarka' }]
    state = planReducer(state, { type: 'replace', decisions: full, catalog: DATASET })
    expect(planReducer(state, { type: 'add', decision: { measureId: 'M2', districtId: null }, catalog: DATASET })).toBe(state)
    expect(planReducer(state, { type: 'setDistrict', index: 1, districtId: 'nura', catalog: DATASET })).toBe(state)
  })

  it('caps undo history and skips no-op changes', () => {
    let state = emptyPlan(DATASET)
    expect(planReducer(state, { type: 'clear' })).toBe(state)
    for (let index = 0; index < 30; index++) {
      state = planReducer(state, { type: 'setEvent', eventId: index % 2 ? null : eventId, catalog: DATASET })
    }
    expect(state.history).toHaveLength(20)
    expect(planReducer(state, { type: 'remove', index: 999 })).toBe(state)
  })
})
