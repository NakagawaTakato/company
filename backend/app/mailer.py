"""メール送信（新着通知・自動返信・管理画面からの返信・テスト送信）。

送信方法は2つあり、管理画面の「メール」で切り替えられます。
- Outlook（Microsoft Graph）… 元の Laravel 版と同じ方法。.env の MICROSOFT_CLIENT_ID があるときの標準です。
- SMTP … レンタルサーバーや Gmail などのメールサーバーを使う方法。
送れる状態になっていないときは送信せず、送信履歴に「未送信」として残します。
"""

from __future__ import annotations

import re
import smtplib
import socket
import sqlite3
import ssl
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
METHOD_KEY = "mail.method"
METHODS = ("outlook", "smtp")


class MailError(Exception):
    pass


def smtp_ready(smtp: dict[str, Any]) -> bool:
    return bool(smtp.get("host") and smtp.get("from_address"))


def render(template: str, values: dict[str, str]) -> str:
    """{name} のような差し込み項目を置き換えます（知らない項目はそのまま残します）。"""
    return PLACEHOLDER_RE.sub(lambda m: values.get(m.group(1), m.group(0)), template)


def one_line(text: str) -> str:
    return " ".join(text.split())


# ------------------------------------------------------------------ 送信方法と状態

def method(conn: sqlite3.Connection) -> str:
    stored = settings_store.get_raw(conn, METHOD_KEY)
    if stored in METHODS:
        return stored
    return "outlook" if OUTLOOK.configured else "smtp"


def set_method(conn: sqlite3.Connection, value: str) -> None:
    settings_store.put_raw(conn, METHOD_KEY, value)


def status(conn: sqlite3.Connection) -> dict[str, Any]:
    """いまの送信方法で送れるか（送れないときは理由）。"""
    current = method(conn)
    if current == "outlook":
        if not OUTLOOK.configured:
            return {"method": current, "ready": False, "reason": ".env の MICROSOFT_CLIENT_ID が設定されていないため、Outlook で送れません。"}
        if not outlook.signed_in(OUTLOOK):
            return {"method": current, "ready": False, "reason": "Outlook にまだサインインしていないため、送信していません。管理画面の「メール」でサインインしてください。"}
        return {"method": current, "ready": True, "reason": ""}
    if not smtp_ready(settings_store.get_setting(conn, "smtp")):
        return {"method": current, "ready": False, "reason": "メールの送信設定（SMTP）がされていないため、送信していません。"}
    return {"method": current, "ready": True, "reason": ""}


def sender(conn: sqlite3.Connection) -> tuple[str, str]:
    """差出人（名前, アドレス）"""
    business = settings_store.business(conn)
    if method(conn) == "outlook":
        return (settings.mail_from_name or business["business_name"], settings.mail_from_address or business["email"])
    smtp = settings_store.get_setting(conn, "smtp")
    return (smtp.get("from_name") or business["business_name"], smtp["from_address"])


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


def send_smtp(smtp: dict[str, Any], message: EmailMessage) -> None:
    host, port = smtp["host"], int(smtp.get("port") or 0)
    security = smtp.get("security") or "starttls"
    context = ssl.create_default_context()
    try:
        if security == "ssl":
            client: smtplib.SMTP = smtplib.SMTP_SSL(host, port or 465, timeout=20, context=context)
        else:
            client = smtplib.SMTP(host, port or 587, timeout=20)
        with client:
            client.ehlo()
            if security == "starttls":
                client.starttls(context=context)
                client.ehlo()
            if smtp.get("username"):
                client.login(smtp["username"], smtp.get("password") or "")
            client.send_message(message)
    except smtplib.SMTPAuthenticationError as exc:
        raise MailError("メールサーバーの認証に失敗しました。ユーザー名とパスワードを確認してください。") from exc
    except smtplib.SMTPNotSupportedError as exc:
        raise MailError("メールサーバーが暗号化（STARTTLS）に対応していません。接続方式を確認してください。") from exc
    except (socket.timeout, TimeoutError) as exc:
        raise MailError("メールサーバーへの接続がタイムアウトしました。サーバー名とポートを確認してください。") from exc
    except (OSError, smtplib.SMTPException) as exc:
        raise MailError(f"メールを送信できませんでした（{type(exc).__name__}: {exc}）。") from exc


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
        if state["method"] == "outlook":
            outlook.send_mime(OUTLOOK, message.as_bytes())
        else:
            send_smtp(settings_store.get_setting(conn, "smtp"), message)
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
        f"月額(保守プラン)のお支払い方法: {_label(options, 'monthly_payments', item['monthly_payment'])}",
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
        "■ 月額(保守プラン)のお支払い方法", _label(options, "monthly_payments", item["monthly_payment"]), "",
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
