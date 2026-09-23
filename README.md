# Аким на 5 часов — HackAlem AI

AI-симулятор управления городом: пять решений, один бюджет, итоговый Astana Quality of Life Score и объяснение компромиссов.

**Готовый продукт — в папке [`product.v1/`](product.v1/README.md).** Там README, запуск одной командой и документация для жюри.

```bash
cd product.v1
./scripts/setup.sh   # Python ≥3.10, Node ≥20
./scripts/start.sh   # http://127.0.0.1:8000
```

| Папка | Что это |
| --- | --- |
| `product.v1/` | Собранный продукт: бэкенд akim-engine (FastAPI) + интерфейс claude.front + карта Astana Scheme |
| `claude.front/` | Исходная версия интерфейса (до интеграции) |
| `Astana Scheme/` | Интерактивная схема 5 районов Астаны по границам OpenStreetMap |
| `Доки/` | Условие задачи, датасет районов, план работ |
