import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "./client";
import {
  DEMO_CATALOG,
  INCOMPATIBLE_DECISIONS,
  SAMPLE_DECISIONS,
  SAMPLE_EXPLANATION,
  SAMPLE_RESPONSE,
} from "../fixtures/demo";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("live API contract", () => {
  it("uses the live API by default and sends city districtId as null", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SAMPLE_RESPONSE));
    vi.stubGlobal("fetch", fetchMock);
    const response = await createApi().simulate(SAMPLE_DECISIONS);
    expect(response.result?.score).toBe(56.54307);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/simulate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ decisions: SAMPLE_DECISIONS }),
      }),
    );
  });

  it("reads the catalog and rejects malformed success responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(DEMO_CATALOG))
      .mockResolvedValueOnce(
        jsonResponse({ valid: true, result: { score: 999 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    expect((await createApi().catalog()).measures).toHaveLength(14);
    await expect(createApi().simulate(SAMPLE_DECISIONS)).rejects.toThrow(
      "не соответствует",
    );
  });

  it("does not accept an invalid plan with a numeric result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...SAMPLE_RESPONSE,
          valid: false,
          errors: [{ code: "BUDGET_EXCEEDED", message: "Бюджет превышен" }],
        }),
      ),
    );
    await expect(createApi().simulate(SAMPLE_DECISIONS)).rejects.toThrow(
      "не соответствует",
    );
  });

  it("rejects incomplete catalogs before the UI can render missing districts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ ...DEMO_CATALOG, districts: [] })),
    );
    await expect(createApi().catalog()).rejects.toThrow("не соответствует");
  });

  it("rejects results missing indicator data instead of displaying undefined values", async () => {
    const broken = structuredClone(SAMPLE_RESPONSE);
    delete broken.result!.districts[0].afterIndicators.T1;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(broken)));
    await expect(createApi().simulate(SAMPLE_DECISIONS)).rejects.toThrow(
      "не соответствует",
    );
  });

  it("rejects unknown IDs even when ten unique indicators are present", async () => {
    const broken = structuredClone(DEMO_CATALOG);
    broken.indicators[0].id = "unknown";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(broken)));
    await expect(createApi().catalog()).rejects.toThrow("не соответствует");
  });

  it("rejects a zero budget before the UI divides by it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...DEMO_CATALOG, budget: 0 })),
    );
    await expect(createApi().catalog()).rejects.toThrow("не соответствует");
  });

  it("surfaces backend errors without a fabricated result", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: "Неизвестная мера M99" }, 422),
        ),
    );
    await expect(
      createApi().simulate([{ measureId: "M99", districtId: null }]),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "Неизвестная мера M99",
    });
  });

  it("reports a proxy returning HTML instead of JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>Vite fallback</html>")),
    );
    await expect(createApi().catalog()).rejects.toThrow(
      "Не удалось прочитать ответ сервера",
    );
  });

  it("presents an unsupported response without exposing developer paths", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    await expect(createApi().catalog()).rejects.toMatchObject({
      message:
        "Ответ сервера не соответствует поддерживаемому формату. Обновите страницу или повторите попытку позже.",
    });
  });

  it("rejects an unknown AI status instead of labeling it as a factual fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ...SAMPLE_EXPLANATION, status: "success" }),
        ),
    );
    await expect(createApi().explain(SAMPLE_DECISIONS)).rejects.toThrow(
      "не соответствует",
    );
  });

  it.each([null, undefined, "", "   "])(
    "rejects AI without a meaningful model name (%s)",
    async (model) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ ...SAMPLE_EXPLANATION, status: "ai", model }),
          ),
      );
      await expect(createApi().explain(SAMPLE_DECISIONS)).rejects.toThrow(
        "не соответствует",
      );
    },
  );

  it("accepts the two supported explanation kinds", async () => {
    const ai = {
      ...SAMPLE_EXPLANATION,
      status: "ai",
      model: "configured-model",
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(ai))
        .mockResolvedValueOnce(jsonResponse(SAMPLE_EXPLANATION)),
    );
    expect(await createApi().explain(SAMPLE_DECISIONS)).toMatchObject({
      status: "ai",
      model: "configured-model",
    });
    expect(await createApi().explain(SAMPLE_DECISIONS)).toMatchObject({
      status: "fallback",
      model: null,
    });
  });

  it("keeps a caller cancellation distinguishable from network failures", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const request = createApi().catalog(controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });

  it("times out a stalled server with an actionable error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const assertion = expect(createApi().catalog()).rejects.toThrow(
      "не ответил вовремя",
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it("rejects an improvement that cannot safely be previewed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ improved: true, percentile: 75 })),
    );
    await expect(createApi().improve(SAMPLE_DECISIONS)).rejects.toThrow(
      "не соответствует",
    );
  });
});

describe("explicit fixed-fixture demo", () => {
  it("returns the checked sample independent of decision order", async () => {
    const api = createApi("demo");
    const response = await api.simulate([...SAMPLE_DECISIONS].reverse());
    expect(response).toEqual(SAMPLE_RESPONSE);
    expect(response.cost).toBe(95);
    expect(response.result?.criticalCount).toBe(0);
    expect(
      response.result?.districts.find(
        (district) => district.districtId === "nura",
      )?.afterIndicators.S2,
    ).toBe(43.75);
  });

  it("never reuses the sample score for a different complete plan", async () => {
    const changedPlan = SAMPLE_DECISIONS.map((decision, index) =>
      index === 0 ? { ...decision, districtId: "esil" } : decision,
    );
    const response = await createApi("demo").simulate(changedPlan);
    expect(response.result).toBeNull();
    expect(response.errors[0].code).toBe("DEMO_REQUIRES_SERVER");
    expect(response.cost).toBe(95);
  });

  it("keeps incomplete and known invalid fixtures free from a result", async () => {
    const api = createApi("demo");
    const empty = await api.simulate([]);
    expect(empty.result).toBeNull();
    expect(empty.cost).toBe(0);
    expect(empty.errors[0].code).toBe("EXACTLY_FIVE_REQUIRED");
    const invalid = await api.simulate(INCOMPATIBLE_DECISIONS);
    expect(invalid.result).toBeNull();
    expect(invalid.errors[0].code).toBe("INCOMPATIBLE_MEASURES");
  });

  it("labels the sample explanation as non-AI and disables improvement", async () => {
    const api = createApi("demo");
    expect((await api.catalog()).features?.improve).toBe(false);
    expect(await api.explain(SAMPLE_DECISIONS)).toMatchObject({
      status: "fallback",
      model: null,
    });
    await expect(api.explain([])).rejects.toThrow(
      "только для контрольного примера",
    );
  });

  it("returns independent fixture copies and supports cancellation", async () => {
    const api = createApi("demo");
    const first = await api.catalog();
    first.districts[0].score = 0;
    expect((await api.catalog()).districts[0].score).toBe(62.99);
    const controller = new AbortController();
    controller.abort();
    await expect(api.catalog(controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
