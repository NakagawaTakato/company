"""ルーター共通の処理（設定・DB 接続・ログイン確認・エラー応答）。"""

from __future__ import annotations

import json
import os
import sqlite3
from collections.abc import Iterator
from typing import Any

from fastapi import Depends, Request

from . import db, outlook, security
from .config import load_settings

settings = load_settings()
# Outlook（Microsoft Graph）で送るためのサインイン情報の保存先は、データベースと同じ data フォルダです
OUTLOOK = outlook.OutlookConfig(
    settings.microsoft_client_id, settings.microsoft_tenant, settings.database_path.parent / "microsoft-oauth.json"
)
STATUS_VALUES = [s["value"] for s in settings.options["statuses"]]
STATUS_LABELS = {s["value"]: s["label"] for s in settings.options["statuses"]}
UPLOAD_DIR = settings.database_path.parent / "uploads"
PER_PAGE = 20

login_limiter = security.RateLimiter(max_events=10, window_seconds=15 * 60)
# お問い合わせは同じ IP アドレスから10分に10件まで（テスト時は BLUETAB_CONTACT_LIMIT で変更できます）
contact_limiter = security.RateLimiter(
    max_events=int(os.environ.get("BLUETAB_CONTACT_LIMIT", "10")), window_seconds=10 * 60
)


class ApiError(Exception):
    """{"message": ..., "errors": {...}} の形で返すエラー。"""

    def __init__(self, status_code: int, message: str, errors: dict[str, str] | None = None) -> None:
        self.status_code = status_code
        self.message = message
        self.errors = errors


def get_conn() -> Iterator[sqlite3.Connection]:
    conn = db.connect(settings.database_path)
    try:
        yield conn
    finally:
        conn.close()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def read_json(request: Request) -> dict[str, Any]:
    try:
        payload = json.loads(await request.body())
    except (ValueError, UnicodeDecodeError):
        payload = None
    if not isinstance(payload, dict):
        raise ApiError(400, "リクエストの形式が正しくありません。")
    return payload


def require_admin(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> sqlite3.Row:
    token = request.cookies.get(security.SESSION_COOKIE)
    admin = security.get_session_admin(conn, token) if token else None
    if admin is None:
        raise ApiError(401, "ログインしてください。")
    return admin


def page_number(raw: str | None) -> int:
    """?page= の値（1 以上の整数。おかしな値は 1 ページ目として扱います）。"""
    if raw and raw.isascii() and raw.isdigit() and 0 < int(raw) < 100000:
        return int(raw)
    return 1


def parse_id(raw: str, message: str = "見つかりません。") -> int:
    if not raw.isascii() or not raw.isdigit() or len(raw) > 12:
        raise ApiError(404, message)
    return int(raw)


def pages(total: int, per_page: int = PER_PAGE) -> int:
    return max(1, -(-total // per_page))
