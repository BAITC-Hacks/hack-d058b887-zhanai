#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 -m venv "${repo_root}/.venv"
"${repo_root}/.venv/bin/pip" install -r "${repo_root}/backend/requirements.txt"
