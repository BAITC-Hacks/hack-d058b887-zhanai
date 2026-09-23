import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiMode,
  Catalog,
  Decision,
  Direction,
  Explanation,
  Improvement,
  SimulationResponse,
} from "./api/types";
import { createApi } from "./api/client";
import { SAMPLE_DECISIONS } from "./fixtures/demo";
import { Icon } from "./components/Icon";

const directions: { id: Direction; name: string; short: string }[] = [
  { id: "transport", name: "Транспорт", short: "Транспорт" },
  { id: "ecology", name: "Экология", short: "Экология" },
  { id: "social", name: "Социальная сфера", short: "Соцсфера" },
  { id: "safety", name: "Безопасность", short: "Безопасность" },
  { id: "services", name: "Городские сервисы", short: "Сервисы" },
];
const number = (value: number, digits = 2) =>
  value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Не удалось получить ответ. Попробуйте ещё раз.";
const isAbort = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";
const modeFromUrl = (): ApiMode =>
  new URLSearchParams(window.location.search).get("demo") === "1" ||
  import.meta.env.VITE_DEMO_MODE === "true"
    ? "demo"
    : "live";

export default function App() {
  const [mode, setMode] = useState<ApiMode>(modeFromUrl);
  const api = useMemo(() => createApi(mode), [mode]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [reload, setReload] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [districtChoices, setDistrictChoices] = useState<
    Record<string, string>
  >({});
  const [filter, setFilter] = useState<Direction | "all">("all");
  const [activeDistrict, setActiveDistrict] = useState("nura");
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [simulationError, setSimulationError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explainError, setExplainError] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [improvement, setImprovement] = useState<Improvement | null>(null);
  const [improveError, setImproveError] = useState("");
  const [improving, setImproving] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [notice, setNotice] = useState("");
  const generation = useRef(0);
  const calculationSequence = useRef(0);
  const controllers = useRef<AbortController[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function invalidate() {
    generation.current += 1;
    calculationSequence.current += 1;
    controllers.current.forEach((controller) => controller.abort());
    controllers.current = [];
    clearTimeout(timer.current);
    setSimulation(null);
    setSimulationError("");
    setCalculating(false);
    setExplanation(null);
    setExplainError("");
    setExplaining(false);
    setImprovement(null);
    setImproveError("");
    setImproving(false);
  }

  function changeDecisions(
    next: Decision[],
    text = "План изменён. Результат и объяснение обновятся после расчёта.",
  ) {
    invalidate();
    setDecisions(next);
    setNotice(text);
  }

  function switchMode(next: ApiMode) {
    invalidate();
    setDecisions([]);
    setCatalog(null);
    setMode(next);
    setNotice("");
    const url = new URL(window.location.href);
    if (next === "demo") url.searchParams.set("demo", "1");
    else url.searchParams.delete("demo");
    window.history.replaceState({}, "", url);
  }

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError("");
    setCatalog(null);
    api
      .catalog(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setCatalog(data);
        setActiveDistrict(
          data.districts.some((d) => d.id === "nura")
            ? "nura"
            : data.districts[0].id,
        );
      })
      .catch((error) => {
        if (!isAbort(error) && !controller.signal.aborted)
          setCatalogError(message(error));
      });
    return () => controller.abort();
  }, [api, reload]);

  async function calculate() {
    clearTimeout(timer.current);
    const version = generation.current;
    const sequence = ++calculationSequence.current;
    const controller = new AbortController();
    controllers.current.push(controller);
    setCalculating(true);
    setSimulationError("");
    try {
      const response = await api.simulate(decisions, controller.signal);
      if (
        version !== generation.current ||
        sequence !== calculationSequence.current
      )
        return;
      setSimulation(response);
      setNotice(
        response.valid
          ? "Расчёт готов. Можно посмотреть изменения районов и объяснение."
          : "Проверьте сообщения о выбранном плане.",
      );
    } catch (error) {
      if (
        version === generation.current &&
        sequence === calculationSequence.current &&
        !isAbort(error)
      )
        setSimulationError(message(error));
    } finally {
      controllers.current = controllers.current.filter(
        (item) => item !== controller,
      );
      if (
        version === generation.current &&
        sequence === calculationSequence.current
      )
        setCalculating(false);
    }
  }

  useEffect(() => {
    if (catalog)
      timer.current = setTimeout(() => {
        void calculate();
      }, 300);
    return () => clearTimeout(timer.current);
    // Each decision change clears previous results synchronously in changeDecisions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions, catalog, api]);

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
    },
    [],
  );

  async function explain() {
    const version = generation.current;
    const controller = new AbortController();
    controllers.current.push(controller);
    setExplaining(true);
    setExplainError("");
    try {
      const response = await api.explain(decisions, controller.signal);
      if (version === generation.current) setExplanation(response);
    } catch (error) {
      if (version === generation.current && !isAbort(error))
        setExplainError(message(error));
    } finally {
      controllers.current = controllers.current.filter(
        (item) => item !== controller,
      );
      if (version === generation.current) setExplaining(false);
    }
  }

  async function improve() {
    const version = generation.current;
    const controller = new AbortController();
    controllers.current.push(controller);
    setImproving(true);
    setImproveError("");
    try {
      const response = await api.improve(decisions, controller.signal);
      if (version === generation.current) setImprovement(response);
    } catch (error) {
      if (version === generation.current && !isAbort(error))
        setImproveError(message(error));
    } finally {
      controllers.current = controllers.current.filter(
        (item) => item !== controller,
      );
      if (version === generation.current) setImproving(false);
    }
  }

  const result = simulation?.valid ? simulation.result : null;
  const currentDistrict = catalog?.districts.find(
    (d) => d.id === activeDistrict,
  );
  const districtResult = result?.districts.find(
    (d) => d.districtId === activeDistrict,
  );
  const estimatedCost = decisions.reduce(
    (sum, decision) =>
      sum +
      (catalog?.measures.find((m) => m.id === decision.measureId)?.cost || 0),
    0,
  );
  const cost = simulation?.cost ?? estimatedCost;
  const budget = catalog?.budget ?? 100;
  const remaining = simulation?.remainingBudget ?? budget - cost;
  const ruleset = simulation?.ruleset ?? catalog?.ruleset;
  const rulesetName =
    ruleset === "all_directions"
      ? "Все 5 направлений"
      : ruleset === "dataset"
        ? "Правила датасета"
        : ruleset || "Загрузка правил";
  const districtName = (id: string | null) =>
    id ? catalog?.districts.find((d) => d.id === id)?.name || id : "Весь город";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Перейти к симулятору
      </a>
      <aside className="sidebar">
        <a className="brand" href="#main">
          <span className="brand-mark">
            <Icon name="city" size={27} />
          </span>
          <span>
            АКИМ<span className="brand-sub">НА 5 ЧАСОВ</span>
          </span>
        </a>
        <div className="sidebar-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          <a className="nav-link active" href="#main">
            <Icon name="grid" />
            Симулятор
            <span className="nav-dot" />
          </a>
          <a className="nav-link" href="#districts">
            <Icon name="city" />
            Районы города
          </a>
          <a className="nav-link" href="#results">
            <Icon name="chart" />
            Результат плана
          </a>
          <button className="nav-link" onClick={() => setShowRules(true)}>
            <Icon name="book" />
            Как это работает
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="small-cap">ВАША ЗАДАЧА</span>
          <p>
            Пять решений.
            <br />
            Один город.
            <br />
            <strong>Общий результат.</strong>
          </p>
          <span className="note-line" />
          <small>
            Распределите бюджет так, чтобы изменения почувствовал каждый район.
          </small>
        </div>
        <div className="sidebar-bottom">
          <span className="location-dot" />
          <span>
            Астана, Казахстан<small>Модель городских решений</small>
          </span>
        </div>
      </aside>

      <main id="main" className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            Городская лаборатория <span>/</span> <strong>Симулятор</strong>
          </span>
          <div className="topbar-meta">
            <span className={`connection ${mode}`}>
              <i />
              {mode === "demo" ? "Демонстрационный режим" : "Подключение к API"}
            </span>
            <button
              className="avatar"
              onClick={() => setShowRules(true)}
              aria-label="Открыть правила симулятора"
            >
              А
            </button>
          </div>
        </header>
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span />
              АСТАНА · ПЯТЬ РАЙОНОВ · ВАШИ РЕШЕНИЯ
            </div>
            <h1>Каким будет ваш город?</h1>
            <p>
              Выберите пять инициатив и узнайте, как они изменят
              <br className="desktop-break" /> качество жизни в районах Астаны.
            </p>
            <div className="hero-tags">
              <span>
                <Icon name="clock" size={14} />
                Горизонт: 2 условных года
              </span>
              <span>
                <Icon name="info" size={14} />
                Условный синтетический датасет
              </span>
            </div>
          </div>
          <svg
            className="skyline"
            viewBox="0 0 330 160"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 146h319M17 145V91h34v54m-25-45h5m8 0h5m-18 12h5m8 0h5m-18 12h5m8 0h5M63 145V71h29v74M68 71V58h19v13M72 81h10m-10 12h10m-10 12h10m-10 12h10m-10 12h10M112 145l17-64h14l17 64M122 111h28M119 123h34M136 81V52"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle
              cx="136"
              cy="39"
              r="16"
              fill="#d7debd"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M130 24c-8 13-8 23 0 30m12-30c8 13 8 23 0 30M120 39h32M178 145V65h35v80m-35-80 18-29 17 29m-25 10v56m14-56v56M224 145V95h38v50m-29-39h20m-20 12h20m-20 12h20M274 145V81h25v64m-21-64 8-20 8 20M8 146c21-10 31-7 45 0m173 0c38-18 51-18 86 0"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="240" cy="36" r="19" fill="#e2e8d9" />
            <path
              d="m296 32 5-4 5 4m-87 23 4-3 4 3"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </section>

        {mode === "demo" && (
          <div className="demo-banner">
            <Icon name="info" size={19} />
            <span>
              <strong>Демо на эталонных данных.</strong> Для просмотра
              результата загрузите пример. Произвольные планы рассчитывает
              сервер.
            </span>
            <button onClick={() => switchMode("live")}>
              Подключить API <Icon name="arrow" size={15} />
            </button>
          </div>
        )}

        {!catalog && !catalogError && (
          <div className="loading-panel" role="status">
            <span className="spinner" />
            Загружаем районы и каталог мероприятий…
          </div>
        )}
        {catalogError && (
          <section className="error-panel" role="alert">
            <Icon name="info" size={28} />
            <h2>Не удалось загрузить данные</h2>
            <p>{catalogError}</p>
            <div className="button-row">
              <button
                className="button primary"
                onClick={() => {
                  invalidate();
                  setReload((value) => value + 1);
                }}
              >
                Повторить
              </button>
              <button
                className="button secondary"
                onClick={() => switchMode("demo")}
              >
                Открыть демо
              </button>
            </div>
            <small>Выбранный режим не переключается автоматически.</small>
          </section>
        )}

        {catalog && (
          <>
            <section className="budget-strip" aria-label="Бюджет и правила">
              <div className="budget-total">
                <span className="stat-label">ОБЩИЙ БЮДЖЕТ</span>
                <div>
                  <strong>{budget}</strong>
                  <span>ед.</span>
                </div>
              </div>
              <div className="budget-progress">
                <div>
                  <span>
                    Использовано <strong>{cost}</strong>
                  </span>
                  <span className={remaining < 0 ? "negative" : ""}>
                    Осталось <strong>{remaining}</strong>
                  </span>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${Math.min(100, (cost / budget) * 100)}%`,
                    }}
                    className={remaining < 0 ? "over-budget" : ""}
                  />
                </div>
              </div>
              <div className="budget-selected">
                <span className="stat-label">ВЫБРАНО РЕШЕНИЙ</span>
                <strong>
                  {decisions.length}
                  <small> / 5</small>
                </strong>
              </div>
              <div className="ruleset">
                <Icon name="safety" size={19} />
                <span>
                  {rulesetName}
                  <small>Максимум 2 меры из направления</small>
                </span>
                <button
                  className="icon-button"
                  onClick={() => setShowRules(true)}
                  aria-label="Подробнее о правилах"
                >
                  <Icon name="info" size={17} />
                </button>
              </div>
            </section>

            <section id="districts" className="districts-section">
              <div className="section-heading">
                <div>
                  <span className="section-number">01</span>
                  <h2>Пульс города</h2>
                  <span className="section-hint">
                    Выберите район, чтобы увидеть показатели
                  </span>
                </div>
                <span className="text-badge">5 районов</span>
              </div>
              <div className="district-grid">
                {catalog.districts.map((district) => {
                  const after = result?.districts.find(
                    (item) => item.districtId === district.id,
                  );
                  const current = after?.afterIndicators ?? district.indicators;
                  const weak = Object.entries(current)
                    .sort((a, b) => a[1] - b[1])
                    .slice(0, 2);
                  const critical = Object.values(current).filter(
                    (value) => value < 40,
                  ).length;
                  return (
                    <button
                      key={district.id}
                      className={`district-card ${activeDistrict === district.id ? "selected" : ""}`}
                      aria-pressed={activeDistrict === district.id}
                      onClick={() => setActiveDistrict(district.id)}
                    >
                      <div className="district-top">
                        <span>{district.name}</span>
                        <Icon name="arrow" size={16} />
                      </div>
                      <div className="district-score">
                        {number(after?.afterScore ?? district.score)}
                        <small>/ 100</small>
                      </div>
                      <div className="district-bar">
                        <span
                          style={{
                            width: `${after?.afterScore ?? district.score}%`,
                          }}
                        />
                      </div>
                      <div className="district-foot">
                        {after ? (
                          <span className="positive">
                            {signed(after.afterScore - after.beforeScore)} к
                            исходному
                          </span>
                        ) : (
                          <span>
                            {number(district.population * 100, 0)}% населения
                          </span>
                        )}
                        {critical > 0 && (
                          <span
                            className="critical-dot"
                            title={`${critical} критических показателя`}
                          />
                        )}
                      </div>
                      <p>
                        {critical > 0
                          ? `${critical} показателя ниже 40`
                          : weak
                              .map(
                                ([code]) =>
                                  catalog.indicators.find(
                                    (item) => item.id === code,
                                  )?.name || code,
                              )
                              .join(" · ")}
                      </p>
                    </button>
                  );
                })}
              </div>
              {currentDistrict && (
                <details className="district-details" key={activeDistrict}>
                  <summary>
                    <span>
                      <Icon name="chart" size={17} />
                      <strong>{currentDistrict.name}:</strong> все 10
                      показателей
                    </span>
                    <span className="details-hint">Развернуть</span>
                  </summary>
                  <p>{currentDistrict.description}</p>
                  <div className="indicator-legend">
                    <span>
                      <i className="before-dot" />
                      Исходное значение
                    </span>
                    {districtResult && (
                      <span>
                        <i className="after-dot" />
                        После решений
                      </span>
                    )}
                    <span>Чем выше, тем лучше</span>
                  </div>
                  <div className="indicator-grid">
                    {catalog.indicators.map((indicator) => {
                      const before = currentDistrict.indicators[indicator.id];
                      const after =
                        districtResult?.afterIndicators[indicator.id];
                      return (
                        <div className="indicator-row" key={indicator.id}>
                          <div>
                            <span>{indicator.name}</span>
                            <strong>
                              {number(before)}
                              {after !== undefined && <> → {number(after)}</>}
                              {(after ?? before) < 40 && <em>Критический</em>}
                            </strong>
                          </div>
                          <div className="indicator-track">
                            <span
                              className="indicator-before"
                              style={{ width: `${before}%` }}
                            />
                            {after !== undefined && (
                              <span
                                className="indicator-after"
                                style={{ width: `${after}%` }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </section>

            <div className="planning-grid">
              <section className="catalog-section">
                <div className="section-heading">
                  <div>
                    <span className="section-number">02</span>
                    <h2>Выберите инициативы</h2>
                  </div>
                  <span className="section-hint">
                    14 возможностей изменить город
                  </span>
                </div>
                <div
                  className="filter-tabs"
                  role="group"
                  aria-label="Фильтр по направлению"
                >
                  <button
                    className={filter === "all" ? "chosen" : ""}
                    aria-pressed={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    Все <span>{catalog.measures.length}</span>
                  </button>
                  {directions.map((direction) => (
                    <button
                      key={direction.id}
                      className={filter === direction.id ? "chosen" : ""}
                      aria-pressed={filter === direction.id}
                      onClick={() => setFilter(direction.id)}
                    >
                      <Icon name={direction.id} size={15} />
                      {direction.short}
                    </button>
                  ))}
                </div>
                <div className="measure-grid">
                  {catalog.measures
                    .filter(
                      (measure) =>
                        filter === "all" || measure.direction === filter,
                    )
                    .map((measure) => {
                      const selected = decisions.some(
                        (decision) => decision.measureId === measure.id,
                      );
                      const needsDistrict = measure.scope === "district";
                      const choice = districtChoices[measure.id] || "";
                      return (
                        <article
                          key={measure.id}
                          className={`measure-card direction-${measure.direction} ${selected ? "is-selected" : ""}`}
                        >
                          <div className="measure-top">
                            <span className="measure-icon">
                              <Icon name={measure.direction} size={21} />
                            </span>
                            <span className="direction-label">
                              {
                                directions.find(
                                  (item) => item.id === measure.direction,
                                )?.short
                              }
                            </span>
                            <span className="measure-id">{measure.id}</span>
                            <strong className="price">
                              {measure.cost}
                              <small>ед.</small>
                            </strong>
                          </div>
                          <h3>{measure.name}</h3>
                          <div className="measure-meta">
                            <span>
                              <Icon name="pin" size={13} />
                              {needsDistrict ? "Один район" : "Весь город"}
                            </span>
                            <span>
                              <Icon name="clock" size={13} />
                              Лаг {measure.lag} кв.
                            </span>
                          </div>
                          <div className="effect-list">
                            {Object.entries(measure.effects).map(
                              ([code, value]) => (
                                <span
                                  key={code}
                                  className={value < 0 ? "negative-effect" : ""}
                                  title={
                                    catalog.indicators.find(
                                      (item) => item.id === code,
                                    )?.name
                                  }
                                >
                                  {code}{" "}
                                  <b>
                                    {value > 0 ? "+" : ""}
                                    {value}
                                  </b>
                                </span>
                              ),
                            )}
                          </div>
                          <span className="effect-caption">
                            Полный эффект, до учёта лага
                          </span>
                          <div className="measure-actions">
                            {needsDistrict ? (
                              <select
                                aria-label={`Район для ${measure.id}`}
                                value={
                                  selected
                                    ? (decisions.find(
                                        (item) => item.measureId === measure.id,
                                      )?.districtId ?? "")
                                    : choice
                                }
                                onChange={(event) =>
                                  setDistrictChoices((current) => ({
                                    ...current,
                                    [measure.id]: event.target.value,
                                  }))
                                }
                                disabled={selected}
                              >
                                <option value="">Выберите район</option>
                                {catalog.districts.map((district) => (
                                  <option key={district.id} value={district.id}>
                                    {district.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="city-scope">
                                <Icon name="city" size={16} />
                                Во всех 5 районах
                              </span>
                            )}
                            <button
                              className={`add-button ${selected ? "added" : ""}`}
                              disabled={
                                selected ||
                                decisions.length >= 5 ||
                                (needsDistrict && !choice)
                              }
                              aria-label={
                                selected
                                  ? `${measure.id} уже в плане`
                                  : `Добавить ${measure.id}: ${measure.name}`
                              }
                              onClick={() =>
                                changeDecisions([
                                  ...decisions,
                                  {
                                    measureId: measure.id,
                                    districtId: needsDistrict ? choice : null,
                                  },
                                ])
                              }
                            >
                              <Icon
                                name={selected ? "check" : "plus"}
                                size={17}
                              />
                              {selected ? "В плане" : "Добавить"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                </div>
              </section>

              <aside className="plan-panel" aria-label="Ваш план">
                <div className="plan-heading">
                  <div>
                    <Icon name="book" size={20} />
                    <h2>Ваш план</h2>
                  </div>
                  <span>{decisions.length} / 5</span>
                </div>
                <p className="plan-subtitle">Каждое решение имеет значение</p>
                <div className="plan-slots">
                  {Array.from({ length: 5 }, (_, index) => {
                    const decision = decisions[index];
                    const measure = catalog.measures.find(
                      (item) => item.id === decision?.measureId,
                    );
                    return decision && measure ? (
                      <div className="plan-item" key={decision.measureId}>
                        <span
                          className={`slot-number filled direction-${measure.direction}`}
                        >
                          {index + 1}
                        </span>
                        <div className="plan-item-body">
                          <strong>{measure.name}</strong>
                          {measure.scope === "district" ? (
                            <select
                              aria-label={`Изменить район ${measure.id}`}
                              value={decision.districtId ?? ""}
                              onChange={(event) =>
                                changeDecisions(
                                  decisions.map((item) =>
                                    item.measureId === measure.id
                                      ? {
                                          ...item,
                                          districtId: event.target.value,
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              {catalog.districts.map((district) => (
                                <option key={district.id} value={district.id}>
                                  {district.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <small>Весь город</small>
                          )}
                        </div>
                        <div className="plan-item-end">
                          <span>{measure.cost}</span>
                          <button
                            className="icon-button"
                            aria-label={`Удалить ${measure.id}`}
                            onClick={() =>
                              changeDecisions(
                                decisions.filter(
                                  (item) => item.measureId !== measure.id,
                                ),
                              )
                            }
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-slot" key={`empty-${index}`}>
                        <span className="slot-number">{index + 1}</span>
                        <span>Добавьте инициативу</span>
                        <Icon name="plus" size={14} />
                      </div>
                    );
                  })}
                </div>
                <div className="coverage">
                  <span className="stat-label">ОХВАТ НАПРАВЛЕНИЙ</span>
                  <div>
                    {directions.map((direction) => {
                      const count = decisions.filter(
                        (decision) =>
                          catalog.measures.find(
                            (measure) => measure.id === decision.measureId,
                          )?.direction === direction.id,
                      ).length;
                      return (
                        <span
                          key={direction.id}
                          className={`coverage-item ${count > 0 ? "covered" : ""} ${count > 2 ? "coverage-error" : ""}`}
                          title={`${direction.name}: ${count}`}
                          aria-label={`${direction.name}: ${count} мер`}
                        >
                          <Icon name={direction.id} size={17} />
                          <small>{count}</small>
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="plan-total">
                  <span>Стоимость плана</span>
                  <strong className={remaining < 0 ? "negative" : ""}>
                    {cost}
                    <small> / {budget}</small>
                  </strong>
                </div>
                {remaining < 0 && (
                  <p className="inline-error" role="alert">
                    Бюджет превышен на {Math.abs(remaining)} ед. Замените или
                    удалите меру.
                  </p>
                )}
                {simulation && !simulation.valid && decisions.length > 0 && (
                  <ul className="validation-errors" aria-label="Ошибки плана">
                    {simulation.errors.map((error, index) => (
                      <li key={`${error.code}-${index}`}>{error.message}</li>
                    ))}
                  </ul>
                )}
                {simulationError && (
                  <p className="inline-error" role="alert">
                    {simulationError}
                  </p>
                )}
                <button
                  className="button primary calculate-button"
                  disabled={decisions.length !== 5 || calculating}
                  onClick={() => void calculate()}
                >
                  {calculating ? (
                    <>
                      <span className="spinner" />
                      Проверяем план…
                    </>
                  ) : (
                    <>
                      Рассчитать план
                      <Icon name="arrow" size={18} />
                    </>
                  )}
                </button>
                <div className="plan-tools">
                  <button
                    onClick={() =>
                      changeDecisions(
                        SAMPLE_DECISIONS.map((item) => ({ ...item })),
                        "Загружен контрольный пример из датасета.",
                      )
                    }
                  >
                    <Icon name="sparkle" size={14} />
                    Загрузить пример
                  </button>
                  <button
                    disabled={!decisions.length}
                    onClick={() =>
                      changeDecisions(
                        [],
                        "План очищен. Выберите новые инициативы.",
                      )
                    }
                  >
                    <Icon name="reset" size={14} />
                    Сбросить
                  </button>
                </div>
                <p className="plan-footnote">
                  <Icon name="safety" size={14} />
                  {mode === "demo"
                    ? "Эталонный ответ · без подключения к серверу"
                    : "Допустимость и Score проверяет сервер"}
                </p>
              </aside>
            </div>

            <section id="results" className="results-section">
              <div className="section-heading">
                <div>
                  <span className="section-number">03</span>
                  <h2>Что изменится в городе</h2>
                </div>
                <span className="text-badge">Astana Quality of Life Score</span>
              </div>
              {!result ? (
                <div className="result-placeholder">
                  <span className="result-placeholder-icon">
                    <Icon name="chart" size={30} />
                  </span>
                  <div>
                    <h3>
                      {calculating
                        ? "Считаем последствия ваших решений"
                        : decisions.length < 5
                          ? "Большие изменения начинаются с пяти решений"
                          : "Результат появится после проверки плана"}
                    </h3>
                    <p>
                      {simulationError
                        ? "Ответ не получен. Ваш выбор сохранён — повторите расчёт."
                        : "Здесь появятся оценка города, изменения по районам и объяснение результата."}
                    </p>
                  </div>
                  <span className="placeholder-count">
                    {decisions.length}
                    <small> / 5</small>
                  </span>
                </div>
              ) : (
                <>
                  <div className="results-grid">
                    <div className="score-card">
                      <span className="small-cap">КАЧЕСТВО ЖИЗНИ ГОРОДА</span>
                      <div className="final-score" data-testid="result-score">
                        {number(result.score)}
                        <span>/100</span>
                      </div>
                      <div
                        className={`score-delta ${result.delta < 0 ? "negative" : ""}`}
                      >
                        {signed(result.delta)} балла к исходному
                      </div>
                      <div className="score-baseline">
                        До решений{" "}
                        <strong>{number(simulation!.baseline.score)}</strong>
                        <span>→</span>После{" "}
                        <strong>{number(result.score)}</strong>
                      </div>
                      {mode === "demo" && (
                        <small className="fixture-label">
                          Эталонный результат из датасета
                        </small>
                      )}
                    </div>
                    <div className="outcomes">
                      <div>
                        <span>Средняя оценка города</span>
                        <strong>{number(result.cityAverage)}</strong>
                        <small>С учётом доли населения</small>
                      </div>
                      <div>
                        <span>Оценка худшего района</span>
                        <strong>{number(result.minDistrictScore)}</strong>
                        <small>Сбалансированность развития</small>
                      </div>
                      <div>
                        <span>Критические показатели</span>
                        <strong
                          className={
                            result.criticalCount > 0 ? "negative" : "positive"
                          }
                        >
                          {simulation!.baseline.criticalCount}
                          <span> → </span>
                          {result.criticalCount}
                        </strong>
                        <small>Значения строго ниже 40</small>
                      </div>
                    </div>
                  </div>
                  <div className="result-details-grid">
                    <div className="comparison-panel">
                      <h3>Изменения по районам</h3>
                      <table>
                        <thead>
                          <tr>
                            <th>Район</th>
                            <th>До</th>
                            <th>После</th>
                            <th>Изменение</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.districts.map((district) => (
                            <tr key={district.districtId}>
                              <th>{districtName(district.districtId)}</th>
                              <td>{number(district.beforeScore)}</td>
                              <td>{number(district.afterScore)}</td>
                              <td
                                className={
                                  district.afterScore < district.beforeScore
                                    ? "negative"
                                    : "positive"
                                }
                              >
                                {signed(
                                  district.afterScore - district.beforeScore,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="synergies-panel">
                      <h3>
                        <Icon name="sparkle" size={18} />
                        Совместный эффект
                      </h3>
                      {result.synergies.length ? (
                        result.synergies.map((synergy, index) => (
                          <div className="synergy" key={index}>
                            <span className="synergy-pair">
                              {synergy.measureIds.join(" + ")}
                            </span>
                            <strong>
                              +{synergy.bonus} {synergy.indicator}
                            </strong>
                            <p>
                              {districtName(synergy.districtId)} · фиксированный
                              бонус
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          В этом плане синергии не сработали.
                        </p>
                      )}
                      {result.missedSynergies?.length ? (
                        <>
                          <h4>Возможности для плана</h4>
                          <ul>
                            {result.missedSynergies.map((fact, index) => (
                              <li key={index}>{fact}</li>
                            ))}
                          </ul>
                        </>
                      ) : null}
                      <p className="synergy-note">
                        Бонусы уже учтены в результате. Их нельзя складывать с
                        общим Score.
                      </p>
                    </div>
                  </div>
                  <section className="ai-panel">
                    <div className="ai-heading">
                      <div>
                        <span className="ai-icon">
                          <Icon name="sparkle" size={23} />
                        </span>
                        <div>
                          <h3>За цифрами — решения</h3>
                          <p>
                            Сильные стороны, риски и последствия вашего плана
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-badge ${explanation?.status === "ai" ? "positive" : ""}`}
                      >
                        {explanation
                          ? explanation.status === "ai"
                            ? "AI-анализ"
                            : "Без AI · по фактам"
                          : "Анализ плана"}
                      </span>
                    </div>
                    {explanation ? (
                      <>
                        <p className="ai-summary">{explanation.summary}</p>
                        <div className="ai-columns">
                          {[
                            {
                              title: "Сильные стороны",
                              items: explanation.strengths,
                            },
                            { title: "Риски", items: explanation.risks },
                            {
                              title: "Последствия",
                              items: explanation.consequences,
                            },
                          ].map((block) => (
                            <div key={block.title}>
                              <h4>{block.title}</h4>
                              <ul>
                                {block.items.length ? (
                                  block.items.map((item, index) => (
                                    <li key={index}>{item}</li>
                                  ))
                                ) : (
                                  <li>Нет дополнительных замечаний.</li>
                                )}
                              </ul>
                            </div>
                          ))}
                        </div>
                        {explanation.recommendations.length > 0 && (
                          <div className="recommendations">
                            <h4>На что обратить внимание</h4>
                            <ul>
                              {explanation.recommendations.map(
                                (item, index) => (
                                  <li key={index}>{item}</li>
                                ),
                              )}
                            </ul>
                          </div>
                        )}
                        <div className="ai-meta">
                          {explanation.status === "ai"
                            ? `Модель: ${explanation.model || "указана сервером"}`
                            : "Пояснение сформировано без обращения к AI."}
                          {explanation.grounded && (
                            <span>Числа сверены с фактами</span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="ai-empty">
                        <p>
                          {mode === "demo"
                            ? "Посмотрите шаблонное объяснение эталонного результата. Оно явно обозначено как сформированное без AI."
                            : "Получите объяснение на основе рассчитанных показателей. Модель объясняет результат, а числа вычисляет сервер."}
                        </p>
                        <button
                          className="button primary"
                          disabled={explaining}
                          onClick={() => void explain()}
                        >
                          {explaining ? (
                            <>
                              <span className="spinner" />
                              Готовим объяснение…
                            </>
                          ) : (
                            <>
                              <Icon name="sparkle" size={17} />
                              Объяснить результат
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    {explainError && (
                      <p className="inline-error" role="alert">
                        {explainError} Расчёт и выбранный план сохранены.
                      </p>
                    )}
                  </section>
                  {catalog.features?.improve && (
                    <section className="improve-panel">
                      <div className="section-heading">
                        <h3>Можно ли улучшить план?</h3>
                        <button
                          className="button secondary"
                          onClick={() => void improve()}
                          disabled={improving}
                        >
                          {improving ? "Ищем улучшение…" : "Улучшить план"}
                        </button>
                      </div>
                      {improveError && (
                        <p className="inline-error" role="alert">
                          {improveError}
                        </p>
                      )}
                      {improvement && (
                        <>
                          <p>{improvement.message}</p>
                          {improvement.percentile !== undefined && (
                            <p>
                              План лучше {number(improvement.percentile, 1)}%
                              {improvement.totalPlans !== undefined
                                ? ` из ${number(improvement.totalPlans, 0)} допустимых планов`
                                : " допустимых планов"}
                              .
                            </p>
                          )}
                          {improvement.optimalScore !== undefined && (
                            <p>
                              Расстояние до оптимума:{" "}
                              {number(improvement.optimalScore - result.score)}{" "}
                              балла.
                            </p>
                          )}
                          {improvement.improved &&
                            improvement.result &&
                            improvement.decisions && (
                              <>
                                <div className="improve-comparison">
                                  <div>
                                    <span>Ваш план</span>
                                    <strong>{number(result.score)}</strong>
                                    <small>
                                      {cost} ед. · критических:{" "}
                                      {result.criticalCount}
                                    </small>
                                  </div>
                                  <Icon name="arrow" />
                                  <div>
                                    <span>Предложение</span>
                                    <strong>
                                      {number(improvement.result.score)}
                                    </strong>
                                    <small>
                                      {improvement.cost} ед. · критических:{" "}
                                      {improvement.result.criticalCount}
                                    </small>
                                  </div>
                                </div>
                                <ul>
                                  {decisions
                                    .filter(
                                      (before) =>
                                        !improvement.decisions!.some(
                                          (after) =>
                                            after.measureId ===
                                              before.measureId &&
                                            after.districtId ===
                                              before.districtId,
                                        ),
                                    )
                                    .map((item) => (
                                      <li key={`remove-${item.measureId}`}>
                                        Убрать:{" "}
                                        {
                                          catalog.measures.find(
                                            (m) => m.id === item.measureId,
                                          )?.name
                                        }{" "}
                                        · {districtName(item.districtId)}
                                      </li>
                                    ))}
                                  {improvement.decisions
                                    .filter(
                                      (after) =>
                                        !decisions.some(
                                          (before) =>
                                            after.measureId ===
                                              before.measureId &&
                                            after.districtId ===
                                              before.districtId,
                                        ),
                                    )
                                    .map((item) => (
                                      <li key={`add-${item.measureId}`}>
                                        Добавить:{" "}
                                        {
                                          catalog.measures.find(
                                            (m) => m.id === item.measureId,
                                          )?.name
                                        }{" "}
                                        · {districtName(item.districtId)}
                                      </li>
                                    ))}
                                </ul>
                                <button
                                  className="button primary"
                                  onClick={() =>
                                    changeDecisions(
                                      improvement.decisions!.map((item) => ({
                                        ...item,
                                      })),
                                      "Предложение применено. Пересчитываем ваш план.",
                                    )
                                  }
                                >
                                  Применить предложение
                                </button>
                              </>
                            )}
                          {!improvement.improved && (
                            <p>Улучшение одной заменой не найдено.</p>
                          )}
                        </>
                      )}
                    </section>
                  )}
                </>
              )}
            </section>
          </>
        )}
        <footer className="footer">
          <span>
            <Icon name="city" size={17} />
            Аким на 5 часов
          </span>
          <p>Результаты условной модели, а не прогноз для реальной Астаны.</p>
          <button onClick={() => setShowRules(true)}>
            Правила и методика <Icon name="arrow" size={14} />
          </button>
        </footer>
        <div className="sr-only" aria-live="polite" role="status">
          {notice}
        </div>
      </main>
      {showRules && (
        <RulesDialog
          rulesetName={rulesetName}
          close={() => setShowRules(false)}
        />
      )}
    </div>
  );
}

function RulesDialog({
  close,
  rulesetName,
}: {
  close: () => void;
  rulesetName: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      className="rules-dialog"
      ref={ref}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      aria-labelledby="rules-title"
    >
      <div className="rules-dialog-inner">
        <button
          className="icon-button dialog-close"
          onClick={close}
          aria-label="Закрыть правила"
        >
          <Icon name="close" />
        </button>
        <span className="eyebrow">КАК ЭТО РАБОТАЕТ</span>
        <h2 id="rules-title">Пять решений для города</h2>
        <p>
          Активный режим: <strong>{rulesetName}</strong>. Исходные условия
          одинаковы для всех пользователей.
        </p>
        <ol>
          <li>
            Выберите ровно пять разных мероприятий в пределах бюджета 100
            единиц.
          </li>
          <li>
            Для районной меры укажите один район. Городская действует во всех
            районах.
          </li>
          <li>
            Допускается максимум две меры одного направления.
            {rulesetName === "Все 5 направлений" &&
              " В этом режиме нужно охватить все пять направлений."}
          </li>
          <li>
            M1 и M3 несовместимы. M4 и M7, а также M5 и M13 нельзя сочетать в
            одном районе.
          </li>
        </ol>
        <h3>Как получается Score</h3>
        <p>
          70% средневзвешенной оценки города + 30% оценки худшего района − число
          показателей ниже 40.
        </p>
        <p>
          Эффекты мер учитывают задержку: (8 − лаг) / 8. Синергии добавляются
          полностью. Показатели ограничены диапазоном 0–100; больше означает
          лучше.
        </p>
        <h3>Что делает AI</h3>
        <p>
          Объясняет рассчитанные последствия и компромиссы. Цены, эффекты и
          итоговую оценку определяет сервер. Шаблонное объяснение всегда
          помечается «Без AI».
        </p>
        <button className="button primary" onClick={close}>
          Перейти к решениям
          <Icon name="arrow" size={17} />
        </button>
      </div>
    </dialog>
  );
}
