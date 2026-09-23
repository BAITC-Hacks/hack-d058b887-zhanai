// Режим http: запросы к серверу akim-engine (backend/app/main.py,
// docs/api-contract.md). Ответы сервера приводятся к типам интерфейса в
// adapter.ts, поэтому остальной код не знает о различиях форматов.

import type { Api, Catalog, Decision } from './types'
import {
  IMPROVE_AFTER_EVENT_MESSAGE,
  adaptCatalog,
  adaptExplain,
  adaptImprove,
  adaptLeaderboardEntry,
  adaptSimulate,
  emptyImprove,
  toActiveEvent,
} from './adapter'
import type { ServerCatalog, ServerEvent, ServerExplain, ServerImprove, ServerLeaderboardEntry, ServerSimulate } from './adapter'

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'

export class ApiHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiHttpError'
    this.status = status
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Собирает читаемое сообщение из любой формы ошибки FastAPI. */
export function errorMessage(body: unknown, status: number): string {
  const fallback = status === 422 ? 'Сервер отклонил запрос (422)' : status >= 500 ? `Ошибка сервера (${status})` : `Сервер ответил ${status}`
  if (!isRecord(body)) return fallback
  const detail = body.detail ?? body.message
  if (typeof detail === 'string' && detail.trim()) return detail
  // {detail: {errors: [{code, message}]}} — ошибки правил плана
  if (isRecord(detail) && Array.isArray(detail.errors)) {
    const msgs = detail.errors.flatMap((e) => (isRecord(e) && typeof e.message === 'string' ? [e.message] : []))
    if (msgs.length) return `План недопустим: ${msgs.join('; ')}`
  }
  if (isRecord(detail) && typeof detail.message === 'string') return detail.message
  // [{loc, msg, type}] — ошибки валидации pydantic
  if (Array.isArray(detail)) {
    const msgs = detail.flatMap((e) => {
      if (!isRecord(e) || typeof e.msg !== 'string') return []
      const loc = Array.isArray(e.loc) ? e.loc.filter((x) => x !== 'body').join('.') : ''
      return [loc ? `${loc}: ${e.msg}` : e.msg]
    })
    if (msgs.length) return `Некорректный запрос: ${msgs.join('; ')}`
  }
  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiHttpError(0, 'Сервер недоступен — проверьте, что backend запущен')
  }
  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* тело не JSON */
    }
    throw new ApiHttpError(res.status, errorMessage(body, res.status))
  }
  return (await res.json()) as T
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

const plan = (decisions: Decision[], eventId?: string | null) => ({
  decisions: decisions.map((d) => ({ measureId: d.measureId, districtId: d.districtId })),
  eventId: eventId ?? null,
})

/** Последний каталог с сервера: нужен для названий мер в тексте замены. */
let catalogCache: Catalog | null = null

export const httpApi: Api = {
  async catalog() {
    catalogCache = adaptCatalog(await request<ServerCatalog>('/catalog'))
    return catalogCache
  },

  async simulate(decisions, eventId) {
    return adaptSimulate(await post<ServerSimulate>('/simulate', plan(decisions, eventId)))
  },

  async explain(decisions, eventId) {
    return adaptExplain(await post<ServerExplain>('/explain', plan(decisions, eventId)), decisions)
  },

  async improve(decisions, eventId) {
    // Сервер ищет оптимум только для исходных условий (на событие отвечает 422).
    if (eventId) return emptyImprove(IMPROVE_AFTER_EVENT_MESSAGE)
    try {
      return adaptImprove(await post<ServerImprove>('/improve', plan(decisions, null)), catalogCache ?? undefined)
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 422) return emptyImprove(e.message)
      throw e
    }
  },

  async drawEvent(excludeId) {
    const event = await post<ServerEvent>('/events/draw', { excludeId: excludeId ?? null })
    return toActiveEvent(event, catalogCache?.rules.budget)
  },

  async leaderboard() {
    const r = await request<{ entries: ServerLeaderboardEntry[] }>('/leaderboard')
    return (r.entries ?? []).map(adaptLeaderboardEntry)
  },

  async submit(teamName, decisions, eventId) {
    const saved = await post<ServerLeaderboardEntry>('/leaderboard', { teamName, ...plan(decisions, eventId) })
    return adaptLeaderboardEntry(saved)
  },

  async presentation(decisions, eventId) {
    const r = await post<{ markdown: string }>('/presentation', plan(decisions, eventId))
    return r.markdown
  },
}

export interface HealthInfo {
  status: string
  ruleset?: string
  dataVersion?: string
  aiConfigured?: boolean
  aiModel?: string | null
}

/** Проверка доступности сервера; не бросает исключений. */
export async function checkHealth(timeoutMs = 2500): Promise<HealthInfo | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: ctrl.signal })
    if (!res.ok) return null
    const body: unknown = await res.json()
    return isRecord(body) && body.status === 'ok' ? (body as unknown as HealthInfo) : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
