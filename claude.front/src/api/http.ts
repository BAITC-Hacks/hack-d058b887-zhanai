// The server owns numerical results; adapters translate its wire format for the UI.
import type { Api, Decision } from './types'
import { parseCatalog, parseEntry, parseEvent, parseExplanation, parseImprovement, parseLeaderboard, parseSimulation } from './wire'

const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

export class ApiHttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiHttpError' }
}

export function errorMessage(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 500)
  if (Array.isArray(value)) return value.map(errorMessage).filter(Boolean).join(' ').slice(0, 500) || null
  if (value && typeof value === 'object') {
    const data = value as Record<string, unknown>
    return errorMessage(data.detail ?? data.errors ?? data.message ?? data.msg)
  }
  return null
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 45_000): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(BASE + path, {
      ...init, headers: { 'Content-Type': 'application/json', ...init.headers }, signal: controller.signal,
    })
    let body: unknown
    try { body = await response.json() } catch {
      throw new ApiHttpError(response.status, response.ok ? 'Сервер вернул несовместимые данные.' : 'Сервер ответил ' + response.status + '. Попробуйте ещё раз.')
    }
    if (!response.ok) throw new ApiHttpError(response.status, errorMessage(body) ?? 'Ошибка сервера ' + response.status)
    return body
  } catch (error) {
    if (controller.signal.aborted) throw new ApiHttpError(408, 'Сервер не успел ответить. Повторите запрос; выбранные меры остаются в плане.')
    if (error instanceof TypeError) throw new ApiHttpError(0, 'Нет связи с сервером. Проверьте подключение и повторите запрос.')
    throw error
  } finally { clearTimeout(timeout) }
}
const post = (path: string, body: unknown, timeoutMs?: number) => request(path, { method: 'POST', body: JSON.stringify(body) }, timeoutMs)
const withEvent = (decisions: Decision[], eventId?: string | null) => ({ decisions, eventId: eventId ?? null })

export const httpApi: Api = {
  catalog: async () => parseCatalog(await request('/catalog')),
  simulate: async (decisions, eventId) => parseSimulation(await post('/simulate', withEvent(decisions, eventId))),
  explain: async (decisions, eventId) => parseExplanation(await post('/explain', withEvent(decisions, eventId)), decisions),
  improve: async (decisions, eventId) => parseImprovement(await post('/improve', withEvent(decisions, eventId), 120_000)),
  drawEvent: async excludeId => parseEvent(await post('/events/draw', { excludeId: excludeId ?? null })),
  leaderboard: async () => parseLeaderboard(await request('/leaderboard')),
  submit: async (teamName, decisions, eventId) => parseEntry(await post('/leaderboard', { teamName, ...withEvent(decisions, eventId) })),
  presentation: async (decisions, eventId) => {
    const payload = await post('/presentation', withEvent(decisions, eventId))
    if (!payload || typeof payload !== 'object' || !('markdown' in payload) || typeof payload.markdown !== 'string') throw new Error('Сервер вернул несовместимый отчёт.')
    return payload.markdown
  },
}
