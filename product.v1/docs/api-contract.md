# API «Аким на 5 часов»

Сервер: `http://127.0.0.1:8000`. Все пути API начинаются с `/api`. Интерактивная документация FastAPI: `http://127.0.0.1:8000/docs`. Данные синтетические, это не актуальная статистика Астаны.

Все пути ниже — относительно папки `product.v1/` (корень продукта).

## Запуск

```bash
./scripts/setup.sh   # .venv (Python ≥ 3.10) + backend/requirements.txt + npm ci в frontend/
./scripts/start.sh   # собирает frontend/dist (если нет) и запускает UI + API на http://127.0.0.1:8000
./scripts/dev.sh     # uvicorn --reload на :8000 + Vite на :5173 (прокси /api → :8000)
./scripts/test.sh    # pytest + typecheck + build
```

Вручную: `PYTHONPATH=backend .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000`. Тесты сервера: `PYTHONPATH=backend .venv/bin/python -m pytest backend/tests -q`.

**Интерфейс на том же порту.** Если существует `frontend/dist/index.html` (или папка из `FRONTEND_DIST`), сервер отдаёт `/assets/*` и SPA на все пути, кроме `/api/*`. Неизвестный `/api/...` возвращает 404, а не `index.html`. Без сборки сервер работает как чистый API.

**Настройки** читаются из переменных окружения и файла `.env` в корне продукта (`product.v1/.env`, исключён из Git; шаблон — `.env.example`):

| Переменная | По умолчанию | Назначение |
| --- | --- | --- |
| `OPENAI_API_KEY` | пусто | Ключ OpenAI. Без него `/api/explain` отдаёт шаблонное объяснение `status: "fallback_no_ai"`. |
| `AI_MODEL` | `gpt-6-sol` | Модель для OpenAI Responses API. |
| `RULESET` | `dataset` | `dataset` или `all_directions` (дополнительно требуются все пять направлений). Задаётся при запуске сервера, не клиентом. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Разрешённые источники CORS. |
| `FRONTEND_DIST` | `frontend/dist` | Где искать собранный интерфейс. |

## Сводка

| Метод и путь | Назначение |
| --- | --- |
| `GET /api/health` | Состояние сервера, режим правил, наличие ключа, модель. |
| `GET /api/catalog` | Районы, меры, правила, базовая линия, события. |
| `POST /api/simulate` | Проверка и расчёт плана: `result` для допустимого, `preview` для незавершённого. |
| `POST /api/explain` | AI-объяснение рассчитанного плана с проверкой чисел или честный шаблон «без AI». |
| `POST /api/improve` | Полный перебор: процентиль, глобальный оптимум, лучшая замена одной меры, дополнение неполного плана. |
| `GET /api/events` | Список событий. |
| `POST /api/events/draw` | Случайное событие (детерминированно при `seed`, без повтора при `excludeId`). |
| `POST /api/leaderboard` / `GET /api/leaderboard` | Запись и таблица команд (локальный SQLite). |
| `POST /api/presentation` | Краткая Markdown-презентация плана. |

## `GET /api/health`

```json
{"status": "ok", "ruleset": "dataset", "dataVersion": "akim-dataset-v1", "aiConfigured": false, "aiModel": "gpt-6-sol"}
```

`aiConfigured` — задан ли `OPENAI_API_KEY` на сервере (сам ключ никогда не возвращается). `aiModel` — значение `AI_MODEL`.

## `GET /api/catalog`

`{districts, measures, rules, ruleset, dataVersion, baseline, events, syntheticData: true}`.

- `measures[]`: `id` (`M1`…`M14`), `name`, `direction` (`transport`, `ecology`, `social`, `safety`, `services`), `scope` (`district` или `city`), `cost`, `lag` (кварталы), `effects` (`{T1: 6, …}`).
- `districts[]`: `id` (`esil`, `almaty`, `saryarka`, `baikonur`, `nura`), `name`, `populationShare`, `profile`, `indicators` (10 показателей `T1 T2 E1 E2 S1 S2 B1 B2 C1 C2`, шкала 0–100).
- `rules`: `budget` (100), `decisionCount` (5), `horizonQuarters` (8), `maxPerDirection` (2), `indicatorWeights`, `indicatorNames`, `directionNames`, `synergies`, `incompatibilities`, `dataVersion`.
- `baseline`: `score`, `cityAverage`, `minDistrictScore`, `minDistrictId`, `criticalCount`, `districts[]` (`districtId`, `name`, `score`, `indicators`).
- `events[]`: `id`, `name`, `description`, `indicatorChanges[]` (`districtId`, `indicator`, `delta`), `budgetDelta`.

## `POST /api/simulate`

Тело для `/api/simulate`, `/api/explain`, `/api/improve`, `/api/presentation` одинаковое:

```json
{"decisions": [
  {"measureId": "M7",  "districtId": "nura"},
  {"measureId": "M8",  "districtId": "nura"},
  {"measureId": "M10", "districtId": "nura"},
  {"measureId": "M12", "districtId": null},
  {"measureId": "M5",  "districtId": "saryarka"}
], "eventId": null}
```

Для городской меры `districtId` опускается или равен `null`; для районной обязателен. Лишние поля (например, `cost` или `score`) отклоняются HTTP 422: стоимость и результат считает только сервер. `eventId` — необязательный ID из `GET /api/events`; событие применяется к исходным показателям или бюджету **до** расчёта мер.

Ответ — всегда HTTP 200 для синтаксически корректного тела, в том числе для неполного или недопустимого плана:

```json
{
  "valid": true, "errors": [], "cost": 95, "remainingBudget": 5, "budget": 100,
  "eventId": null, "event": null,
  "decisionCount": 5, "ruleset": "dataset", "dataVersion": "akim-dataset-v1",
  "baseline": {"score": 52.55768, "cityAverage": 56.8624, "minDistrictScore": 49.18, "minDistrictId": "nura", "criticalCount": 2, "districts": []},
  "result":  {"score": 56.54307, "delta": 3.98539, "cityAverage": 58.0776, "minDistrictScore": 52.9625, "minDistrictId": "nura", "criticalCount": 0,
              "districts": [], "synergies": [], "decisions": [], "directionCoverage": {}, "missedSynergies": [], "unusedBudget": 5, "facts": []},
  "preview": {"…": "тот же объект, что result"}
}
```

Пустые массивы в иллюстрации заменяются фактическими данными.

- `result.districts[]`: `districtId`, `name`, `beforeScore`, `afterScore`, `beforeIndicators`, `afterIndicators`, `criticalBefore`, `criticalAfter` (ID показателей ниже 40 до и после, в порядке весов датасета).
- `result.decisions[]`: `measureId`, `districtId`, `name`, `direction`, `cost`, `lag`, `realizedShare` (= (8 − lag) / 8), `realizedEffects`.
- `result.synergies[]`: `measureIds`, `districtId`, `indicator`, `bonus`. `missedSynergies[]` — синергии, из которых выбрана только одна мера (объекты правил из `rules.synergies`).
- `result.directionCoverage`: число мер по каждому из пяти направлений.
- `result.facts[]`: проверенные русские факты расчёта; именно их получает AI. Есть только в `result`.
- `baseline` — исходное состояние (с учётом события, если оно передано), та же форма, что в `/api/catalog`.

**`preview`** — what-if расчёт, чтобы интерфейс показывал последствия каждого шага:

- если план допустим, `preview` совпадает с `result`;
- если план неполный или недопустимый, но без структурных ошибок, `preview` — расчёт по уникальным известным мерам (без `facts`), а `result = null`;
- при пустом плане или структурных ошибках (`UNKNOWN_MEASURE`, `DISTRICT_REQUIRED`, `CITY_DISTRICT_FORBIDDEN`) `preview = null`.

`preview` **никогда не заменяет** `result`: официальный Score, AI-объяснение, лидерборд и презентация существуют только для допустимого плана.

**`event`** — `null` или объект события из каталога с полем `budget` (действующий лимит, например `90` для `budget_cut`). Поле `budget` верхнего уровня — тот же действующий лимит.

**Ошибки** (`valid=false`, `result=null`): `errors` — массив `{code, message, measureIds}`. Коды: `UNKNOWN_MEASURE`, `EXACTLY_FIVE_REQUIRED`, `DUPLICATE_MEASURE`, `BUDGET_EXCEEDED`, `DISTRICT_REQUIRED`, `CITY_DISTRICT_FORBIDDEN`, `DIRECTION_LIMIT`, `INCOMPATIBLE_MEASURES`, `ALL_DIRECTIONS_REQUIRED`. При неизвестном ID меры `cost` и `remainingBudget` равны `null`; при превышении бюджета остаток отрицателен. Неизвестный `eventId` → HTTP 422 с кодом `UNKNOWN_EVENT` в `detail.errors`.

## `POST /api/explain`

Заново проверяет и рассчитывает план; для недопустимого — HTTP 422 с `detail.errors`. Для допустимого:

```json
{
  "status": "ai", "summary": "...", "strengths": ["..."], "risks": ["..."],
  "consequences": ["..."], "recommendations": ["..."],
  "decisions": [{"measureId": "M7", "text": "..."}],
  "model": "gpt-6-sol", "cached": false, "grounded": true, "fallbackReason": null
}
```

Модель получает только `result.facts` и отвечает по строгой JSON-схеме. Ответ принимается, если структура совпадает, `decisions` покрывают ровно выбранные меры и **каждое число в тексте присутствует в фактах**. Иначе (или без ключа, или при ошибке/таймауте 16 с) — `status: "fallback_no_ai"`, `model: null`, `fallbackReason` — причина, текст собран шаблоном из тех же фактов. Для числовых карточек интерфейс берёт данные из `/api/simulate`, а не из текста модели.

## `POST /api/improve`

Только без события (`eventId` → HTTP 422).

- Полный допустимый план → `{valid: true, errors: [], current, percentile, populationCount, globalOptimum, gapToOptimum, bestSingleSwap}`. `current` и `globalOptimum`: `{decisions, score, delta, cost, criticalCount}`. `percentile` — доля допустимых планов с меньшим Score (в %), `populationCount` — 694 395 для `dataset` (68 200 для `all_directions`). `bestSingleSwap` — `null` или `{remove, add, plan}`.
- Неполный план без других ошибок → `{valid: false, errors, completion}`: `completion` — лучший допустимый план, содержащий все переданные решения с теми же районами (или `null`).
- Иначе → `{valid: false, errors, completion: null}`.

Первый полный перебор занимает 10–20 секунд и кэшируется в `backend/data/cache/search-<hash>-<ruleset>.json` (`./scripts/start.sh` прогревает кэш заранее).

## События

`GET /api/events` → `{events: [...]}`. Сейчас: `winter_failure` (C1 −8 в Алматы), `smog` (E2 −6 в Сарыарке), `budget_cut` (бюджет −10 → 90), `nura_growth` (S1 −5 в Нуре).

`POST /api/events/draw` с необязательным телом `{"seed": 42, "excludeId": "smog"}` → одно событие с полями каталога и `budget`. Одинаковый `seed` даёт одинаковое событие; `excludeId` исключает текущее событие (кнопка «Другое событие»).

## Лидерборд

`POST /api/leaderboard` — тело плана плюс `teamName` (1–40 символов). Сервер пересчитывает результат (клиентскому Score не доверяет), хранит одну запись на команду в рамках `ruleset` и `dataVersion`; повторная отправка заменяет запись. С `eventId` — HTTP 422: команды сравниваются только при одинаковых исходных условиях.

`GET /api/leaderboard` → `{ruleset, dataVersion, entries}`; `entries[]`: `rank`, `teamName`, `score`, `delta`, `cost`, `criticalCount`, `decisions`, `updatedAt`. Сортировка: Score по убыванию, затем меньшая стоимость. Хранение — локальный SQLite `backend/data/cache/leaderboard.sqlite`.

## `POST /api/presentation`

План (можно с `eventId`) → `{filename: "akim-plan.md", markdown: "...", explanationStatus: "ai" | "fallback_no_ai"}`. Документ: итог Score, решения, районы до/после, факты расчёта, выводы AI. Если AI недоступен, раздел помечен «Шаблонное объяснение без AI».

Источник истины для правил: 14 мероприятий, лаги, синергии, ограничения и формула из `Доки/Датасет районов.docx` (перенесены в `backend/data/*.json`). Сервер не выдаёт реальных прогнозов.
