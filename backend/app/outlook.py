"""Outlook（Microsoft Graph）でメールを送る仕組み（元の Laravel 版と同じ方法）。

- Azure に登録したアプリ（.env の MICROSOFT_CLIENT_ID / MICROSOFT_TENANT）を使います。
- 最初の1回だけ「デバイスコード」でサインインします（管理画面の「メール」、または
  `python -m app.outlook_login`）。サインインすると、トークンを data/microsoft-oauth.json に保存します。
- 送信は Graph API の /me/sendMail に、メールを MIME 形式のまま渡します（件名・本文・返信先がそのまま届きます）。
- Outlook.com は SMTP のパスワード認証を廃止しているため、この方法を使います。
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCOPE = "offline_access https://graph.microsoft.com/Mail.Send"
# テストでは偽のサーバーに向けられるよう、接続先を環境変数で変えられるようにしています
LOGIN_BASE = os.environ.get("MICROSOFT_LOGIN_URL", "https://login.microsoftonline.com").rstrip("/")
GRAPH_BASE = os.environ.get("MICROSOFT_GRAPH_URL", "https://graph.microsoft.com").rstrip("/")
TIMEOUT = 30

_lock = threading.Lock()


class OutlookError(Exception):
    pass


@dataclass(frozen=True)
class OutlookConfig:
    client_id: str
    tenant: str
    token_path: Path

    @property
    def configured(self) -> bool:
        return bool(self.client_id)


def _url(config: OutlookConfig, endpoint: str) -> str:
    return f"{LOGIN_BASE}/{urllib.parse.quote(config.tenant)}/oauth2/v2.0/{endpoint}"


def _post_form(url: str, data: dict[str, str]) -> tuple[int, dict[str, Any]]:
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(data).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read() or b"{}")
        except ValueError:
            return error.code, {}
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise OutlookError(f"Microsoft のサーバーに接続できませんでした（{error}）。") from error


def _require_client_id(config: OutlookConfig) -> None:
    if not config.configured:
        raise OutlookError(".env の MICROSOFT_CLIENT_ID が設定されていません。")


# ------------------------------------------------------------------ サインイン（デバイスコード）

def request_device_code(config: OutlookConfig) -> dict[str, Any]:
    """サインイン用のコードを発行します。"""
    _require_client_id(config)
    status, body = _post_form(_url(config, "devicecode"), {"client_id": config.client_id, "scope": SCOPE})
    if status >= 400 or "device_code" not in body:
        raise OutlookError(f"サインイン用のコードを発行できませんでした。（{body.get('error_description') or body.get('error') or status}）")
    return body


def poll_device_login(config: OutlookConfig, device_code: str) -> str:
    """ブラウザでのサインインが終わったかを1回確認します。
    戻り値: "ok"（サインイン完了・トークン保存済み）/ "pending"（まだ）/ "slow_down"（確認の間隔を空ける）
    """
    status, body = _post_form(
        _url(config, "token"),
        {
            "client_id": config.client_id,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": device_code,
        },
    )
    if status < 400 and "access_token" in body:
        _store(config, body)
        return "ok"
    error = body.get("error")
    if error in ("authorization_pending", "slow_down"):
        return "pending" if error == "authorization_pending" else "slow_down"
    if error == "expired_token":
        raise OutlookError("サインインの有効期限が切れました。もう一度やり直してください。")
    if error == "authorization_declined":
        raise OutlookError("サインインがキャンセルされました。もう一度やり直してください。")
    raise OutlookError(f"サインインできませんでした。（{body.get('error_description') or error or status}）")


def wait_for_device_login(config: OutlookConfig, device: dict[str, Any]) -> None:
    """ブラウザでのサインインが終わるまで待ちます（コマンドから使います）。"""
    interval = int(device.get("interval", 5))
    deadline = time.time() + int(device.get("expires_in", 900))
    while time.time() < deadline:
        time.sleep(interval)
        result = poll_device_login(config, device["device_code"])
        if result == "ok":
            return
        if result == "slow_down":
            interval += 5
    raise OutlookError("サインインの有効期限が切れました。もう一度やり直してください。")


def signed_in(config: OutlookConfig) -> bool:
    return config.token_path.is_file()


def sign_out(config: OutlookConfig) -> None:
    with _lock:
        config.token_path.unlink(missing_ok=True)


# ------------------------------------------------------------------ トークン

def _store(config: OutlookConfig, response: dict[str, Any], previous_refresh: str | None = None) -> dict[str, Any]:
    token = {
        "access_token": response["access_token"],
        # 新しいリフレッシュトークンが返ってこなかったときは、今のものを使い続けます
        "refresh_token": response.get("refresh_token") or previous_refresh,
        "expires_at": int(time.time()) + int(response.get("expires_in", 3600)),
    }
    config.token_path.parent.mkdir(parents=True, exist_ok=True)
    temp = config.token_path.with_suffix(".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as file:
        json.dump(token, file)
    os.replace(temp, config.token_path)
    return token


def _load(config: OutlookConfig) -> dict[str, Any]:
    if not signed_in(config):
        raise OutlookError("Outlook にまだサインインしていません。管理画面の「メール」でサインインしてください。")
    try:
        return json.loads(config.token_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise OutlookError("保存したサインイン情報を読み込めませんでした。サインインし直してください。") from error


def access_token(config: OutlookConfig) -> str:
    """有効なアクセストークンを返します（期限切れが近ければ更新します）。"""
    _require_client_id(config)
    with _lock:
        token = _load(config)
        if int(token.get("expires_at", 0)) - 60 > time.time():
            return token["access_token"]
        status, body = _post_form(
            _url(config, "token"),
            {
                "client_id": config.client_id,
                "grant_type": "refresh_token",
                "refresh_token": token["refresh_token"],
                "scope": SCOPE,
            },
        )
        if status >= 400 or "access_token" not in body:
            raise OutlookError(
                "Outlook の認証を更新できませんでした。管理画面の「メール」でサインインし直してください。"
                f"（{body.get('error_description') or body.get('error') or status}）"
            )
        return _store(config, body, token["refresh_token"])["access_token"]


# ------------------------------------------------------------------ 送信

def send_mime(config: OutlookConfig, mime: bytes) -> None:
    """MIME 形式のメールを、サインインしている Outlook アカウントから送ります。"""
    token = access_token(config)
    request = urllib.request.Request(
        f"{GRAPH_BASE}/v1.0/me/sendMail",
        data=base64.b64encode(mime),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "text/plain"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT):
            return
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:300]
        raise OutlookError(f"Outlook での送信に失敗しました。（{error.code} {detail}）") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise OutlookError(f"Outlook（Microsoft Graph）に接続できませんでした（{error}）。") from error
