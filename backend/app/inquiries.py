"""お問い合わせの入力チェック・保存・一覧（絞り込み・並び替え・ページ分け）・メモ・CSV 出力。"""

from __future__ import annotations

import csv
import io
import json
import re
import sqlite3
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from .db import JST, paginate, utc_now_iso

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PHONE_RE = re.compile(r"^0[0-9]{9,10}$")
# 電話番号から取り除く文字（各種ハイフン・長音・空白・かっこ）
PHONE_STRIP_RE = re.compile(r"[\s\-‐-―−ーｰ()]")

MAX_NAME = 100
MAX_EMAIL = 254

SORTS = {
    "newest": "created_at DESC, id DESC",
    "oldest": "created_at ASC, id ASC",
    "name": "name COLLATE NOCASE ASC, id DESC",
    "updated": "updated_at DESC, id DESC",
}


def to_halfwidth(value: str) -> str:
    """全角の英数字・記号・空白を半角にします。"""
    out = []
    for ch in value:
        code = ord(ch)
        if 0xFF01 <= code <= 0xFF5E:
            out.append(chr(code - 0xFEE0))
        elif code == 0x3000:
            out.append(" ")
        else:
            out.append(ch)
    return "".join(out)


def _text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if isinstance(value, bool) or value is None:
        return ""
    if isinstance(value, (int, float, str)):
        return str(value).strip()
    return ""


def _values(options: dict[str, Any], key: str) -> list[str]:
    return [item["value"] for item in options[key]]


def validate_contact(payload: dict[str, Any], options: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    """入力内容を検証し、(保存用データ, エラー) を返します。"""
    errors: dict[str, str] = {}
    data: dict[str, Any] = {}

    raw_topics = payload.get("topics")
    allowed_topics = _values(options, "topics")
    topics: list[str] = []
    if isinstance(raw_topics, list):
        for item in raw_topics:
            if isinstance(item, str) and item in allowed_topics and item not in topics:
                topics.append(item)
    if not topics:
        errors["topics"] = "ご相談内容を選択してください。"
    data["topics"] = topics

    name = _text(payload, "name")
    if not name:
        errors["name"] = "お名前を入力してください。"
    elif len(name) > MAX_NAME:
        errors["name"] = f"お名前は{MAX_NAME}文字以内で入力してください。"
    data["name"] = name

    email = to_halfwidth(_text(payload, "email")).strip()
    if not email:
        errors["email"] = "メールアドレスを入力してください。"
    elif len(email) > MAX_EMAIL or not EMAIL_RE.match(email):
        errors["email"] = "メールアドレスの形式が正しくありません。"
    data["email"] = email

    phone_input = _text(payload, "phone")
    phone = PHONE_STRIP_RE.sub("", to_halfwidth(phone_input))
    if not phone_input:
        errors["phone"] = "電話番号を入力してください。"
    elif not PHONE_RE.match(phone):
        errors["phone"] = "電話番号の形式が正しくありません（例:09012345678）。"
    data["phone"] = phone

    prefecture = _text(payload, "prefecture")
    if prefecture not in options["prefectures"]:
        errors["prefecture"] = "お住まいを選択してください。"
    data["prefecture"] = prefecture

    age_text = to_halfwidth(_text(payload, "age")).strip()
    age: int | None = None
    if age_text:
        if not age_text.isascii() or not age_text.isdigit():
            errors["age"] = "ご年齢は数字で入力してください。"
        else:
            age = int(age_text)
            if not 1 <= age <= 120:
                errors["age"] = "ご年齢は1〜120の範囲で入力してください。"
    data["age"] = age

    initial_payment = _text(payload, "initial_payment")
    if initial_payment not in _values(options, "initial_payments"):
        errors["initial_payment"] = "初期費用のお支払い方法を選択してください。"
    data["initial_payment"] = initial_payment

    monthly_payment = _text(payload, "monthly_payment")
    if monthly_payment not in _values(options, "monthly_payments"):
        errors["monthly_payment"] = "月額(保守プラン)のお支払い方法を選択してください。"
    data["monthly_payment"] = monthly_payment

    if payload.get("agreed") is not True:
        errors["agreed"] = "「個人情報の取扱い」への同意が必要です。"

    return data, errors


# ------------------------------------------------------------------ 迷惑送信（ブロックリスト）

def is_blocked(conn: sqlite3.Connection, email: str) -> bool:
    address = email.strip().lower()
    for row in conn.execute("SELECT pattern FROM blocklist"):
        pattern = row["pattern"]
        if address == pattern or (pattern.startswith("@") and address.endswith(pattern)):
            return True
    return False


# ------------------------------------------------------------------ 保存・取得

def insert_inquiry(conn: sqlite3.Connection, data: dict[str, Any], is_spam: bool = False) -> int:
    now = utc_now_iso()
    cur = conn.execute(
        """
        INSERT INTO inquiries
            (topics, name, email, phone, prefecture, age, initial_payment, monthly_payment,
             status, is_spam, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)
        """,
        (
            json.dumps(data["topics"]),
            data["name"],
            data["email"],
            data["phone"],
            data["prefecture"],
            data["age"],
            data["initial_payment"],
            data["monthly_payment"],
            1 if is_spam else 0,
            now,
            now,
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    try:
        topics = json.loads(row["topics"])
    except (TypeError, ValueError):
        topics = []
    return {
        "id": row["id"],
        "topics": topics,
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "prefecture": row["prefecture"],
        "age": row["age"],
        "initial_payment": row["initial_payment"],
        "monthly_payment": row["monthly_payment"],
        "status": row["status"],
        "is_spam": bool(row["is_spam"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def jst_date_to_utc_iso(day: date) -> str:
    start = datetime(day.year, day.month, day.day, tzinfo=JST).astimezone(timezone.utc)
    return start.strftime("%Y-%m-%dT%H:%M:%SZ")


@dataclass
class InquiryFilter:
    status: str | None = None
    q: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    spam: bool = False  # True: 迷惑送信だけ / False: 迷惑送信以外
    sort: str = "newest"


def _where(f: InquiryFilter) -> tuple[str, list[Any]]:
    sql = " WHERE is_spam = ?"
    params: list[Any] = [1 if f.spam else 0]
    if f.status:
        sql += " AND status = ?"
        params.append(f.status)
    if f.q:
        sql += (
            " AND (instr(lower(name), lower(?)) > 0 OR instr(lower(email), lower(?)) > 0"
            " OR instr(phone, ?) > 0)"
        )
        params.extend([f.q, f.q, f.q])
    if f.date_from:
        sql += " AND created_at >= ?"
        params.append(jst_date_to_utc_iso(f.date_from))
    if f.date_to:
        sql += " AND created_at < ?"
        params.append(jst_date_to_utc_iso(f.date_to + timedelta(days=1)))
    return sql, params


def list_inquiries(
    conn: sqlite3.Connection, f: InquiryFilter, page: int | None = None, per_page: int = 20
) -> tuple[list[dict[str, Any]], int]:
    where, params = _where(f)
    sql = f"SELECT * FROM inquiries{where} ORDER BY {SORTS.get(f.sort, SORTS['newest'])}"
    if page is None:
        rows = conn.execute(sql, params).fetchall()
        return [row_to_dict(r) for r in rows], len(rows)
    rows, total = paginate(conn, sql, params, page, per_page)
    return [row_to_dict(r) for r in rows], total


def count_by_status(conn: sqlite3.Connection, statuses: list[str]) -> dict[str, int]:
    counts = {s: 0 for s in statuses}
    total = 0
    for row in conn.execute("SELECT status, COUNT(*) AS n FROM inquiries WHERE is_spam = 0 GROUP BY status"):
        total += row["n"]
        if row["status"] in counts:
            counts[row["status"]] = row["n"]
    counts["all"] = total
    counts["spam"] = conn.execute("SELECT COUNT(*) FROM inquiries WHERE is_spam = 1").fetchone()[0]
    return counts


def get_inquiry(conn: sqlite3.Connection, inquiry_id: int) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM inquiries WHERE id = ?", (inquiry_id,)).fetchone()
    return row_to_dict(row) if row else None


def update_inquiry(
    conn: sqlite3.Connection, inquiry_id: int, status: str | None = None, is_spam: bool | None = None
) -> None:
    now = utc_now_iso()
    if status is not None:
        conn.execute("UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ?", (status, now, inquiry_id))
    if is_spam is not None:
        conn.execute(
            "UPDATE inquiries SET is_spam = ?, updated_at = ? WHERE id = ?", (1 if is_spam else 0, now, inquiry_id)
        )
    conn.commit()


def delete_inquiry(conn: sqlite3.Connection, inquiry_id: int) -> None:
    conn.execute("DELETE FROM inquiries WHERE id = ?", (inquiry_id,))
    conn.commit()


# ------------------------------------------------------------------ メモ（タイムライン）

def add_note(conn: sqlite3.Connection, inquiry_id: int, body: str, kind: str = "note") -> dict[str, Any]:
    now = utc_now_iso()
    cur = conn.execute(
        "INSERT INTO inquiry_notes (inquiry_id, kind, body, created_at) VALUES (?, ?, ?, ?)",
        (inquiry_id, kind, body, now),
    )
    conn.execute("UPDATE inquiries SET updated_at = ? WHERE id = ?", (now, inquiry_id))
    conn.commit()
    return {"id": int(cur.lastrowid), "kind": kind, "body": body, "created_at": now}


def list_notes(conn: sqlite3.Connection, inquiry_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, kind, body, created_at FROM inquiry_notes WHERE inquiry_id = ? ORDER BY created_at DESC, id DESC",
        (inquiry_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def delete_note(conn: sqlite3.Connection, inquiry_id: int, note_id: int) -> bool:
    """手入力のメモだけ削除できます（メール送信などの自動の記録は残します）。"""
    cur = conn.execute(
        "DELETE FROM inquiry_notes WHERE id = ? AND inquiry_id = ? AND kind = 'note'", (note_id, inquiry_id)
    )
    conn.commit()
    return cur.rowcount > 0


def list_mails(conn: sqlite3.Connection, inquiry_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT id, kind, to_addr, subject, status, error, created_at, sent_at
        FROM mail_outbox WHERE inquiry_id = ? ORDER BY id DESC
        """,
        (inquiry_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ------------------------------------------------------------------ CSV

def format_jst(iso_utc: str) -> str:
    dt = datetime.strptime(iso_utc, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return dt.astimezone(JST).strftime("%Y/%m/%d %H:%M")


def _safe_cell(value: Any) -> str:
    text = "" if value is None else str(value)
    # Excel で数式として実行されないようにします（CSV インジェクション対策）
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        text = "'" + text
    return text


def build_csv(items: list[dict[str, Any]], options: dict[str, Any]) -> str:
    def labels(key: str) -> dict[str, str]:
        return {o["value"]: o["label"] for o in options[key]}

    topic_labels = labels("topics")
    initial_labels = labels("initial_payments")
    monthly_labels = labels("monthly_payments")
    status_labels = labels("statuses")

    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    writer.writerow([
        "ID", "受付日時", "対応状況", "ご相談内容", "お名前", "メールアドレス", "電話番号",
        "お住まい", "ご年齢", "初期費用のお支払い方法", "月額(保守プラン)のお支払い方法", "最終更新",
    ])
    for item in items:
        writer.writerow([_safe_cell(v) for v in (
            item["id"],
            format_jst(item["created_at"]),
            status_labels.get(item["status"], item["status"]),
            "、".join(topic_labels.get(t, t) for t in item["topics"]),
            item["name"],
            item["email"],
            item["phone"],
            item["prefecture"],
            item["age"],
            initial_labels.get(item["initial_payment"], item["initial_payment"]),
            monthly_labels.get(item["monthly_payment"], item["monthly_payment"]),
            format_jst(item["updated_at"]),
        )])
    # Excel で文字化けしないよう、先頭に BOM を付けます
    return "﻿" + buffer.getvalue()
