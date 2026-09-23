// Выбор реализации API.
//   VITE_API_MODE=http — всегда сервер (/api, в dev Vite проксирует на :8000);
//   VITE_API_MODE=mock — всё считается в браузере;
//   не задан или auto — один раз проверяем GET /api/health: сервер отвечает —
//   работаем с ним, нет — переключаемся на mock.
// Режим определяется асинхронно, поэтому `api` — тонкая обёртка, которая
// дожидается выбора реализации при первом вызове.

import type { Api } from './types'
import { mockApi } from './mock'
import { checkHealth, httpApi } from './http'
import type { HealthInfo } from './http'

export type ApiMode = 'mock' | 'http'
type RequestedMode = ApiMode | 'auto'

const raw: unknown = import.meta.env.VITE_API_MODE
export const REQUESTED_API_MODE: RequestedMode = raw === 'http' || raw === 'mock' ? raw : 'auto'

export interface ApiStatus {
  /** Фактический режим (для auto — после проверки сервера). */
  mode: ApiMode
  /** true, пока в режиме auto идёт проверка сервера. */
  resolving: boolean
  /** Настроен ли AI на сервере; null — неизвестно (mock или сервер не ответил). */
  aiConfigured: boolean | null
  aiModel: string | null
}

/**
 * Живая привязка ES-модуля: после проверки сервера значение обновляется, и
 * компоненты видят его при следующей отрисовке. Для надёжного обновления
 * используйте subscribeApiStatus / getApiStatus.
 */
export let API_MODE: ApiMode = REQUESTED_API_MODE === 'mock' ? 'mock' : 'http'

let status: ApiStatus = { mode: API_MODE, resolving: REQUESTED_API_MODE === 'auto', aiConfigured: null, aiModel: null }
const listeners = new Set<() => void>()

function setStatus(next: Partial<ApiStatus>) {
  status = { ...status, ...next }
  API_MODE = status.mode
  listeners.forEach((l) => l())
}

export const getApiStatus = (): ApiStatus => status
export function subscribeApiStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

const applyHealth = (h: HealthInfo | null) => setStatus({ aiConfigured: h?.aiConfigured ?? null, aiModel: h?.aiModel ?? null })

let chosen: Promise<Api> | null = null

function implementation(): Promise<Api> {
  chosen ??= (async (): Promise<Api> => {
    if (REQUESTED_API_MODE === 'mock') return mockApi
    if (REQUESTED_API_MODE === 'http') {
      void checkHealth().then(applyHealth)
      return httpApi
    }
    const health = await checkHealth()
    setStatus({ mode: health ? 'http' : 'mock', resolving: false })
    applyHealth(health)
    if (!health) console.info('[api] сервер /api/health не ответил — работаем в демо-режиме (mock)')
    return health ? httpApi : mockApi
  })()
  return chosen
}

// Проверку запускаем сразу, чтобы первый запрос интерфейса не ждал лишнего.
void implementation()

export const api: Api = {
  catalog: () => implementation().then((a) => a.catalog()),
  simulate: (decisions, eventId) => implementation().then((a) => a.simulate(decisions, eventId)),
  explain: (decisions, eventId) => implementation().then((a) => a.explain(decisions, eventId)),
  improve: (decisions, eventId) => implementation().then((a) => a.improve(decisions, eventId)),
  drawEvent: (excludeId) => implementation().then((a) => a.drawEvent(excludeId)),
  leaderboard: () => implementation().then((a) => a.leaderboard()),
  submit: (teamName, decisions, eventId) => implementation().then((a) => a.submit(teamName, decisions, eventId)),
  presentation: (decisions, eventId) => implementation().then((a) => a.presentation(decisions, eventId)),
}

export type * from './types'
