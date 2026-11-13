#!/usr/bin/env bash
# ------------------------------------------------------------------
# AI Nova サイトを「FastAPI（Python）版」で起動します。
# API（backend/・ポート 8000）と画面（frontend/ の Vite・ポート 5173）を一緒に起動します。
#
#   ./run_backend.sh                 … 画面 http://127.0.0.1:5173 / API http://127.0.0.1:8000
#   PORT=9000 ./run_backend.sh       … API のポートを変える
#   WEB_PORT=3000 ./run_backend.sh   … 画面のポートを変える
#   ./run_backend.sh --reload        … Python のコードを変えると API を自動で再起動
#
# 初回は Python の仮想環境・Node.js・npm パッケージの準備で数分かかります。
# 停止するときは Ctrl+C を押してください（API と画面の両方が止まります）。
# ------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/common.sh
source "$ROOT/scripts/common.sh"

RELOAD_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --reload) RELOAD_ARGS=(--reload --reload-dir "$ROOT/backend/app") ;;
    -h | --help)
      sed -n '2,13p' "$0"
      exit 0
      ;;
    *) bt_die "不明なオプションです: $arg（./run_backend.sh --help で使い方を表示します）" ;;
  esac
done

bt_ensure_env
API_HOST="${HOST:-$(bt_env_get HOST)}"
API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${PORT:-$(bt_env_get BACKEND_PORT)}"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-$(bt_frontend_env_get fastapi DEV_PORT)}"
WEB_PORT="${WEB_PORT:-5173}"
API_URL="http://127.0.0.1:$API_PORT"
WEB_URL="http://127.0.0.1:$WEB_PORT"

bt_check_port_free "$API_HOST" "$API_PORT"
bt_check_port_free 127.0.0.1 "$WEB_PORT"
bt_ensure_python_venv
bt_prepare_frontend

# 画面のポートを変えた場合も API を呼べるよう、接続元の許可に追加します
FRONTEND_ORIGINS="${FRONTEND_ORIGINS:-$(bt_env_get FRONTEND_ORIGINS)}"
export FRONTEND_ORIGINS="${FRONTEND_ORIGINS:+$FRONTEND_ORIGINS,}http://127.0.0.1:$WEB_PORT,http://localhost:$WEB_PORT"
export BLUETAB_ROOT="$ROOT"
[ "${#RELOAD_ARGS[@]}" -gt 0 ] && export WATCHFILES_FORCE_POLLING=true

bt_trap_stop_all
bt_log "API（FastAPI）を起動しています... → $API_URL"
(cd "$ROOT/backend" && exec "$BT_VENV_PYTHON" -m uvicorn app.main:app --host "$API_HOST" --port "$API_PORT" \
  ${RELOAD_ARGS[@]+"${RELOAD_ARGS[@]}"}) &
BT_PIDS+=($!)
bt_wait_for_api "$API_URL" "${BT_PIDS[0]}"

bt_log "画面（React / Vite）を起動しています... → $WEB_URL"
bt_start_frontend fastapi "$WEB_PORT" "$API_URL"
bt_wait_all "$WEB_URL" "$API_URL（説明ページ: $API_URL/api/docs）" "FastAPI 版"
