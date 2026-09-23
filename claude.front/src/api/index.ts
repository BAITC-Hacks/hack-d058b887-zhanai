import type { Api } from './types'
import { mockApi } from './mock'
import { httpApi } from './http'

export const API_MODE: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock'
export const api: Api = API_MODE === 'http' ? httpApi : mockApi
export type * from './types'
