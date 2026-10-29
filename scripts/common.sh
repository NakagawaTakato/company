#!/usr/bin/env bash
# run_backend.sh / tests/run_api_tests.sh が共通で使う処理です。直接は実行しません。
#
# 必要なツール（Node.js）が見つからない場合は、
# ~/.local/share/bluetab-tools に自動でダウンロードします（sudo 不要）。
# 置き場所は環境変数 BLUETAB_TOOLS_DIR で変更できます。

BT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BT_FRONTEND_DIR="$BT_ROOT/frontend"
BT_TOOLS_DIR="${BLUETAB_TOOLS_DIR:-$HOME/.local/share/bluetab-tools}"
BT_NODE_MAJOR=24

bt_log() { printf '\033[1;34m[Katachi]\033[0m %s\n' "$*"; }
bt_warn() { printf '\033[1;33m[Katachi]\033[0m %s\n' "$*" >&2; }
bt_die() { printf '\033[1;31m[Katachi] エラー:\033[0m %s\n' "$*" >&2; exit 1; }

bt_require_cmd() {
  command -v "$1" >/dev/null 2>&1 || bt_die "'$1' が見つかりません。$2"
}

bt_arch() {
  case "$(uname -m)" in
    x86_64 | amd64) echo x64 ;;
    aarch64 | arm64) echo arm64 ;;
    *) bt_die "未対応の CPU です: $(uname -m)" ;;
  esac
}

# ---------------------------------------------------------------- .env

# .env の値を読み取ります（シェルとして実行はしません）
bt_env_get() {
  local key="$1" file="$BT_ROOT/.env" line
  [ -f "$file" ] || return 0
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="$(printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
  printf '%s' "$line"
}

bt_ensure_env() {
  local env_file="$BT_ROOT/.env"
  if [ -f "$env_file" ]; then
    return 0
  fi
  local password
  password="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 16)"
  sed "s/__GENERATE__/$password/" "$BT_ROOT/.env.example" >"$env_file"
  chmod 600 "$env_file" 2>/dev/null || true
  bt_log "設定ファイルを作成しました: .env"
  bt_log "  管理画面のメールアドレス: $(bt_env_get ADMIN_EMAIL)"
  bt_log "  管理画面のパスワード    : $password"
  bt_log "  （.env を編集すると変更できます）"
}

# ポートが使用中なら終了します
bt_check_port_free() {
  local host="$1" port="$2" probe="$1"
  [ "$probe" = "0.0.0.0" ] && probe=127.0.0.1
  if (exec 3<>"/dev/tcp/$probe/$port") 2>/dev/null; then
    bt_die "ポート $port は既に使われています。別の起動コマンドが動いていないか確認するか、PORT=番号 を付けて起動してください。"
  fi
}

# ---------------------------------------------------------------- 共通: ファイル群のハッシュ

bt_hash_paths() {
  # 引数のファイル/フォルダ（存在するものだけ）の内容から 1 つのハッシュを作ります
  local existing=() p
  for p in "$@"; do
    [ -e "$p" ] && existing+=("$p")
  done
  [ "${#existing[@]}" -eq 0 ] && { echo none; return; }
  find "${existing[@]}" -type f -not -name '.DS_Store' -print0 |
    LC_ALL=C sort -z |
    xargs -0 sha256sum |
    sed "s#  $BT_ROOT/#  #" |
    sha256sum | cut -d' ' -f1
}

# ---------------------------------------------------------------- Node.js

bt_node_version_ok() {
  # Vite 7 の要件: Node.js 20.19 以上 または 22.12 以上
  local v major minor
  v="$("$1" --version 2>/dev/null)" || return 1
  v="${v#v}"
  major="${v%%.*}"
  minor="${v#*.}"
  minor="${minor%%.*}"
  [ "$major" -ge 23 ] && return 0
  [ "$major" -eq 22 ] && [ "$minor" -ge 12 ] && return 0
  [ "$major" -eq 20 ] && [ "$minor" -ge 19 ] && return 0
  return 1
}

bt_ensure_node() {
  export NPM_CONFIG_UPDATE_NOTIFIER=false
  local sys_node
  sys_node="$(command -v node 2>/dev/null || true)"
  if [ -n "$sys_node" ] && bt_node_version_ok "$sys_node" && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  local node_home="$BT_TOOLS_DIR/node"
  if [ ! -x "$node_home/bin/node" ] || ! bt_node_version_ok "$node_home/bin/node"; then
    bt_require_cmd curl "sudo apt install curl でインストールしてください。"
    local arch base line sha file tmp
    arch="$(bt_arch)"
    base="https://nodejs.org/dist/latest-v${BT_NODE_MAJOR}.x"
    bt_log "Node.js ${BT_NODE_MAJOR} をダウンロードします（初回のみ）: $node_home"
    line="$(curl -fsSL "$base/SHASUMS256.txt" | grep -E " node-v[0-9.]+-linux-${arch}\.tar\.gz$" | head -n 1)" ||
      bt_die "Node.js のダウンロード先を取得できませんでした。ネットワーク接続を確認してください。"
    sha="${line%% *}"
    file="${line##* }"
    tmp="$(mktemp -d)"
    curl -fSL --progress-bar -o "$tmp/$file" "$base/$file" || bt_die "Node.js のダウンロードに失敗しました。"
    (cd "$tmp" && echo "$sha  $file" | sha256sum -c --quiet -) || bt_die "Node.js のファイル検証（SHA256）に失敗しました。"
    mkdir -p "$BT_TOOLS_DIR"
    rm -rf "$node_home"
    tar -xzf "$tmp/$file" -C "$tmp"
    mv "$tmp/${file%.tar.gz}" "$node_home"
    rm -rf "$tmp"
  fi
  export PATH="$node_home/bin:$PATH"
}

# ---------------------------------------------------------------- フロントエンド（React）

# frontend/.env.<mode> の値を読み取ります（例: bt_frontend_env_get fastapi DEV_PORT）
bt_frontend_env_get() {
  local mode="$1" key="$2" file="$BT_FRONTEND_DIR/.env.$1" line
  [ -f "$file" ] || return 0
  line="$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  printf '%s' "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

# Node.js と npm パッケージを用意します（package-lock.json が変わったときだけ npm ci）
bt_prepare_frontend() {
  bt_ensure_node
  local lock_hash lock_file
  lock_hash="$(bt_hash_paths "$BT_FRONTEND_DIR/package.json" "$BT_FRONTEND_DIR/package-lock.json")"
  bt_frontend_ready() {
    [ -d "$BT_FRONTEND_DIR/node_modules" ] &&
      [ "$(cat "$BT_FRONTEND_DIR/node_modules/.bt-lock-hash" 2>/dev/null)" = "$lock_hash" ]
  }
  bt_frontend_ready && return 0

  # 2つの起動コマンドを同時に実行しても、npm ci が重ならないよう順番待ちします
  lock_file="${TMPDIR:-/tmp}/bluetab-npm-$(printf '%s' "$BT_FRONTEND_DIR" | sha256sum | cut -c1-12).lock"
  exec 8>"$lock_file"
  command -v flock >/dev/null 2>&1 && flock 8
  if ! bt_frontend_ready; then
    bt_log "フロントエンドの依存パッケージをインストールしています（npm ci）..."
    (cd "$BT_FRONTEND_DIR" && npm ci --no-audit --no-fund --loglevel=error) || bt_die "npm ci に失敗しました。"
    echo "$lock_hash" >"$BT_FRONTEND_DIR/node_modules/.bt-lock-hash"
  fi
  exec 8>&-
}

# ---------------------------------------------------------------- API と画面をまとめて起動

BT_PIDS=()

bt_stop_all() {
  local pid
  for pid in "${BT_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${BT_PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  BT_PIDS=()
}

# Ctrl+C やどちらかが止まったときに、もう片方も止めます
bt_trap_stop_all() {
  trap 'bt_stop_all' EXIT
  trap 'echo; bt_log "停止しています..."; bt_stop_all; exit 0' INT TERM
}

# API が応答するまで待ちます（途中でプロセスが止まったらエラー）
bt_wait_for_api() {
  local url="$1" pid="$2" i
  for i in $(seq 1 180); do
    if curl -fsS "$url/api/health" >/dev/null 2>&1; then
      return 0
    fi
    kill -0 "$pid" 2>/dev/null || bt_die "API サーバーの起動に失敗しました（上のログを確認してください）。"
    sleep 1
  done
  bt_die "API サーバーが時間内に起動しませんでした。"
}

# 画面（Vite の開発サーバー）を起動します。引数: モード(fastapi) 画面のポート API の URL
bt_start_frontend() {
  local mode="$1" web_port="$2" api_url="$3"
  (
    cd "$BT_FRONTEND_DIR" &&
      VITE_API_BASE_URL="$api_url" exec ./node_modules/.bin/vite --mode "$mode" --port "$web_port" --strictPort --clearScreen false
  ) &
  BT_PIDS+=($!)
}

# 起動完了の案内を表示し、どちらかが止まるまで待ちます
bt_wait_all() {
  local web_url="$1" api_url="$2" label="$3"
  local i
  for i in $(seq 1 60); do
    curl -fsS "$web_url" >/dev/null 2>&1 && break
    sleep 1
  done
  echo
  bt_log "======================================================"
  bt_log " $label で起動しました"
  bt_log "   画面      : $web_url"
  bt_log "   管理画面  : $web_url/admin/login"
  bt_log "   API       : $api_url"
  bt_log " 停止するときは Ctrl+C を押してください。"
  bt_log "======================================================"
  wait -n "${BT_PIDS[@]}" || true
  bt_warn "API または画面のプロセスが終了したため、すべて停止します。"
}

# ---------------------------------------------------------------- Python（FastAPI）

bt_ensure_python_venv() {
  bt_require_cmd python3 "sudo apt install python3 でインストールしてください。"
  python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' ||
    bt_die "Python 3.10 以上が必要です（現在: $(python3 --version 2>&1)）。"

  local venv="$BT_ROOT/backend/.venv"
  if [ ! -x "$venv/bin/python" ] || ! "$venv/bin/python" -m pip --version >/dev/null 2>&1; then
    rm -rf "$venv"
    bt_log "Python の仮想環境を作成しています: backend/.venv"
    if ! python3 -m venv "$venv" >/dev/null 2>&1; then
      # Ubuntu で python3-venv（ensurepip）が無い場合の回避策
      rm -rf "$venv"
      python3 -m venv --without-pip "$venv" ||
        bt_die "仮想環境を作成できません。sudo apt install python3-venv を実行してください。"
      bt_require_cmd curl "sudo apt install curl でインストールしてください。"
      local tmp
      tmp="$(mktemp -d)"
      curl -fsSL https://bootstrap.pypa.io/get-pip.py -o "$tmp/get-pip.py" || bt_die "pip のダウンロードに失敗しました。"
      "$venv/bin/python" "$tmp/get-pip.py" --quiet || bt_die "pip のインストールに失敗しました。"
      rm -rf "$tmp"
    fi
  fi

  local req="$BT_ROOT/backend/requirements.txt" req_hash
  req_hash="$(bt_hash_paths "$req")"
  if [ "$(cat "$venv/.bt-req-hash" 2>/dev/null)" != "$req_hash" ]; then
    bt_log "Python パッケージをインストールしています（pip install）..."
    "$venv/bin/python" -m pip install --quiet --disable-pip-version-check -r "$req" ||
      bt_die "pip install に失敗しました。"
    echo "$req_hash" >"$venv/.bt-req-hash"
  fi
  BT_VENV_PYTHON="$venv/bin/python"
}
