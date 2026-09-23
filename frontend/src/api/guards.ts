import type {
  Catalog,
  Explanation,
  Improvement,
  SimulationResponse,
} from "./types";

type Data = Record<string, unknown>;
const object = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === "string";
const texts = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(text);
const count = (value: unknown) =>
  number(value) && Number.isInteger(value) && value >= 0;
const numbers = (value: unknown) =>
  object(value) && Object.values(value).every(number);
const direction = (value: unknown) =>
  ["transport", "ecology", "social", "safety", "services"].includes(
    value as string,
  );
const optional = (
  data: Data,
  key: string,
  guard: (value: unknown) => boolean,
) => data[key] === undefined || guard(data[key]);
const array = (value: unknown, guard: (value: unknown) => boolean) =>
  Array.isArray(value) && value.every(guard);
const indicatorIds = [
  "T1",
  "T2",
  "E1",
  "E2",
  "S1",
  "S2",
  "B1",
  "B2",
  "C1",
  "C2",
];
const indicators = (value: unknown) =>
  object(value) &&
  indicatorIds.every(
    (id) => number(value[id]) && value[id] >= 0 && value[id] <= 100,
  );
const unique = (items: unknown, key: string) =>
  Array.isArray(items) &&
  new Set(items.map((item) => (object(item) ? item[key] : undefined))).size ===
    items.length;

function districtResult(value: unknown): boolean {
  return (
    object(value) &&
    text(value.districtId) &&
    number(value.beforeScore) &&
    number(value.afterScore) &&
    indicators(value.beforeIndicators) &&
    indicators(value.afterIndicators)
  );
}

function baseline(value: unknown): boolean {
  return (
    object(value) &&
    number(value.score) &&
    number(value.cityAverage) &&
    number(value.minDistrictScore) &&
    count(value.criticalCount) &&
    optional(value, "districts", (items) => array(items, districtResult))
  );
}

function simulationResult(value: unknown): boolean {
  return (
    object(value) &&
    baseline(value) &&
    number(value.delta) &&
    array(value.districts, districtResult) &&
    Array.isArray(value.districts) &&
    value.districts.length === 5 &&
    unique(value.districts, "districtId") &&
    array(
      value.synergies,
      (item) =>
        object(item) &&
        texts(item.measureIds) &&
        text(item.districtId) &&
        text(item.indicator) &&
        number(item.bonus),
    ) &&
    optional(value, "facts", texts) &&
    optional(value, "missedSynergies", texts)
  );
}

export function isCatalog(value: unknown): value is Catalog {
  if (
    !object(value) ||
    !number(value.budget) ||
    value.budget <= 0 ||
    !text(value.ruleset) ||
    !text(value.dataVersion) ||
    !baseline(value.baseline)
  )
    return false;
  return (
    array(
      value.indicators,
      (item) =>
        object(item) &&
        text(item.id) &&
        indicatorIds.includes(item.id) &&
        text(item.name) &&
        direction(item.direction),
    ) &&
    Array.isArray(value.indicators) &&
    value.indicators.length === 10 &&
    unique(value.indicators, "id") &&
    array(
      value.districts,
      (item) =>
        object(item) &&
        text(item.id) &&
        text(item.name) &&
        text(item.description) &&
        number(item.population) &&
        item.population >= 0 &&
        item.population <= 1 &&
        number(item.score) &&
        indicators(item.indicators),
    ) &&
    Array.isArray(value.districts) &&
    value.districts.length === 5 &&
    unique(value.districts, "id") &&
    array(
      value.measures,
      (item) =>
        object(item) &&
        text(item.id) &&
        text(item.name) &&
        direction(item.direction) &&
        (item.scope === "district" || item.scope === "city") &&
        number(item.cost) &&
        item.cost >= 0 &&
        number(item.lag) &&
        item.lag >= 0 &&
        item.lag <= 8 &&
        numbers(item.effects),
    ) &&
    Array.isArray(value.measures) &&
    value.measures.length === 14 &&
    unique(value.measures, "id") &&
    optional(
      value,
      "features",
      (features) =>
        object(features) &&
        optional(
          features,
          "improve",
          (enabled) => typeof enabled === "boolean",
        ),
    )
  );
}

export function isSimulationResponse(
  value: unknown,
): value is SimulationResponse {
  if (
    !object(value) ||
    typeof value.valid !== "boolean" ||
    !baseline(value.baseline) ||
    !text(value.ruleset) ||
    !text(value.dataVersion) ||
    !count(value.decisionCount) ||
    !(value.cost === null || number(value.cost)) ||
    !(value.remainingBudget === null || number(value.remainingBudget)) ||
    !array(
      value.errors,
      (error) =>
        object(error) &&
        text(error.code) &&
        text(error.message) &&
        optional(error, "measureIds", texts),
    )
  )
    return false;
  return value.valid
    ? simulationResult(value.result) &&
        Array.isArray(value.errors) &&
        value.errors.length === 0 &&
        number(value.cost) &&
        number(value.remainingBudget) &&
        value.decisionCount === 5
    : value.result === null &&
        Array.isArray(value.errors) &&
        value.errors.length > 0;
}

export function isExplanation(value: unknown): value is Explanation {
  return (
    object(value) &&
    (value.status === "ai" || value.status === "fallback") &&
    text(value.summary) &&
    texts(value.strengths) &&
    texts(value.risks) &&
    texts(value.consequences) &&
    texts(value.recommendations) &&
    (value.status !== "ai" ||
      (text(value.model) && value.model.trim().length > 0)) &&
    optional(value, "model", (model) => model === null || text(model)) &&
    optional(value, "cached", (cached) => typeof cached === "boolean") &&
    optional(value, "grounded", (grounded) => typeof grounded === "boolean")
  );
}

export function isImprovement(value: unknown): value is Improvement {
  if (!object(value) || typeof value.improved !== "boolean") return false;
  const decisions = (items: unknown) =>
    array(
      items,
      (item) =>
        object(item) &&
        text(item.measureId) &&
        (item.districtId === null || text(item.districtId)),
    );
  if (
    value.improved &&
    (!Array.isArray(value.decisions) ||
      value.decisions.length !== 5 ||
      !decisions(value.decisions) ||
      !simulationResult(value.result) ||
      !number(value.cost))
  )
    return false;
  return (
    optional(value, "decisions", decisions) &&
    optional(value, "result", simulationResult) &&
    optional(value, "cost", number) &&
    optional(value, "percentile", (n) => number(n) && n >= 0 && n <= 100) &&
    optional(value, "totalPlans", count) &&
    optional(value, "optimalScore", number) &&
    optional(value, "message", text)
  );
}
