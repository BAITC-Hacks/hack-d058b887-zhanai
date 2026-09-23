#!/usr/bin/env bash
# Одноразовая установка: Python-окружение для сервера и npm-зависимости интерфейса.
# Запуск из любой папки: ./scripts/setup.sh
# Другой интерпретатор Python: PYTHON=/path/to/python3.12 ./scripts/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { printf '[setup] %s\n' "$*"; }
warn() { printf '[setup] ВНИМАНИЕ: %s\n' "$*" >&2; }
die()  { printf '\n[setup] ОШИБКА: %s\n' "$*" >&2; exit 1; }

PY_CHECK='import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'

# ---- 1. Python >= 3.10 --------------------------------------------------------
find_python() {
  if [[ -n "${PYTHON:-}" ]]; then
    echo "$PYTHON"
    return 0
  fi
  local candidate
  for candidate in python3 python3.13 python3.12 python3.11 python3.10 python3.14; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "$PY_CHECK" 2>/dev/null; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

PY="$(find_python)" || die "Не найден Python 3.10 или новее.
  macOS:  brew install python@3.12
  Ubuntu: sudo apt install python3 python3-venv
  Или укажите путь явно: PYTHON=/path/to/python3 ./scripts/setup.sh"
"$PY" -c "$PY_CHECK" 2>/dev/null || die "$PY — версия ниже 3.10: $("$PY" --version 2>&1)"
info "Python: $("$PY" --version 2>&1) ($(command -v "$PY" || echo "$PY"))"

# ---- 2. Node.js >= 20 и npm ---------------------------------------------------
command -v node >/dev/null 2>&1 || die "Не найден Node.js. Нужна версия 20.19+ или 22.12+ (https://nodejs.org, brew install node, nvm install 22)."
command -v npm  >/dev/null 2>&1 || die "Не найден npm (обычно ставится вместе с Node.js)."
NODE_VERSION="$(node -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_MINOR="$(echo "$NODE_VERSION" | cut -d. -f2)"
if (( NODE_MAJOR < 20 )); then
  die "Node.js $NODE_VERSION слишком старый. Нужна версия 20.19+ или 22.12+."
fi
if { (( NODE_MAJOR == 20 )) && (( NODE_MINOR < 19 )); } || (( NODE_MAJOR == 21 )) || { (( NODE_MAJOR == 22 )) && (( NODE_MINOR < 12 )); }; then
  warn "Node.js $NODE_VERSION: Vite рассчитан на 20.19+ или 22.12+. Если сборка упадёт, обновите Node."
fi
info "Node.js: $NODE_VERSION, npm: $(npm --version)"

# ---- 3. Виртуальное окружение .venv ------------------------------------------
if [[ -x .venv/bin/python ]] && ! .venv/bin/python -c "$PY_CHECK" 2>/dev/null; then
  warn ".venv создан старым Python — пересоздаю."
  rm -rf .venv
fi
if [[ ! -x .venv/bin/python ]]; then
  info "Создаю .venv"
  "$PY" -m venv .venv || die "Не удалось создать .venv. На Ubuntu/Debian установите пакет python3-venv (sudo apt install python3-venv)."
fi
info "Устанавливаю зависимости сервера (backend/requirements.txt)"
.venv/bin/python -m pip install --disable-pip-version-check -q --upgrade pip \
  || die "Не удалось обновить pip внутри .venv."
.venv/bin/python -m pip install --disable-pip-version-check -q -r backend/requirements.txt \
  || die "pip не смог установить backend/requirements.txt. Проверьте доступ к PyPI."

# ---- 4. Зависимости интерфейса -----------------------------------------------
info "Устанавливаю зависимости интерфейса (npm ci в frontend/)"
(cd frontend && npm ci --no-audit --no-fund) \
  || die "npm ci завершился с ошибкой. Проверьте доступ к registry.npmjs.org и версию Node."

# ---- 5. Локальный .env --------------------------------------------------------
if [[ ! -f .env ]]; then
  cp .env.example .env
  info "Создан .env из .env.example (ключ OpenAI пустой — AI-пояснения будут в режиме «без AI»)."
fi

cat <<EOF

[setup] Готово.
  Запуск демо (интерфейс + API на одном порту):  ./scripts/start.sh
  Режим разработки (hot reload):                  ./scripts/dev.sh
  Тесты:                                          ./scripts/test.sh
  Ключ OpenAI (необязательно): впишите OPENAI_API_KEY в $ROOT/.env
EOF
