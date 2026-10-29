#!/usr/bin/env bash
# ------------------------------------------------------------------
# FastAPI のバックエンドを「テスト用の一時データベース」で起動し、
# API テスト（tests/api_test.py）を流して動作を確認します。
# 本番用のデータベース（data/app.db）には書き込みません。
#
#   tests/run_api_tests.sh
# ------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../scripts/common.sh
source "$ROOT/scripts/common.sh"

TMP_DIR="$(mktemp -d)"
SERVER_PID=""
PORT=18000
URL="http://127.0.0.1:$PORT"

stop_server() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
}
cleanup() {
  stop_server
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

export BLUETAB_ROOT="$ROOT"
export DATABASE_PATH="$TMP_DIR/test.db"
export BLUETAB_CONTACT_LIMIT=1000   # テストでは問い合わせを何度も送るため、回数制限を緩めます
export ADMIN_EMAIL="admin@example.com"
# Outlook 送信は、テスト用の偽の Microsoft サーバー（api_test.py が起動）に向けます（本物にはつなぎません）
FAKE_MICROSOFT_PORT=18999
export MICROSOFT_CLIENT_ID="test-client"
export MICROSOFT_TENANT="consumers"
export MICROSOFT_LOGIN_URL="http://127.0.0.1:$FAKE_MICROSOFT_PORT"
export MICROSOFT_GRAPH_URL="http://127.0.0.1:$FAKE_MICROSOFT_PORT"
export MAIL_FROM_ADDRESS="owner@example.com"
export MAIL_FROM_NAME="Katachi テスト"
FIRST_PASSWORD="test-password-123"
CHANGED_PASSWORD="changed-password-456"
RESET_PASSWORD="reset-password-789"

start_server() {
  export ADMIN_PASSWORD="$1"
  (cd "$ROOT/backend" && exec "$BT_VENV_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT") \
    >>"$TMP_DIR/server.log" 2>&1 &
  SERVER_PID=$!
  local i
  for i in $(seq 1 120); do
    curl -fsS "$URL/api/health" >/dev/null 2>&1 && return 0
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      cat "$TMP_DIR/server.log" >&2
      bt_die "サーバーの起動に失敗しました。"
    fi
    sleep 1
  done
  cat "$TMP_DIR/server.log" >&2
  bt_die "サーバーが時間内に起動しませんでした。"
}

api_test() {
  "$BT_VENV_PYTHON" "$ROOT/tests/api_test.py" --base-url "$URL" --email "$ADMIN_EMAIL" "$@"
}

bt_log "=== FastAPI のバックエンドをテストします ==="
bt_ensure_python_venv
FAILED=0

start_server "$FIRST_PASSWORD"
api_test --password "$FIRST_PASSWORD" --new-password "$CHANGED_PASSWORD" --fake-microsoft-port "$FAKE_MICROSOFT_PORT" || FAILED=1
stop_server

bt_log "=== 再起動しても、管理画面で変えたパスワードが残るか ==="
start_server "$FIRST_PASSWORD"
api_test --check-login --password "$CHANGED_PASSWORD" || FAILED=1
if api_test --check-login --password "$FIRST_PASSWORD" >/dev/null; then
  echo "  NG   .env を変えていないのに、パスワードが元に戻った"
  FAILED=1
else
  echo "  OK   .env を変えていなければ、古いパスワードには戻らない"
fi
stop_server

bt_log "=== .env のパスワードを書き換えて再起動すると、リセットされるか ==="
start_server "$RESET_PASSWORD"
api_test --check-login --password "$RESET_PASSWORD" || FAILED=1
stop_server

if [ "$FAILED" = 0 ]; then
  bt_log "すべてのテストに成功しました。"
else
  bt_die "失敗したテストがあります（上のログを確認してください）。"
fi
