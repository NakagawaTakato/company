"""管理画面から変更できる設定の保存と読み出し（settings 表、値は JSON）。

保存されていない項目は、ここの初期値（サイト内容は shared/site_defaults.json）を使います。
"""

from __future__ import annotations

import copy
import json
import sqlite3
from typing import Any

from .config import ROOT_DIR
from .db import utc_now_iso

SITE_DEFAULTS: dict[str, Any] = json.loads(
    (ROOT_DIR / "shared" / "site_defaults.json").read_text(encoding="utf-8")
)

CONTENT_SECTIONS = ("business", "prices", "faq", "works", "other_works", "testimonials")

DEFAULT_AUTO_REPLY_SUBJECT = "【{business_name}】お問い合わせを受け付けました"
DEFAULT_AUTO_REPLY_BODY = """{name} 様

{business_name}です。
このたびはお問い合わせいただき、ありがとうございます。
以下の内容で受け付けました。内容を確認して、ご連絡いたします。

{inquiry_summary}

※ このメールは自動でお送りしています。
※ お心当たりのない場合は、お手数ですがこのメールを破棄してください。

――――――――――――――――
{business_name}
メール: {business_email}
電話: {business_phone}
対応時間: {hours}
"""

DEFAULTS: dict[str, Any] = {
    "theme": SITE_DEFAULTS["theme"],
    "smtp": {
        "host": "",
        "port": 587,
        "security": "starttls",  # starttls / ssl / none
        "username": "",
        "password": "",
        "from_address": "",
        "from_name": SITE_DEFAULTS["business"]["business_name"],
    },
    "notifications": {
        "admin_notify": True,
        "admin_to": [],  # 空のときは事業者情報のメールアドレスに送ります
        "auto_reply": True,
        "auto_reply_subject": DEFAULT_AUTO_REPLY_SUBJECT,
        "auto_reply_body": DEFAULT_AUTO_REPLY_BODY,
        "site_url": "http://127.0.0.1:5173",  # 通知メール内の管理画面リンクに使います
    },
    "retention": {
        "enabled": False,
        "months": 24,  # 対応が終わってからこの月数が過ぎた問い合わせを削除
        "statuses": ["done", "declined"],
        "spam_days": 30,  # 迷惑送信はこの日数が過ぎたら削除
    },
}


def _load(conn: sqlite3.Connection, key: str) -> Any:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else None


def _save(conn: sqlite3.Connection, key: str, value: Any) -> None:
    conn.execute(
        """
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (key, json.dumps(value, ensure_ascii=False), utc_now_iso()),
    )
    conn.commit()


def get_setting(conn: sqlite3.Connection, key: str) -> dict[str, Any]:
    value = copy.deepcopy(DEFAULTS[key])
    stored = _load(conn, key)
    if isinstance(stored, dict):
        value.update({k: v for k, v in stored.items() if k in value})
    return value


def put_setting(conn: sqlite3.Connection, key: str, value: dict[str, Any]) -> None:
    _save(conn, key, value)


def get_raw(conn: sqlite3.Connection, key: str) -> Any:
    return _load(conn, key)


def put_raw(conn: sqlite3.Connection, key: str, value: Any) -> None:
    _save(conn, key, value)


# ------------------------------------------------------------------ サイト内容

def get_content(conn: sqlite3.Connection) -> dict[str, Any]:
    content: dict[str, Any] = {}
    for section in CONTENT_SECTIONS:
        stored = _load(conn, f"content.{section}")
        content[section] = stored if stored is not None else copy.deepcopy(SITE_DEFAULTS[section])
    # あとから増えた事業者情報の項目（登録番号など）は、保存済みのデータに無くても初期値で補います。
    content["business"] = {**SITE_DEFAULTS["business"], **content["business"]}
    return content


def put_content(conn: sqlite3.Connection, section: str, value: Any) -> None:
    _save(conn, f"content.{section}", value)


def reset_content(conn: sqlite3.Connection, section: str) -> None:
    conn.execute("DELETE FROM settings WHERE key = ?", (f"content.{section}",))
    conn.commit()


def business(conn: sqlite3.Connection) -> dict[str, str]:
    return get_content(conn)["business"]
