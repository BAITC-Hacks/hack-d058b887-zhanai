#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PYTHONPATH="${repo_root}/backend"
cd "${repo_root}"
exec "${repo_root}/.venv/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000
