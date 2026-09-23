import type { Api } from './types'
import { mockApi } from './mock'
import { httpApi } from './http'

const explicitDemo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1'
export const API_MODE: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'mock' || explicitDemo ? 'mock' : 'http'
export const api: Api = API_MODE === 'http' ? httpApi : mockApi
export type * from './types'
