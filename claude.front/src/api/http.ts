// Режим http: запросы к серверу по контракту из Доки/plan-akim-2-people.md.

import type { Api, Decision } from './types'

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

class ApiHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let message = `Сервер ответил ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string; message?: string }
      message = body.detail ?? body.message ?? message
    } catch {
      /* тело не JSON */
    }
    throw new ApiHttpError(res.status, message)
  }
  return (await res.json()) as T
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

const withEvent = (decisions: Decision[], eventId?: string | null) => ({ decisions, eventId: eventId ?? null })

export const httpApi: Api = {
  catalog: () => request('/catalog'),
  simulate: (decisions, eventId) => post('/simulate', withEvent(decisions, eventId)),
  explain: (decisions, eventId) => post('/explain', withEvent(decisions, eventId)),
  improve: (decisions, eventId) => post('/improve', withEvent(decisions, eventId)),
  drawEvent: (excludeId) => post('/events/draw', { excludeId: excludeId ?? null }),
  leaderboard: () => request('/leaderboard'),
  submit: (teamName, decisions, eventId) => post('/leaderboard', { teamName, ...withEvent(decisions, eventId) }),
  presentation: async (decisions, eventId) => {
    const r = await post<{ markdown: string }>('/presentation', withEvent(decisions, eventId))
    return r.markdown
  },
}
