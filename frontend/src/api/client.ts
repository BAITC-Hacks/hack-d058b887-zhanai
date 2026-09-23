import {
  DEMO_CATALOG,
  INCOMPATIBLE_DECISIONS,
  INVALID_RESPONSE,
  SAMPLE_DECISIONS,
  SAMPLE_EXPLANATION,
  SAMPLE_RESPONSE,
} from "../fixtures/demo";
import {
  isCatalog,
  isExplanation,
  isImprovement,
  isSimulationResponse,
} from "./guards";
import type { AkimApi, ApiMode, Decision, SimulationResponse } from "./types";

export class ApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function abortError() {
  return new DOMException("Запрос отменён.", "AbortError");
}

function detailMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const detail =
    (body as Record<string, unknown>).detail ??
    (body as Record<string, unknown>).message;
  if (typeof detail === "string") return detail.slice(0, 600);
  if (Array.isArray(detail)) {
    return (
      detail
        .map((item: unknown) =>
          typeof item === "object" &&
          item !== null &&
          "msg" in item &&
          typeof item.msg === "string"
            ? item.msg
            : "",
        )
        .filter(Boolean)
        .join("; ")
        .slice(0, 600) || undefined
    );
  }
  return undefined;
}

async function request<T>(
  path: string,
  guard: (body: unknown) => body is T,
  decisions?: Decision[],
  signal?: AbortSignal,
  timeoutMs = 20_000,
): Promise<T> {
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(`/api/${path}`, {
      method: decisions === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        ...(decisions === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: decisions === undefined ? undefined : JSON.stringify({ decisions }),
      signal: controller.signal,
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (!response.ok)
        throw new ApiError(
          `Сервер вернул ошибку HTTP ${response.status}. Попробуйте ещё раз.`,
          response.status,
        );
      throw new ApiError(
        "Не удалось прочитать ответ сервера. Повторите попытку позже.",
      );
    }
    if (!response.ok)
      throw new ApiError(
        detailMessage(body) ??
          `Сервер вернул ошибку HTTP ${response.status}. Попробуйте ещё раз.`,
        response.status,
      );
    if (!guard(body))
      throw new ApiError(
        "Ответ сервера не соответствует поддерживаемому формату. Обновите страницу или повторите попытку позже.",
      );
    return body;
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut)
      throw new ApiError(
        "Сервер не ответил вовремя. Ваш план сохранён; повторите запрос.",
      );
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "Не удалось подключиться к серверу. Проверьте его запуск и соединение; ваш план сохранён.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function key(decisions: Decision[]) {
  return decisions
    .map(({ measureId, districtId }) => `${measureId}:${districtId ?? "city"}`)
    .sort()
    .join("|");
}

function copy<T>(value: T, signal?: AbortSignal): T {
  if (signal?.aborted) throw abortError();
  return structuredClone(value);
}

function demoSimulation(decisions: Decision[]): SimulationResponse {
  if (key(decisions) === key(SAMPLE_DECISIONS))
    return structuredClone(SAMPLE_RESPONSE);
  if (key(decisions) === key(INCOMPATIBLE_DECISIONS))
    return structuredClone(INVALID_RESPONSE);
  const selected = decisions.map((decision) =>
    DEMO_CATALOG.measures.find((measure) => measure.id === decision.measureId),
  );
  const cost = selected.every((measure) => measure !== undefined)
    ? selected.reduce((sum, measure) => sum + measure!.cost, 0)
    : null;
  return {
    valid: false,
    errors: [
      {
        code:
          decisions.length === 5
            ? "DEMO_REQUIRES_SERVER"
            : "EXACTLY_FIVE_REQUIRED",
        message:
          decisions.length === 5
            ? "Демо содержит только готовый расчёт контрольного примера. Для расчёта этого плана подключите сервер или загрузите контрольный пример."
            : `Выбрано ${decisions.length} из 5 мер. В демо результат доступен для контрольного примера; другие планы рассчитает подключённый сервер.`,
      },
    ],
    cost,
    remainingBudget: cost === null ? null : DEMO_CATALOG.budget - cost,
    decisionCount: decisions.length,
    ruleset: DEMO_CATALOG.ruleset,
    dataVersion: DEMO_CATALOG.dataVersion,
    baseline: structuredClone(DEMO_CATALOG.baseline),
    result: null,
  };
}

/** Live is always the default. Demo must be selected explicitly by the user. */
export function createApi(mode: ApiMode = "live"): AkimApi {
  if (mode === "demo")
    return {
      catalog: async (signal) => copy(DEMO_CATALOG, signal),
      simulate: async (decisions, signal) =>
        copy(demoSimulation(decisions), signal),
      explain: async (decisions, signal) => {
        if (signal?.aborted) throw abortError();
        if (key(decisions) !== key(SAMPLE_DECISIONS))
          throw new ApiError(
            "В демо пояснение доступно только для контрольного примера. Для других планов нужен сервер.",
          );
        return copy(SAMPLE_EXPLANATION, signal);
      },
      improve: async (_decisions, signal) =>
        copy(
          {
            improved: false,
            message:
              "Поиск улучшений станет доступен после подключения сервера.",
          },
          signal,
        ),
    };
  return {
    catalog: (signal) => request("catalog", isCatalog, undefined, signal),
    simulate: (decisions, signal) =>
      request("simulate", isSimulationResponse, decisions, signal),
    explain: (decisions, signal) =>
      request("explain", isExplanation, decisions, signal, 45_000),
    improve: (decisions, signal) =>
      request("improve", isImprovement, decisions, signal, 45_000),
  };
}
