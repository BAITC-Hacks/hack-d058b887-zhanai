#!/usr/bin/env bash
# Полная проверка: тесты сервера (pytest), типы интерфейса (tsc) и production-сборка.
# Первый прогон pytest строит кэш полного перебора (10–20 секунд), дальше быстро.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CURRENT="подготовка"
step() { CURRENT="$1"; printf '\n[test] ── %s ──\n' "$1"; }
die()  { printf '\n[test] ОШИБКА: %s\n' "$*" >&2; exit 1; }
trap 'status=$?; if (( status != 0 )); then printf "\n[test] ПРОВАЛ на шаге: %s\n" "$CURRENT" >&2; fi' EXIT

[[ -x .venv/bin/python ]] || die "Не найдено окружение .venv. Сначала выполните ./scripts/setup.sh"
[[ -d frontend/node_modules ]] || die "Нет frontend/node_modules. Сначала выполните ./scripts/setup.sh"

step "Backend: pytest (контрольные числа датасета, валидатор, API, AI-guard, перебор)"
# Тесты рассчитаны на правила датасета; RULESET из .env здесь не применяется.
RULESET=dataset PYTHONPATH="$ROOT/backend" .venv/bin/python -m pytest backend/tests -q

step "Frontend: проверка типов (npm run typecheck)"
(cd frontend && npm run typecheck)

step "Frontend: production-сборка (npm run build, VITE_API_MODE=http)"
(cd frontend && VITE_API_MODE=http npm run build)
echo "http" > frontend/dist/.akim-api-mode   # эту сборку может сразу отдавать ./scripts/start.sh

CURRENT="готово"
printf '\n[test] Все проверки пройдены.\n'
