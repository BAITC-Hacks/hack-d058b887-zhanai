#!/usr/bin/env bash
# Демо одной командой: собирает интерфейс (если нужно) и запускает FastAPI,
# который отдаёт и UI, и API на одном порту: http://127.0.0.1:8000
#
#   ./scripts/start.sh             собрать frontend/dist, если его нет, и запустить
#   ./scripts/start.sh --rebuild   пересобрать интерфейс принудительно
#   HOST=0.0.0.0 PORT=9000 ./scripts/start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { printf '[start] %s\n' "$*"; }
die()  { printf '\n[start] ОШИБКА: %s\n' "$*" >&2; exit 1; }

REBUILD=0
for arg in "$@"; do
  case "$arg" in
    --rebuild) REBUILD=1 ;;
    -h|--help) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "Неизвестный аргумент: $arg (допустимо: --rebuild)" ;;
  esac
done

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"
DIST="frontend/dist"
STAMP="$DIST/.akim-api-mode"   # сборка для сервера должна быть в режиме http, а не mock

[[ -x .venv/bin/python ]] || die "Не найдено окружение .venv. Сначала выполните ./scripts/setup.sh"
.venv/bin/python -c 'import fastapi, uvicorn' 2>/dev/null || die "В .venv нет зависимостей сервера. Выполните ./scripts/setup.sh"

# ---- 1. Сборка интерфейса ----------------------------------------------------
if (( REBUILD )) || [[ ! -f "$DIST/index.html" ]] || [[ "$(cat "$STAMP" 2>/dev/null || true)" != "http" ]]; then
  command -v npm >/dev/null 2>&1 || die "Не найден npm, а интерфейс ещё не собран. Установите Node.js 20.19+ и выполните ./scripts/setup.sh"
  [[ -d frontend/node_modules ]] || die "Нет frontend/node_modules. Выполните ./scripts/setup.sh"
  info "Собираю интерфейс (VITE_API_MODE=http) → $DIST"
  (cd frontend && VITE_API_MODE=http npm run build) || die "Сборка интерфейса не удалась (см. вывод выше)."
  echo "http" > "$STAMP"
else
  info "Интерфейс уже собран ($DIST). Пересобрать: ./scripts/start.sh --rebuild"
fi

# ---- 2. Порт свободен? --------------------------------------------------------
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  die "Порт $PORT уже занят (возможно, сервер уже запущен). Остановите его или задайте другой: PORT=8001 ./scripts/start.sh"
fi

export PYTHONPATH="$ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"

# ---- 3. Кэш полного перебора (один раз, затем мгновенно) -----------------------
info "Проверяю кэш полного перебора планов (первый раз занимает 10–20 секунд)…"
.venv/bin/python - <<'PY' || die "Не удалось подготовить кэш перебора (проверьте RULESET в .env: dataset или all_directions)."
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path.cwd() / ".env")
from app.optimizer import population_stats
stats = population_stats(os.getenv("RULESET", "dataset"))
print(f"[start] Перебор: {stats['count']:,} допустимых планов, оптимум {stats['bestScore']:.2f}".replace(",", " "))
PY

# ---- 4. Статус AI ---------------------------------------------------------------
if [[ -n "${OPENAI_API_KEY:-}" ]] || grep -Eq '^[[:space:]]*OPENAI_API_KEY=[^[:space:]#]+' .env 2>/dev/null; then
  info "AI: ключ OpenAI найден — пояснения от модели с проверкой чисел."
else
  info "AI: ключ не задан — пояснения собираются из фактов расчёта с пометкой «без AI». Ключ: OPENAI_API_KEY в .env"
fi

URL_HOST="$HOST"
[[ "$HOST" == "0.0.0.0" ]] && URL_HOST="127.0.0.1"
cat <<EOF

  Аким на 5 часов запущен
  Интерфейс:         http://$URL_HOST:$PORT
  API (Swagger):     http://$URL_HOST:$PORT/docs
  Остановить:        Ctrl+C

EOF

exec .venv/bin/python -m uvicorn app.main:app --host "$HOST" --port "$PORT"
