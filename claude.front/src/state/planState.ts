import type { Catalog, Decision, DistrictId } from '../data/dataset'

export const draftStorageKey = (mode = 'http') => `akim:${mode}:plan:v2`
const SCHEMA_VERSION = 2
const HISTORY_LIMIT = 20
const UPDATED_CATALOG_MESSAGE = 'Правила или данные обновились. Решения сохранены, допустимость и результат проверяются заново.'

export interface PlanSnapshot {
  decisions: Decision[]
  eventId: string | null
}

export interface SavedPlan extends PlanSnapshot {
  name: string
  savedAt: string
}

export interface PlanState extends PlanSnapshot {
  version: number
  history: PlanSnapshot[]
  savedPlan: SavedPlan | null
  signature: string
  hydrated: boolean
  restored: boolean
  storageMessage: string | null
}

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>

export function catalogSignature(catalog: Catalog) {
  return `${catalog.dataVersion}:${catalog.rules.ruleset}`
}

function cloneDecisions(decisions: Decision[]) {
  return decisions.map((decision) => ({ ...decision }))
}

function snapshot(state: PlanSnapshot): PlanSnapshot {
  return { decisions: cloneDecisions(state.decisions), eventId: state.eventId }
}

function samePlan(a: PlanSnapshot, b: PlanSnapshot) {
  return a.eventId === b.eventId && a.decisions.length === b.decisions.length &&
    a.decisions.every((decision, index) => decision.measureId === b.decisions[index].measureId && decision.districtId === b.decisions[index].districtId)
}

export function emptyPlan(catalog: Catalog, hydrated = true): PlanState {
  return {
    decisions: [], eventId: null, version: 0, history: [], savedPlan: null,
    signature: catalogSignature(catalog), hydrated, restored: false, storageMessage: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Structural validation only. The server revalidates budget, conflicts and Score. */
export function validDecisions(value: unknown, catalog: Catalog): value is Decision[] {
  if (!Array.isArray(value) || value.length > catalog.rules.decisions) return false
  const seen = new Set<string>()
  return value.every((decision: unknown) => {
    if (!isRecord(decision) || typeof decision.measureId !== 'string' || seen.has(decision.measureId)) return false
    const measure = catalog.measures.find((item) => item.id === decision.measureId)
    if (!measure) return false
    seen.add(measure.id)
    return measure.scope === 'city'
      ? decision.districtId === null
      : catalog.districts.some((district) => district.id === decision.districtId)
  })
}

function validSnapshot(value: unknown, catalog: Catalog): value is PlanSnapshot {
  return isRecord(value) && validDecisions(value.decisions, catalog) &&
    (value.eventId === null || typeof value.eventId === 'string' && catalog.events.some((event) => event.id === value.eventId))
}

function validSavedPlan(value: unknown, catalog: Catalog): value is SavedPlan {
  return validSnapshot(value, catalog) && isRecord(value) &&
    typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 60 &&
    typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt))
}

export function readDraft(catalog: Catalog, storage: StorageReader, mode = 'http'): PlanState {
  const initial = emptyPlan(catalog)
  try {
    const raw = storage.getItem(draftStorageKey(mode))
    if (!raw) return initial
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.schemaVersion !== SCHEMA_VERSION || typeof parsed.signature !== 'string') {
      return { ...initial, storageMessage: 'Сохранённый черновик не удалось прочитать. Можно начать новый план.' }
    }
    if (!validSnapshot(parsed.draft, catalog)) {
      return { ...initial, storageMessage: 'Сохранённый черновик повреждён или содержит недоступные меры. Можно начать новый план.' }
    }
    const versionChanged = parsed.signature !== initial.signature
    const savedPlan = validSavedPlan(parsed.savedPlan, catalog) ? parsed.savedPlan : null
    const snapshotRemoved = parsed.savedPlan !== null && !savedPlan
    const restored = parsed.draft.decisions.length > 0 || parsed.draft.eventId !== null
    const message = versionChanged ? UPDATED_CATALOG_MESSAGE
      : restored ? 'Черновик восстановлен на этом устройстве. Результат рассчитывается заново.' : null
    return {
      ...initial, ...snapshot(parsed.draft), savedPlan: savedPlan === null ? null : {
        ...snapshot(savedPlan), name: savedPlan.name, savedAt: savedPlan.savedAt,
      }, restored,
      storageMessage: snapshotRemoved ? `${message ?? ''} Сохранённый план А недоступен в текущем каталоге и удалён.`.trim() : message,
    }
  } catch {
    return { ...initial, storageMessage: 'Локальное сохранение недоступно или черновик повреждён. Текущий план можно продолжить.' }
  }
}

export function writeDraft(state: PlanState, storage: StorageWriter, mode = 'http'): boolean {
  try {
    storage.setItem(draftStorageKey(mode), JSON.stringify({
      schemaVersion: SCHEMA_VERSION, signature: state.signature,
      draft: snapshot(state), savedPlan: state.savedPlan,
    }))
    return true
  } catch {
    return false
  }
}

export type PlanAction =
  | { type: 'add'; decision: Decision; catalog: Catalog }
  | { type: 'remove'; index: number }
  | { type: 'setDistrict'; index: number; districtId: DistrictId; catalog: Catalog }
  | { type: 'replace'; decisions: Decision[]; catalog: Catalog; eventId?: string | null }
  | { type: 'setEvent'; eventId: string | null; catalog: Catalog }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'saveSnapshot'; name: string; savedAt: string }
  | { type: 'restoreSnapshot' }
  | { type: 'hydrate'; state: PlanState }
  | { type: 'catalogChanged'; catalog: Catalog }
  | { type: 'message'; message: string | null }

function changePlan(state: PlanState, next: PlanSnapshot): PlanState {
  if (samePlan(state, next)) return state
  return {
    ...state, ...snapshot(next), version: state.version + 1,
    history: [...state.history, snapshot(state)].slice(-HISTORY_LIMIT),
  }
}

export function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case 'add': {
      const decisions = [...state.decisions, action.decision]
      return validDecisions(decisions, action.catalog) ? changePlan(state, { ...state, decisions }) : state
    }
    case 'remove':
      return changePlan(state, { ...state, decisions: state.decisions.filter((_, index) => index !== action.index) })
    case 'setDistrict': {
      const decisions = state.decisions.map((decision, index) => index === action.index ? { ...decision, districtId: action.districtId } : decision)
      return validDecisions(decisions, action.catalog) ? changePlan(state, { ...state, decisions }) : state
    }
    case 'replace': {
      const eventId = action.eventId === undefined ? state.eventId : action.eventId
      const validEvent = eventId === null || action.catalog.events.some((event) => event.id === eventId)
      return validDecisions(action.decisions, action.catalog) && validEvent
        ? changePlan(state, { decisions: action.decisions, eventId }) : state
    }
    case 'setEvent':
      return action.eventId === null || action.catalog.events.some((event) => event.id === action.eventId)
        ? changePlan(state, { ...state, eventId: action.eventId }) : state
    case 'clear':
      return changePlan(state, { decisions: [], eventId: null })
    case 'undo': {
      const previous = state.history.at(-1)
      return previous ? { ...state, ...snapshot(previous), history: state.history.slice(0, -1), version: state.version + 1 } : state
    }
    case 'saveSnapshot':
      return { ...state, savedPlan: { ...snapshot(state), name: action.name.trim().slice(0, 60) || 'План А', savedAt: action.savedAt } }
    case 'restoreSnapshot':
      return state.savedPlan ? changePlan(state, state.savedPlan) : state
    case 'hydrate':
      // Do not replace work entered while the catalogue was loading.
      return state.version === 0 ? action.state : { ...state, hydrated: true, signature: action.state.signature }
    case 'catalogChanged': {
      const nextVersion = state.version + 1
      if (!validSnapshot(state, action.catalog)) {
        return {
          ...emptyPlan(action.catalog), version: nextVersion,
          storageMessage: 'Каталог обновился. Прежний план содержит недоступные меры или событие и сброшен. Выберите решения из нового каталога.',
        }
      }
      const savedPlan = validSavedPlan(state.savedPlan, action.catalog) ? state.savedPlan : null
      return {
        ...emptyPlan(action.catalog), ...snapshot(state), version: nextVersion,
        savedPlan: savedPlan ? { ...snapshot(savedPlan), name: savedPlan.name, savedAt: savedPlan.savedAt } : null,
        restored: state.restored,
        storageMessage: state.savedPlan && !savedPlan ? `${UPDATED_CATALOG_MESSAGE} Сохранённый план А недоступен в текущем каталоге и удалён.` : UPDATED_CATALOG_MESSAGE,
      }
    }
    case 'message':
      return state.storageMessage === action.message ? state : { ...state, storageMessage: action.message }
  }
}
