import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { createApi } from "./api/client";
import type {
  AkimApi,
  Decision,
  Explanation,
  SimulationResponse,
} from "./api/types";
import {
  DEMO_CATALOG,
  SAMPLE_DECISIONS,
  SAMPLE_EXPLANATION,
  SAMPLE_RESPONSE,
} from "./fixtures/demo";

vi.mock("./api/client", () => ({ createApi: vi.fn() }));

const catalog = vi.fn<AkimApi["catalog"]>();
const simulate = vi.fn<AkimApi["simulate"]>();
const explain = vi.fn<AkimApi["explain"]>();
const improve = vi.fn<AkimApi["improve"]>();
const api: AkimApi = { catalog, simulate, explain, improve };

function invalidPlan(decisions: Decision[]): SimulationResponse {
  const cost = decisions.reduce(
    (total, decision) =>
      total +
      DEMO_CATALOG.measures.find(
        (measure) => measure.id === decision.measureId,
      )!.cost,
    0,
  );
  return {
    ...structuredClone(SAMPLE_RESPONSE),
    valid: false,
    result: null,
    cost,
    remainingBudget: DEMO_CATALOG.budget - cost,
    decisionCount: decisions.length,
    errors: [
      {
        code: "INVALID_PLAN",
        message: "Сервер: проверьте количество мер и ограничения плана.",
      },
    ],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function openApp() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole("button", { name: "Загрузить пример" });
  return user;
}

async function loadSample(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Загрузить пример" }));
  await screen.findByTestId("result-score");
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState({}, "", "/");
  vi.mocked(createApi).mockReturnValue(api);
  catalog.mockResolvedValue(structuredClone(DEMO_CATALOG));
  simulate.mockImplementation(async (decisions) =>
    decisions.length === 5
      ? structuredClone(SAMPLE_RESPONSE)
      : invalidPlan(decisions),
  );
  explain.mockResolvedValue(structuredClone(SAMPLE_EXPLANATION));
  improve.mockResolvedValue({
    improved: false,
    message: "Лучший вариант не найден.",
  });
});

describe("plan building and the reference scenario", () => {
  it("keeps the score absent for an empty or incomplete plan and requires a district", async () => {
    const user = await openApp();
    expect(screen.queryByTestId("result-score")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Рассчитать план" }),
    ).toBeDisabled();
    const add = screen.getByRole("button", { name: /^Добавить M7:/ });
    expect(add).toBeDisabled();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Район для M7" }),
      "nura",
    );
    await user.click(add);
    expect(
      screen.getByRole("button", { name: "Удалить M7" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Рассчитать план" }),
    ).toBeDisabled();
    expect(
      await screen.findByText(
        "Сервер: проверьте количество мер и ограничения плана.",
      ),
    ).toBeVisible();
    expect(screen.queryByTestId("result-score")).not.toBeInTheDocument();
  });

  it("renders the complete known scenario and labels the fallback explanation honestly", async () => {
    const user = await openApp();
    await loadSample(user);

    expect(simulate).toHaveBeenLastCalledWith(
      SAMPLE_DECISIONS,
      expect.any(AbortSignal),
    );
    expect(screen.getByTestId("result-score")).toHaveTextContent("56,54");
    expect(screen.getByText("+3,99 балла к исходному")).toBeVisible();
    const budget = screen.getByRole("region", { name: "Бюджет и правила" });
    expect(within(budget).getByText(/Использовано/)).toHaveTextContent("95");
    expect(within(budget).getByText(/Осталось/)).toHaveTextContent("5");
    expect(
      screen.getByText("Критические показатели").parentElement,
    ).toHaveTextContent("2 → 0");
    expect(screen.getByText("M10 + M12")).toBeVisible();
    expect(screen.getByText("+2 B1")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Объяснить результат" }),
    );
    expect(await screen.findByText(SAMPLE_EXPLANATION.summary)).toBeVisible();
    expect(screen.getByText("Без AI · по фактам")).toBeVisible();
    expect(explain).toHaveBeenCalledWith(
      SAMPLE_DECISIONS,
      expect.any(AbortSignal),
    );
  });

  it.each(["remove", "district"] as const)(
    "clears old results and explanation immediately after a %s change",
    async (action) => {
      const user = await openApp();
      await loadSample(user);
      await user.click(
        screen.getByRole("button", { name: "Объяснить результат" }),
      );
      await screen.findByText(SAMPLE_EXPLANATION.summary);

      if (action === "remove")
        await user.click(screen.getByRole("button", { name: "Удалить M7" }));
      else
        await user.selectOptions(
          screen.getByRole("combobox", { name: "Изменить район M7" }),
          "esil",
        );

      // Assert before the debounce can request a fresh calculation.
      expect(screen.queryByTestId("result-score")).not.toBeInTheDocument();
      expect(
        screen.queryByText(SAMPLE_EXPLANATION.summary),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("M10 + M12")).not.toBeInTheDocument();
    },
  );

  it("marks only indicators strictly below 40 as critical", async () => {
    const user = await openApp();
    const nura = screen.getByRole("button", { name: /^Нура/ });
    expect(within(nura).getByText("2 показателя ниже 40")).toBeInTheDocument();
    const almaty = screen.getByRole("button", { name: /^Алматы/ });
    const saryarka = screen.getByRole("button", { name: /^Сарыарка/ });
    expect(within(almaty).queryByText(/ниже 40/)).not.toBeInTheDocument();
    expect(within(saryarka).queryByText(/ниже 40/)).not.toBeInTheDocument();

    await user.click(
      screen.getByText("Нура:", { selector: "strong" }).closest("summary")!,
    );
    const transportRow = screen
      .getByText("Доступность общественного транспорта")
      .closest(".indicator-row")!;
    expect(transportRow).toHaveTextContent("40,00");
    expect(
      within(transportRow as HTMLElement).queryByText("Критический"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Критический")).toHaveLength(2);
  });

  it("shows budget overflow without replacing an invalid result with a zero score", async () => {
    simulate.mockImplementation(async (decisions) => invalidPlan(decisions));
    const user = await openApp();
    for (const id of ["M3", "M13", "M7", "M5"]) {
      await user.selectOptions(
        screen.getByRole("combobox", { name: `Район для ${id}` }),
        "nura",
      );
      await user.click(
        screen.getByRole("button", { name: new RegExp(`^Добавить ${id}:`) }),
      );
    }
    await user.click(screen.getByRole("button", { name: /^Добавить M2:/ }));
    expect(
      screen.getByText("Бюджет превышен на 29 ед. Замените или удалите меру."),
    ).toBeVisible();
    expect(
      await screen.findByText(
        "Сервер: проверьте количество мер и ограничения плана.",
      ),
    ).toBeVisible();
    expect(screen.queryByTestId("result-score")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Удалить M/ })).toHaveLength(
      5,
    );
  });
});

describe("request safety and recovery", () => {
  it("ignores a late successful calculation after the selected plan changes", async () => {
    const pending = deferred<SimulationResponse>();
    simulate.mockImplementation(async (decisions) =>
      decisions.length === 5 ? pending.promise : invalidPlan(decisions),
    );
    const user = await openApp();
    await user.click(screen.getByRole("button", { name: "Загрузить пример" }));
    await waitFor(() =>
      expect(simulate).toHaveBeenCalledWith(
        SAMPLE_DECISIONS,
        expect.any(AbortSignal),
      ),
    );
    const oldSignal = simulate.mock.calls.find(
      ([decisions]) => decisions.length === 5,
    )![1]!;

    await user.click(screen.getByRole("button", { name: "Удалить M7" }));
    expect(oldSignal.aborted).toBe(true);
    // A transport can still resolve after cancellation; that result must also be ignored.
    await act(async () => {
      pending.resolve(structuredClone(SAMPLE_RESPONSE));
    });
    expect(screen.queryByTestId("result-score")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Удалить M/ })).toHaveLength(
      4,
    );
  });

  it("ignores a late explanation even after the changed plan has its own result", async () => {
    const pending = deferred<Explanation>();
    explain.mockReturnValue(pending.promise);
    const user = await openApp();
    await loadSample(user);
    await user.click(
      screen.getByRole("button", { name: "Объяснить результат" }),
    );
    const oldSignal = explain.mock.calls[0][1]!;

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Изменить район M7" }),
      "esil",
    );
    expect(oldSignal.aborted).toBe(true);
    await screen.findByTestId("result-score");
    await act(async () => {
      pending.resolve({
        ...SAMPLE_EXPLANATION,
        summary: "Устаревшее объяснение предыдущего плана",
      });
    });
    expect(
      screen.queryByText("Устаревшее объяснение предыдущего плана"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Объяснить результат" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("combobox", { name: "Изменить район M7" }),
    ).toHaveValue("esil");
  });

  it("preserves all decisions after a simulation error and can retry the same plan", async () => {
    simulate.mockImplementation(async (decisions) => {
      if (decisions.length === 5) throw new Error("Сервер временно недоступен");
      return invalidPlan(decisions);
    });
    const user = await openApp();
    await user.click(screen.getByRole("button", { name: "Загрузить пример" }));
    expect(await screen.findByText("Сервер временно недоступен")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /^Удалить M/ })).toHaveLength(
      5,
    );
    expect(
      screen.getByRole("combobox", { name: "Изменить район M5" }),
    ).toHaveValue("saryarka");
    expect(screen.queryByTestId("result-score")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Ответ не получен. Ваш выбор сохранён — повторите расчёт.",
      ),
    ).toBeVisible();

    simulate.mockResolvedValue(structuredClone(SAMPLE_RESPONSE));
    await user.click(screen.getByRole("button", { name: "Рассчитать план" }));
    expect(await screen.findByTestId("result-score")).toHaveTextContent(
      "56,54",
    );
    expect(simulate).toHaveBeenLastCalledWith(
      SAMPLE_DECISIONS,
      expect.any(AbortSignal),
    );
    expect(
      screen.queryByText("Сервер временно недоступен"),
    ).not.toBeInTheDocument();
  });

  it("preserves the score and plan if explanation fails", async () => {
    explain.mockRejectedValue(new Error("AI не ответил вовремя."));
    const user = await openApp();
    await loadSample(user);
    await user.click(
      screen.getByRole("button", { name: "Объяснить результат" }),
    );
    expect(await screen.findByText(/AI не ответил вовремя/)).toBeVisible();
    expect(screen.getByTestId("result-score")).toHaveTextContent("56,54");
    expect(screen.getAllByRole("button", { name: /^Удалить M/ })).toHaveLength(
      5,
    );
    expect(
      screen.getByRole("button", { name: "Объяснить результат" }),
    ).toBeEnabled();
  });

  it("retries catalog errors and enters demo only after an explicit choice", async () => {
    catalog.mockRejectedValue(new Error("API недоступен"));
    const demoCatalog = vi
      .fn<AkimApi["catalog"]>()
      .mockResolvedValue(structuredClone(DEMO_CATALOG));
    vi.mocked(createApi).mockImplementation((mode) =>
      mode === "demo" ? { ...api, catalog: demoCatalog } : api,
    );
    const user = userEvent.setup();
    render(<App />);
    expect(
      await screen.findByRole("heading", {
        name: "Не удалось загрузить данные",
      }),
    ).toBeVisible();
    expect(createApi).toHaveBeenCalledWith("live");
    expect(createApi).not.toHaveBeenCalledWith("demo");

    await user.click(screen.getByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(catalog).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByRole("heading", {
        name: "Не удалось загрузить данные",
      }),
    ).toBeVisible();
    expect(demoCatalog).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Открыть демо" }));
    expect(await screen.findByText("Демонстрационный режим")).toBeVisible();
    expect(screen.getByText("Демо на эталонных данных.")).toBeVisible();
    await screen.findByRole("button", { name: "Загрузить пример" });
    expect(demoCatalog).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?demo=1");
  });

  it("applies a suggested improvement only after the user accepts it", async () => {
    catalog.mockResolvedValue({
      ...structuredClone(DEMO_CATALOG),
      features: { improve: true },
    });
    const proposal = SAMPLE_DECISIONS.map((decision) =>
      decision.measureId === "M5"
        ? { measureId: "M4", districtId: "saryarka" }
        : { ...decision },
    );
    improve.mockResolvedValue({
      improved: true,
      decisions: proposal,
      cost: 85,
      result: { ...structuredClone(SAMPLE_RESPONSE.result!), score: 60 },
      message: "Найдено улучшение одной заменой.",
    });
    const user = await openApp();
    await loadSample(user);
    await user.click(screen.getByRole("button", { name: "Улучшить план" }));
    await screen.findByRole("button", { name: "Применить предложение" });
    expect(
      screen.getByRole("button", { name: "Удалить M5" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Удалить M4" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("result-score")).toHaveTextContent("56,54");

    await user.click(
      screen.getByRole("button", { name: "Применить предложение" }),
    );
    expect(screen.queryByTestId("result-score")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Удалить M4" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Удалить M5" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(simulate).toHaveBeenLastCalledWith(
        proposal,
        expect.any(AbortSignal),
      ),
    );
  });
});
