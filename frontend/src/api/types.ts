export type Direction =
  "transport" | "ecology" | "social" | "safety" | "services";

export type IndicatorValues = Record<string, number>;

export interface Decision {
  measureId: string;
  districtId: string | null;
}

export interface District {
  id: string;
  name: string;
  population: number;
  indicators: IndicatorValues;
  score: number;
  description: string;
}

export interface Indicator {
  id: string;
  name: string;
  direction: Direction;
}

export interface Measure {
  id: string;
  name: string;
  direction: Direction;
  scope: "district" | "city";
  cost: number;
  lag: number;
  effects: IndicatorValues;
}

export interface DistrictResult {
  districtId: string;
  beforeScore: number;
  afterScore: number;
  beforeIndicators: IndicatorValues;
  afterIndicators: IndicatorValues;
}

export interface Baseline {
  score: number;
  cityAverage: number;
  minDistrictScore: number;
  criticalCount: number;
  districts?: DistrictResult[];
}

export interface Catalog {
  districts: District[];
  measures: Measure[];
  indicators: Indicator[];
  budget: number;
  ruleset: string;
  dataVersion: string;
  baseline: Baseline;
  features?: { improve?: boolean };
}

export interface SimulationResult extends Baseline {
  delta: number;
  districts: DistrictResult[];
  synergies: {
    measureIds: string[];
    districtId: string;
    indicator: string;
    bonus: number;
  }[];
  facts?: string[];
  missedSynergies?: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  measureIds?: string[];
}

export interface SimulationResponse {
  valid: boolean;
  errors: ValidationError[];
  cost: number | null;
  remainingBudget: number | null;
  decisionCount: number;
  ruleset: string;
  dataVersion: string;
  baseline: Baseline;
  result: SimulationResult | null;
}

export interface Explanation {
  status: "ai" | "fallback";
  summary: string;
  strengths: string[];
  risks: string[];
  consequences: string[];
  recommendations: string[];
  model?: string | null;
  cached?: boolean;
  grounded?: boolean;
}

export interface Improvement {
  improved: boolean;
  decisions?: Decision[];
  result?: SimulationResult;
  cost?: number;
  percentile?: number;
  totalPlans?: number;
  optimalScore?: number;
  message?: string;
}

export type ApiMode = "live" | "demo";

export interface AkimApi {
  catalog(signal?: AbortSignal): Promise<Catalog>;
  simulate(
    decisions: Decision[],
    signal?: AbortSignal,
  ): Promise<SimulationResponse>;
  explain(decisions: Decision[], signal?: AbortSignal): Promise<Explanation>;
  improve(decisions: Decision[], signal?: AbortSignal): Promise<Improvement>;
}
