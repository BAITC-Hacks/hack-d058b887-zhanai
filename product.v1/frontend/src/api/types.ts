// Контракт API. Совпадает с docs-планом (Доки/plan-akim-2-people.md, раздел
// «Общий формат данных и API»). Поле `preview` — дополнение: тот же расчёт,
// что и `result`, но для неполного или недопустимого набора, чтобы интерфейс
// показывал последствия каждого решения сразу. Сервер может его не отдавать —
// тогда интерфейс покажет только валидный результат.

import type { Catalog, Decision, DirectionId, DistrictId, IndicatorId } from '../data/dataset'
export type { Catalog, Decision, DirectionId, DistrictId, IndicatorId }

export type ErrorCode =
  | 'EXACTLY_FIVE_REQUIRED'
  | 'DUPLICATE_MEASURE'
  | 'BUDGET_EXCEEDED'
  | 'DISTRICT_REQUIRED'
  | 'CITY_DISTRICT_FORBIDDEN'
  | 'DIRECTION_LIMIT'
  | 'INCOMPATIBLE_MEASURES'
  | 'ALL_DIRECTIONS_REQUIRED'
  | 'UNKNOWN_MEASURE'
  | 'UNKNOWN_DISTRICT'

export interface ApiError {
  code: ErrorCode
  message: string
  measureIds: string[]
}

export type IndicatorValues = Record<IndicatorId, number>

export interface DistrictResult {
  districtId: DistrictId
  beforeScore: number
  afterScore: number
  beforeIndicators: IndicatorValues
  afterIndicators: IndicatorValues
  criticalBefore: IndicatorId[]
  criticalAfter: IndicatorId[]
}

export interface SynergyHit {
  measureIds: [string, string]
  districtId: DistrictId
  indicator: IndicatorId
  bonus: number
}

export interface MissedSynergy {
  /** Мера, которая уже в плане. */
  have: string
  /** Мера, которой не хватает для бонуса. */
  need: string
  indicator: IndicatorId
  bonus: number
}

export interface DecisionResult {
  measureId: string
  districtId: DistrictId | null
  cost: number
  lag: number
  /** (H − lag) / H */
  realizedShare: number
  realizedEffects: Partial<Record<IndicatorId, number>>
}

export interface SimResult {
  score: number
  delta: number
  cityAverage: number
  minDistrictScore: number
  minDistrictId: DistrictId
  criticalCount: number
  districts: DistrictResult[]
  synergies: SynergyHit[]
  missedSynergies: MissedSynergy[]
  decisions: DecisionResult[]
  /** Короткие утверждения с числами, из которых собирается AI-пояснение. */
  facts: string[]
  directionCoverage: Record<DirectionId, number>
  unusedBudget: number
}

export interface Baseline {
  score: number
  cityAverage: number
  minDistrictScore: number
  minDistrictId: DistrictId
  criticalCount: number
  districts: { districtId: DistrictId; score: number; indicators: IndicatorValues }[]
}

export interface ActiveEvent {
  id: string
  title: string
  text: string
  effects: { districtId: DistrictId; indicator: IndicatorId; delta: number }[]
  budgetDelta: number
  /** Бюджет после события. */
  budget: number
}

export interface SimulateResponse {
  valid: boolean
  errors: ApiError[]
  cost: number | null
  remainingBudget: number | null
  decisionCount: number
  ruleset: string
  dataVersion: string
  baseline: Baseline
  result: SimResult | null
  preview: SimResult | null
  event: ActiveEvent | null
}

export interface ExplainResponse {
  status: 'ai' | 'fallback' | 'error'
  summary: string
  strengths: string[]
  risks: string[]
  consequences: string[]
  recommendations: string[]
  decisions: { measureId: string; districtId: DistrictId | null; text: string }[]
  model: string | null
  cached: boolean
  grounded: boolean
}

export interface ImproveResponse {
  /** Доля допустимых планов, которые хуже текущего, 0–100. */
  percentile: number | null
  percentileExact: boolean
  totalPlans: number | null
  optimum: { decisions: Decision[]; score: number; cost: number } | null
  swap: {
    remove: Decision
    add: Decision
    score: number
    delta: number
    cost: number
    text: string
  } | null
  message: string | null
}

export type AgentTool = 'simulate_plan' | 'find_improvements'

/** Шаг агента: вызов инструмента. Числа посчитаны симулятором сервера. */
export interface AgentStep {
  tool: AgentTool
  title: string
  decisions: Decision[] | null
  valid: boolean | null
  score: number | null
  delta: number | null
  cost: number | null
  note: string
}

export interface AgentRecommendation {
  decisions: Decision[]
  rationale: string
  valid: boolean
  score: number | null
  delta: number | null
  cost: number | null
  criticalCount: number | null
  errors: string[]
}

export interface AgentResponse {
  status: 'ai' | 'unavailable' | 'error'
  model: string | null
  /** Для unavailable/error: объяснение по-русски. */
  reason: string | null
  summary: string
  findings: string[]
  risks: string[]
  steps: AgentStep[]
  recommendation: AgentRecommendation | null
  /** false — в тексте модели есть числа, которых нет в результатах инструментов. */
  grounded: boolean
  iterations: number
}

export interface LeaderboardEntry {
  id: string
  teamName: string
  score: number
  delta: number
  cost: number
  criticalCount: number
  decisions: Decision[]
  eventId: string | null
  createdAt: string
}

export interface Api {
  catalog(): Promise<Catalog>
  simulate(decisions: Decision[], eventId?: string | null): Promise<SimulateResponse>
  explain(decisions: Decision[], eventId?: string | null): Promise<ExplainResponse>
  improve(decisions: Decision[], eventId?: string | null): Promise<ImproveResponse>
  drawEvent(excludeId?: string | null): Promise<ActiveEvent>
  leaderboard(): Promise<LeaderboardEntry[]>
  submit(teamName: string, decisions: Decision[], eventId?: string | null): Promise<LeaderboardEntry>
  presentation(decisions: Decision[], eventId?: string | null): Promise<string>
  agent(decisions: Decision[], eventId?: string | null, goal?: string | null): Promise<AgentResponse>
}
