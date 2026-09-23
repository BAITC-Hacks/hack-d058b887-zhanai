# API «Аким на 5 часов»

Сервер: `http://127.0.0.1:8000`. Все пути ниже начинаются с `/api`. Если фронтенд использует Vite, настройте прокси `/api` на `http://127.0.0.1:8000`; CORS для `localhost:5173` уже разрешён. Данные синтетические, не актуальная статистика Астаны.

Запуск из корня репозитория:

```bash
./scripts/setup-backend.sh
./scripts/run-backend.sh
```

Тесты: `PYTHONPATH=backend .venv/bin/python -m pytest backend/tests -q`. Документация FastAPI после запуска: `http://127.0.0.1:8000/docs`.

Ключ храните только в переменной `OPENAI_API_KEY` на сервере или в локальном файле `.env` в корне репозитория (он исключён из Git). Без ключа `/api/explain` возвращает проверенное шаблонное объяснение со `status: "fallback_no_ai"`. Модель: `AI_MODEL` (по умолчанию `gpt-6-astra`), режим правил: `RULESET=dataset` или `RULESET=all_directions`. Последний добавляет требование всех пяти направлений. Режим задаётся при запуске сервера, а не клиентом.

## Основные запросы

`GET /api/health` → `{ "status": "ok", "ruleset": "dataset", "dataVersion": "akim-dataset-v1", "aiConfigured": false }`.

`GET /api/catalog` → `{districts, measures, rules, ruleset, dataVersion, baseline, syntheticData}`. Меры содержат `id`, `name`, `direction`, `scope` (`district` или `city`), `cost`, `lag`, `effects`; районы содержат `id`, `name`, `populationShare`, `profile`, `indicators`. `rules` содержит бюджет, горизонт, веса, названия индикаторов, синергии и несовместимости. `baseline` содержит `score`, `cityAverage`, `minDistrictScore`, `criticalCount`, `districts` с исходными оценками и показателями.

Тело для `POST /api/simulate`, `/api/explain`, `/api/improve` одинаковое:

```json
{"decisions":[
  {"measureId":"M7","districtId":"nura"},
  {"measureId":"M8","districtId":"nura"},
  {"measureId":"M10","districtId":"nura"},
  {"measureId":"M12","districtId":null},
  {"measureId":"M5","districtId":"saryarka"}
]}
```

Для городской меры `districtId` может быть опущен (равен `null`). Для районной нужен один из `esil`, `almaty`, `saryarka`, `baikonur`, `nura`. Лишние поля запроса отклоняются HTTP 422. Нельзя передать стоимость или результат расчёта.

Для сценария с неожиданным событием добавьте в тело `"eventId":"smog"` (или другой ID из `GET /api/events`). Событие применяется к исходным показателям или бюджету **до** расчёта мер. `/api/improve` и лидерборд принимают только исходные условия без события.

`POST /api/simulate` всегда возвращает HTTP 200 для синтаксически корректного тела, в том числе при неполном/недопустимом плане. Ответ:

```json
{
  "valid": true, "errors": [], "cost": 95, "remainingBudget": 5,
  "decisionCount": 5, "budget": 100, "eventId": null, "ruleset": "dataset", "dataVersion": "akim-dataset-v1",
  "baseline": {"score": 52.55768, "cityAverage": 56.8624, "minDistrictScore": 49.18, "criticalCount": 2, "districts": []},
  "result": {"score": 56.54307, "delta": 3.98539, "cityAverage": 58.0776, "minDistrictScore": 52.9625, "criticalCount": 0, "districts": [], "synergies": [], "decisions": [], "facts": [], "directionCoverage": {}, "missedSynergies": [], "unusedBudget": 5}
}
```

Пустые массивы в иллюстрации выше заменяются фактическими данными. В `result.districts` есть `districtId`, `name`, `beforeScore`, `afterScore`, `beforeIndicators`, `afterIndicators`; `result.decisions` содержит `measureId`, `districtId`, `name`, `direction`, `cost`, `lag`, `realizedShare`, `realizedEffects`. `result.synergies` содержит `measureIds`, `districtId`, `indicator`, `bonus`. В `directionCoverage` числа по пяти ID направлений. При ошибке `valid=false`, `result=null`, а `errors` — массив `{code,message,measureIds}`. При неизвестном ID `cost` и `remainingBudget` равны `null`; при превышении бюджета остаток отрицателен. Для неполного выбора доступна стоимость уже выбранных мер, но нет итогового Score.

Коды ошибок: `UNKNOWN_MEASURE`, `EXACTLY_FIVE_REQUIRED`, `DUPLICATE_MEASURE`, `BUDGET_EXCEEDED`, `DISTRICT_REQUIRED`, `CITY_DISTRICT_FORBIDDEN`, `DIRECTION_LIMIT`, `INCOMPATIBLE_MEASURES`, `ALL_DIRECTIONS_REQUIRED`.

Неизвестный `eventId` возвращает HTTP 422 с кодом `UNKNOWN_EVENT` в `detail.errors`.

`POST /api/explain` заново проверяет план; для недопустимого возвращает HTTP 422 с `detail.errors`. Для допустимого возвращает:

```json
{
  "status": "ai", "summary": "...", "strengths": ["..."],
  "risks": ["..."], "consequences": ["..."], "recommendations": ["..."],
  "decisions": [{"measureId":"M7","text":"..."}],
  "model": "gpt-6-astra", "cached": false, "grounded": true,
  "fallbackReason": null
}
```

При отсутствии ключа, ошибке AI или неподтверждённом числе `status="fallback_no_ai"`, `model=null`, `fallbackReason` — причина. Это не настоящий ответ модели. Для карточек с фактами брать только числовой ответ `/api/simulate`, не текст модели.

`POST /api/improve` для полного допустимого набора → `{valid, errors, current, percentile, populationCount, globalOptimum, gapToOptimum, bestSingleSwap}`. План `current` и `globalOptimum`: `{decisions, score, delta, cost, criticalCount}`. `bestSingleSwap` — `null`, если улучшения заменой одного решения нет, иначе `{remove,add,plan}`. Для неполного набора возвращает `valid=false`, `errors`, `completion` — лучший допустимый план, содержащий все переданные решения с теми же районами (или `null`, если такого нет). Первая сборка полного перебора может занять несколько секунд; затем результаты кэшируются в `backend/data/cache`.

`GET /api/events` → `{events:[...]}`. `POST /api/events/draw` с необязательным телом `{"seed":42}` возвращает одно событие с `id`, `name`, `description`, `indicatorChanges`, `budgetDelta`; одинаковый seed даёт одинаковое событие.

`POST /api/leaderboard` принимает те же `decisions` и `teamName` (1–40 символов), пересчитывает результат на сервере, сохраняет одну запись на команду и возвращает её. Повторная отправка заменяет запись этой команды. `GET /api/leaderboard` → `{ruleset,dataVersion,entries}`, отсортированные по Score, затем по меньшей стоимости. Хранение локальное SQLite, не общая облачная база; сравнивать можно в рамках одного сервера.

`POST /api/presentation` принимает план, возвращает `{filename:"akim-plan.md",markdown:"...",explanationStatus:"ai"|"fallback_no_ai"}`. Содержимое можно скачать как Markdown. Если AI недоступен, документ честно помечен «без AI».

Источник истины: 14 мероприятий, лаги, синергии, ограничения и формула из `Доки/Датасет районов.docx`. Сервер не выводит реальные прогнозы.
