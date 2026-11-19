"""メール送信（新着通知・自動返信・管理画面からの返信・テスト送信）。

送信は Outlook（Microsoft Graph）だけを使います。.env の MICROSOFT_CLIENT_ID を設定し、
管理画面の「メール」で Outlook にサインインすると送れるようになります。
送れる状態になっていないときは送信せず、送信履歴に「未送信」として残します。
"""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path
from typing import Any

from . import db, outlook, settings_store
from .db import JST, utc_now_iso
from .deps import OUTLOOK, settings

PLACEHOLDER_RE = re.compile(r"\{(\w+)\}")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class MailError(Exception):
    pass


def render(template: str, values: dict[str, str]) -> str:
    """{name} のような差し込み項目を置き換えます（知らない項目はそのまま残します）。"""
    return PLACEHOLDER_RE.sub(lambda m: values.get(m.group(1), m.group(0)), template)


def one_line(text: str) -> str:
    return " ".join(text.split())


# ------------------------------------------------------------------ 送れる状態か

def status(conn: sqlite3.Connection) -> dict[str, Any]:
    """Outlook で送れるか（送れないときは理由）。"""
    if not OUTLOOK.configured:
        return {"ready": False, "reason": ".env の MICROSOFT_CLIENT_ID が設定されていないため、Outlook で送れません。"}
    if not outlook.signed_in(OUTLOOK):
        return {"ready": False, "reason": "Outlook にまだサインインしていないため、送信していません。管理画面の「メール」でサインインしてください。"}
    return {"ready": True, "reason": ""}


def sender(conn: sqlite3.Connection) -> tuple[str, str]:
    """差出人（名前, アドレス）。.env の MAIL_FROM_NAME / MAIL_FROM_ADDRESS、なければ事業者情報。"""
    business = settings_store.business(conn)
    return (settings.mail_from_name or business["business_name"], settings.mail_from_address or business["email"])


# ------------------------------------------------------------------ 送信

def build_message(from_name: str, from_address: str, to: str, subject: str, body: str, reply_to: str = "") -> EmailMessage:
    if not EMAIL_RE.match(to):
        raise MailError(f"送信先のメールアドレスが正しくありません: {to}")
    message = EmailMessage()
    message["Subject"] = one_line(subject)
    message["From"] = formataddr((one_line(from_name), from_address))
    message["To"] = to
    if reply_to and EMAIL_RE.match(reply_to):
        message["Reply-To"] = reply_to
    message["Message-ID"] = make_msgid(domain=from_address.split("@")[-1] or "localhost")
    message.set_content(body)
    return message


# ------------------------------------------------------------------ 送信履歴

def record(
    conn: sqlite3.Connection,
    kind: str,
    to: str,
    subject: str,
    body: str,
    inquiry_id: int | None = None,
    reply_to: str = "",
) -> int:
    cur = conn.execute(
        """
        INSERT INTO mail_outbox (inquiry_id, kind, to_addr, subject, body, status, reply_to, created_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
        """,
        (inquiry_id, kind, to, subject, body, reply_to, utc_now_iso()),
    )
    conn.commit()
    return int(cur.lastrowid)


def _mark(conn: sqlite3.Connection, outbox_id: int, state: str, error: str = "") -> None:
    sent_at = utc_now_iso() if state == "sent" else None
    conn.execute(
        "UPDATE mail_outbox SET status = ?, error = ?, sent_at = ? WHERE id = ?", (state, error, sent_at, outbox_id)
    )
    conn.commit()


def deliver(conn: sqlite3.Connection, outbox_id: int) -> tuple[bool, str]:
    """送信履歴の1件を送信し、結果を記録します。戻り値: (送れたか, エラー文)"""
    row = conn.execute("SELECT * FROM mail_outbox WHERE id = ?", (outbox_id,)).fetchone()
    state = status(conn)
    if not state["ready"]:
        _mark(conn, outbox_id, "skipped", state["reason"])
        return False, state["reason"]
    try:
        from_name, from_address = sender(conn)
        message = build_message(from_name, from_address, row["to_addr"], row["subject"], row["body"], row["reply_to"])
        outlook.send_mime(OUTLOOK, message.as_bytes())
    except (MailError, outlook.OutlookError) as exc:
        _mark(conn, outbox_id, "failed", str(exc))
        return False, str(exc)
    _mark(conn, outbox_id, "sent")
    return True, ""


def deliver_in_background(database_path: Path, outbox_ids: list[int]) -> None:
    """お問い合わせの受付後に、裏で送信します（BackgroundTasks から呼びます）。"""
    conn = db.connect(database_path)
    try:
        for outbox_id in outbox_ids:
            deliver(conn, outbox_id)
    finally:
        conn.close()


# ------------------------------------------------------------------ 本文の材料

def base_values(conn: sqlite3.Connection) -> dict[str, str]:
    info = settings_store.business(conn)
    return {
        "business_name": info["business_name"],
        "owner": info["owner"],
        "business_email": info["email"],
        "business_phone": info["phone"],
        "hours": info["hours"],
    }


def _label(options: dict[str, Any], key: str, value: str) -> str:
    return next((o["label"] for o in options[key] if o["value"] == value), value)


def inquiry_summary(item: dict[str, Any], options: dict[str, Any]) -> str:
    topics = "、".join(_label(options, "topics", t) for t in item["topics"])
    lines = [
        f"ご相談内容: {topics}",
        f"お名前: {item['name']}",
        f"メールアドレス: {item['email']}",
        f"電話番号: {item['phone']}",
        f"お住まい: {item['prefecture']}",
        f"ご年齢: {item['age'] if item.get('age') is not None else '未入力'}",
        f"初期費用のお支払い方法: {_label(options, 'initial_payments', item['initial_payment'])}",
        f"月額(おまかせ管理プラン)のお支払い方法: {_label(options, 'monthly_payments', item['monthly_payment'])}",
    ]
    return "\n".join(lines)


def admin_notification(item: dict[str, Any], options: dict[str, Any], site_url: str) -> tuple[str, str]:
    """新着通知の件名と本文（元の Laravel 版のお問い合わせメールと同じ形）。"""
    received = (
        datetime.strptime(item["created_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).astimezone(JST)
    )
    topics = "、".join(_label(options, "topics", t) for t in item["topics"])
    body = "\n".join([
        "お問い合わせフォームから、新しいお問い合わせが届きました。",
        "このメールに返信すると、お客さまのメールアドレス宛てに送られます。",
        "",
        "■ ご相談内容", topics, "",
        "■ お名前", item["name"], "",
        "■ メールアドレス", item["email"], "",
        "■ 電話番号", item["phone"], "",
        "■ お住まい", item["prefecture"], "",
        "■ ご年齢", str(item["age"]) if item.get("age") is not None else "(未入力)", "",
        "■ 初期費用のお支払い方法", _label(options, "initial_payments", item["initial_payment"]), "",
        "■ 月額(おまかせ管理プラン)のお支払い方法", _label(options, "monthly_payments", item["monthly_payment"]), "",
        "■ 受付日時", f"{received.year}年{received.month}月{received.day}日 {received:%H:%M}", "",
        f"管理画面で確認する: {site_url.rstrip('/')}/admin/inquiries/{item['id']}",
        "",
    ])
    return f"【お問い合わせ】{item['name']} 様", body


def queue_new_inquiry_mails(
    conn: sqlite3.Connection, item: dict[str, Any], options: dict[str, Any]
) -> list[int]:
    """新着通知（管理者あて）と自動返信（お客さまあて）を送信履歴に登録します。"""
    notify = settings_store.get_setting(conn, "notifications")
    values = {**base_values(conn), "name": item["name"], "inquiry_summary": inquiry_summary(item, options)}
    ids: list[int] = []

    if notify["admin_notify"]:
        recipients = [a for a in notify["admin_to"] if a] or [values["business_email"]]
        subject, body = admin_notification(item, options, notify["site_url"])
        for to in recipients:
            # 返信先をお客さまにしておくと、通知メールにそのまま返信できます
            ids.append(record(conn, "admin_notify", to, subject, body, item["id"], reply_to=item["email"]))

    if notify["auto_reply"]:
        ids.append(
            record(
                conn,
                "auto_reply",
                item["email"],
                render(notify["auto_reply_subject"], values),
                render(notify["auto_reply_body"], values),
                item["id"],
            )
        )
    return ids
