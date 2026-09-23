#!/usr/bin/env bash
# Режим разработки: сервер с автоперезагрузкой на :8000 и Vite с hot reload на :5173.
# Vite проксирует /api на сервер (frontend/vite.config.ts). Ctrl+C останавливает оба процесса.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { printf '[dev] %s\n' "$*"; }
die()  { printf '\n[dev] ОШИБКА: %s\n' "$*" >&2; exit 1; }

[[ -x .venv/bin/python ]] || die "Не найдено окружение .venv. Сначала выполните ./scripts/setup.sh"
[[ -d frontend/node_modules ]] || die "Нет frontend/node_modules. Сначала выполните ./scripts/setup.sh"
command -v npm >/dev/null 2>&1 || die "Не найден npm."

for port in 8000 5173; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    die "Порт $port уже занят. Остановите процесс, который его использует (например, ./scripts/start.sh)."
  fi
done

PIDS=()

kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  trap - EXIT INT TERM
  info "Останавливаю сервер и Vite…"
  local pid
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    kill_tree "$pid"
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

info "Сервер: http://127.0.0.1:8000 (API, /docs), автоперезагрузка при изменении backend/"
(
  export PYTHONPATH="$ROOT/backend${PYTHONPATH:+:$PYTHONPATH}"
  exec .venv/bin/python -m uvicorn app.main:app --reload --reload-dir "$ROOT/backend" --host 127.0.0.1 --port 8000
) &
PIDS+=("$!")

info "Интерфейс: http://localhost:5173 (VITE_API_MODE=http)"
(
  cd frontend
  VITE_API_MODE=http exec npm run dev -- --port 5173 --strictPort
) &
PIDS+=("$!")

# bash 3.2 на macOS не умеет `wait -n`, поэтому опрашиваем оба процесса.
while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      info "Один из процессов завершился — останавливаю второй."
      exit 1
    fi
  done
  sleep 1
done
