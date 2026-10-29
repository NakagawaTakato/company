"""管理画面の API（ダッシュボード・履歴・データ管理・デザイン・サイト内容・メール・迷惑送信）。"""

from __future__ import annotations

import secrets
import shutil
import sqlite3
import threading
import time
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from .. import audit, dashboard, mailer, maintenance, outlook, schemas, settings_store, uploads
from ..db import JST, paginate, utc_now_iso
from ..deps import (
    OUTLOOK,
    PER_PAGE,
    STATUS_VALUES,
    UPLOAD_DIR,
    ApiError,
    get_conn,
    page_number,
    pages,
    parse_id,
    require_admin,
    settings,
)

router = APIRouter(prefix="/api/admin", tags=["管理画面: 設定・履歴・データ"], dependencies=[Depends(require_admin)])


def _page_result(rows: list[Any], total: int, page: int) -> dict[str, Any]:
    return {"items": [dict(r) for r in rows], "total": total, "page": page, "pages": pages(total), "per_page": PER_PAGE}


# ------------------------------------------------------------------ ダッシュボード・履歴

@router.get("/dashboard", summary="ダッシュボードの集計")
def get_dashboard(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return dashboard.summary(conn, STATUS_VALUES)


@router.get("/login-history", summary="ログイン履歴")
def login_history(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    page = page_number(request.query_params.get("page"))
    rows, total = paginate(conn, "SELECT * FROM login_history ORDER BY id DESC", [], page, PER_PAGE)
    return _page_result(rows, total, page)


@router.get("/audit-logs", summary="操作の記録")
def audit_logs(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    page = page_number(request.query_params.get("page"))
    rows, total = paginate(conn, "SELECT * FROM audit_logs ORDER BY id DESC", [], page, PER_PAGE)
    return _page_result(rows, total, page)


# ------------------------------------------------------------------ データ管理

@router.get("/backup", summary="バックアップ（データベースと画像の zip）をダウンロード")
def backup(conn: sqlite3.Connection = Depends(get_conn)) -> FileResponse:
    archive = maintenance.create_backup(settings.database_path, UPLOAD_DIR)
    audit.log(conn, "バックアップをダウンロード")
    filename = datetime.now(JST).strftime("katachi-backup-%Y%m%d-%H%M%S.zip")
    return FileResponse(
        archive,
        media_type="application/zip",
        filename=filename,
        background=BackgroundTask(shutil.rmtree, archive.parent, ignore_errors=True),
    )


@router.get("/retention", summary="個人情報の自動削除の設定")
def get_retention(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    rule = settings_store.get_setting(conn, "retention")
    return {**rule, "targets": len(maintenance.retention_targets(conn, rule)), "last_run": settings_store.get_raw(conn, "retention.last_run")}


@router.put("/retention", summary="個人情報の自動削除の設定を保存")
def put_retention(body: schemas.RetentionUpdate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if any(s not in STATUS_VALUES for s in body.statuses):
        raise ApiError(422, "入力内容をご確認ください。", {"statuses": "対応状況を選択してください。"})
    settings_store.put_setting(conn, "retention", body.model_dump())
    audit.log(conn, "自動削除の設定を変更", f"{'有効' if body.enabled else '無効'} / {body.months}か月 / 迷惑送信 {body.spam_days}日")
    return get_retention(conn)


@router.post("/retention/run", summary="自動削除を今すぐ実行（dry_run=true なら件数の確認だけ）")
def run_retention(body: schemas.RetentionRun, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, int]:
    rule = settings_store.get_setting(conn, "retention")
    count = maintenance.run_retention(conn, rule, body.dry_run)
    if not body.dry_run:
        settings_store.put_raw(conn, "retention.last_run", {"at": utc_now_iso(), "deleted": count})
        audit.log(conn, "古いお問い合わせを削除（手動）", f"{count} 件")
    return {"count": count}


# ------------------------------------------------------------------ デザイン（テーマ色）

@router.get("/theme", summary="テーマ色")
def get_theme(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {**settings_store.get_setting(conn, "theme"), "default_color": settings_store.SITE_DEFAULTS["theme"]["primary_color"]}


@router.put("/theme", summary="テーマ色を変更（公開サイトに反映）")
def put_theme(body: schemas.ThemeUpdate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    settings_store.put_setting(conn, "theme", {"primary_color": body.primary_color})
    audit.log(conn, "テーマ色を変更", body.primary_color)
    return get_theme(conn)


# ------------------------------------------------------------------ サイト内容

SECTION_LABELS = {
    "business": "事業者情報",
    "prices": "料金の目安",
    "faq": "よくある質問",
    "works": "制作実績",
    "other_works": "そのほかの制作物",
    "testimonials": "お客さまの声",
}


@router.get("/content", summary="サイト内容（保存していない項目は初期値）")
def get_content(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    customized = {
        section: settings_store.get_raw(conn, f"content.{section}") is not None
        for section in settings_store.CONTENT_SECTIONS
    }
    return {"content": settings_store.get_content(conn), "customized": customized}


def _save_section(conn: sqlite3.Connection, section: str, value: Any) -> dict[str, Any]:
    settings_store.put_content(conn, section, value)
    audit.log(conn, "サイト内容を変更", SECTION_LABELS[section])
    return get_content(conn)


@router.put("/content/business", summary="事業者情報を保存")
def put_business(body: schemas.BusinessIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return _save_section(conn, "business", body.model_dump())


@router.put("/content/prices", summary="料金の目安を保存")
def put_prices(body: schemas.PricesIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return _save_section(conn, "prices", body.model_dump())


@router.put("/content/faq", summary="よくある質問を保存")
def put_faq(body: list[schemas.FaqItem], conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if len(body) > 50:
        raise ApiError(422, "入力内容をご確認ください。", {"body": "よくある質問は50件以内にしてください。"})
    return _save_section(conn, "faq", [i.model_dump() for i in body])


@router.put("/content/works", summary="制作実績を保存")
def put_works(body: list[schemas.WorkItem], conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if len(body) > 20:
        raise ApiError(422, "入力内容をご確認ください。", {"body": "制作実績は20件以内にしてください。"})
    return _save_section(conn, "works", [i.model_dump() for i in body])


@router.put("/content/other_works", summary="そのほかの制作物を保存")
def put_other_works(body: list[schemas.OtherWork], conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if len(body) > 40:
        raise ApiError(422, "入力内容をご確認ください。", {"body": "そのほかの制作物は40件以内にしてください。"})
    return _save_section(conn, "other_works", [i.value for i in body])


@router.put("/content/testimonials", summary="お客さまの声を保存")
def put_testimonials(body: list[schemas.Testimonial], conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if len(body) > 50:
        raise ApiError(422, "入力内容をご確認ください。", {"body": "お客さまの声は50件以内にしてください。"})
    return _save_section(conn, "testimonials", [i.model_dump() for i in body])


@router.delete("/content/{section}", summary="サイト内容を初期値に戻す")
def reset_section(section: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if section not in settings_store.CONTENT_SECTIONS:
        raise ApiError(404, "見つかりません。")
    settings_store.reset_content(conn, section)
    audit.log(conn, "サイト内容を初期値に戻す", SECTION_LABELS[section])
    return get_content(conn)


@router.post("/uploads", status_code=201, summary="画像をアップロード（本文に画像ファイルをそのまま送ります）")
async def upload_image(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > uploads.MAX_BYTES:
        raise ApiError(413, "画像は5MB以下にしてください。")
    data = await request.body()
    if len(data) > uploads.MAX_BYTES:
        raise ApiError(413, "画像は5MB以下にしてください。")
    try:
        name = uploads.save_image(UPLOAD_DIR, data)
    except ValueError as exc:
        raise ApiError(422, str(exc)) from None
    audit.log(conn, "画像をアップロード", name)
    return {"url": f"/uploads/{name}"}


# ------------------------------------------------------------------ メール

def _mail_settings(conn: sqlite3.Connection) -> dict[str, Any]:
    smtp = settings_store.get_setting(conn, "smtp")
    password_set = bool(smtp.pop("password"))
    business_email = settings_store.business(conn)["email"]
    return {
        **mailer.status(conn),  # method / ready / reason
        "smtp": {**smtp, "password_set": password_set, "ready": mailer.smtp_ready(smtp)},
        "outlook": {
            "configured": OUTLOOK.configured,
            "signed_in": outlook.signed_in(OUTLOOK),
            "tenant": OUTLOOK.tenant,
            "from_address": settings.mail_from_address or business_email,
        },
        "notifications": settings_store.get_setting(conn, "notifications"),
        "business_email": business_email,
    }


@router.get("/mail/settings", summary="メールの送信設定と通知の設定（パスワードは返しません）")
def get_mail_settings(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return _mail_settings(conn)


@router.put("/mail/method", summary="送信方法を切り替える（outlook / smtp）")
def put_mail_method(body: schemas.MailMethodUpdate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    mailer.set_method(conn, body.method)
    audit.log(conn, "メールの送信方法を変更", "Outlook（Microsoft Graph）" if body.method == "outlook" else "SMTP")
    return _mail_settings(conn)


# Outlook のサインイン（デバイスコード）。device_code は画面に渡さず、ここで預かります
_device_flows: dict[str, dict[str, Any]] = {}
_device_lock = threading.Lock()


@router.post("/mail/outlook/device-code", summary="Outlook にサインインするためのコードを発行")
def outlook_device_code() -> dict[str, Any]:
    try:
        device = outlook.request_device_code(OUTLOOK)
    except outlook.OutlookError as exc:
        raise ApiError(400, str(exc)) from None
    flow_id = secrets.token_urlsafe(16)
    with _device_lock:
        now = time.time()
        for key in [k for k, v in _device_flows.items() if v["expires_at"] < now]:
            del _device_flows[key]
        _device_flows[flow_id] = {"device_code": device["device_code"], "expires_at": now + int(device.get("expires_in", 900))}
    return {
        "flow_id": flow_id,
        "user_code": device["user_code"],
        "verification_uri": device["verification_uri"],
        "expires_in": int(device.get("expires_in", 900)),
        "interval": int(device.get("interval", 5)),
    }


@router.post("/mail/outlook/poll", summary="Outlook のサインインが終わったか確認")
def outlook_poll(body: schemas.OutlookPoll, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    with _device_lock:
        flow = _device_flows.get(body.flow_id)
    if flow is None or flow["expires_at"] < time.time():
        raise ApiError(400, "サインインの有効期限が切れました。もう一度やり直してください。")
    try:
        result = outlook.poll_device_login(OUTLOOK, flow["device_code"])
    except outlook.OutlookError as exc:
        with _device_lock:
            _device_flows.pop(body.flow_id, None)
        raise ApiError(400, str(exc)) from None
    if result == "ok":
        with _device_lock:
            _device_flows.pop(body.flow_id, None)
        audit.log(conn, "Outlook にサインイン")
        return {"status": "ok", "settings": _mail_settings(conn)}
    return {"status": result}


@router.post("/mail/outlook/logout", summary="Outlook のサインインを解除")
def outlook_logout(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    outlook.sign_out(OUTLOOK)
    audit.log(conn, "Outlook のサインインを解除")
    return _mail_settings(conn)


@router.put("/mail/smtp", summary="メールの送信設定（SMTP）を保存")
def put_smtp(body: schemas.SmtpUpdate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    current = settings_store.get_setting(conn, "smtp")
    value = body.model_dump()
    if body.password is None:
        value["password"] = current["password"]  # 入力がなければ今のパスワードのまま
    settings_store.put_setting(conn, "smtp", value)
    audit.log(conn, "メールの送信設定を変更", f"{body.host}:{body.port}")
    return _mail_settings(conn)


@router.put("/mail/notifications", summary="新着通知・自動返信の設定を保存")
def put_notifications(body: schemas.NotificationsUpdate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    settings_store.put_setting(conn, "notifications", body.model_dump())
    audit.log(conn, "通知・自動返信の設定を変更")
    return _mail_settings(conn)


@router.post("/mail/test", summary="テストメールを送る")
def send_test(body: schemas.TestMailRequest, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    name = settings_store.business(conn)["business_name"]
    outbox_id = mailer.record(
        conn,
        "test",
        body.to,
        f"【{name}】テストメール",
        "管理画面からのテストメールです。\nこのメールが届いていれば、送信設定は正しく動いています。\n",
    )
    sent, error = mailer.deliver(conn, outbox_id)
    if not sent:
        raise ApiError(400, error)
    audit.log(conn, "テストメールを送信", body.to)
    return {"ok": True}


@router.get("/mail/outbox", summary="メールの送信履歴")
def outbox(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    page = page_number(request.query_params.get("page"))
    rows, total = paginate(
        conn,
        """
        SELECT m.id, m.inquiry_id, m.kind, m.to_addr, m.subject, m.status, m.error, m.created_at, m.sent_at,
               i.name AS inquiry_name
        FROM mail_outbox m LEFT JOIN inquiries i ON i.id = m.inquiry_id
        ORDER BY m.id DESC
        """,
        [],
        page,
        PER_PAGE,
    )
    return _page_result(rows, total, page)


@router.post("/mail/outbox/{outbox_id}/retry", summary="送れなかったメールを送り直す")
def retry(outbox_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    row = conn.execute("SELECT status FROM mail_outbox WHERE id = ?", (parse_id(outbox_id),)).fetchone()
    if row is None:
        raise ApiError(404, "見つかりません。")
    if row["status"] == "sent":
        raise ApiError(400, "このメールは送信済みです。")
    sent, error = mailer.deliver(conn, int(outbox_id))
    if not sent:
        raise ApiError(400, error)
    audit.log(conn, "メールを送り直し", f"送信履歴 #{outbox_id}")
    return {"ok": True}


@router.delete("/mail/outbox/{outbox_id}", response_model=schemas.OkResponse, summary="送信履歴からメールの記録を削除")
def delete_outbox_mail(outbox_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    oid = parse_id(outbox_id)
    row = conn.execute("SELECT to_addr, subject, status FROM mail_outbox WHERE id = ?", (oid,)).fetchone()
    if row is None:
        raise ApiError(404, "見つかりません。")
    # 送信中のものは、送信の処理とぶつからないよう、終わるまで削除できません
    if row["status"] == "pending":
        raise ApiError(400, "送信中のメールは削除できません。少し待ってから、もう一度お試しください。")
    conn.execute("DELETE FROM mail_outbox WHERE id = ?", (oid,))
    conn.commit()
    audit.log(conn, "送信履歴のメールを削除", f"#{oid} {row['to_addr']}「{row['subject']}」")
    return {"ok": True}


# ------------------------------------------------------------------ 返信テンプレート

@router.get("/templates", summary="返信テンプレートの一覧")
def list_templates(conn: sqlite3.Connection = Depends(get_conn)) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute("SELECT * FROM reply_templates ORDER BY id")]


@router.post("/templates", status_code=201, summary="返信テンプレートを追加")
def create_template(body: schemas.TemplateIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    now = utc_now_iso()
    cur = conn.execute(
        "INSERT INTO reply_templates (name, subject, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (body.name, body.subject, body.body, now, now),
    )
    conn.commit()
    audit.log(conn, "返信テンプレートを追加", body.name)
    return dict(conn.execute("SELECT * FROM reply_templates WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.put("/templates/{template_id}", summary="返信テンプレートを変更")
def update_template(template_id: str, body: schemas.TemplateIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    tid = parse_id(template_id)
    cur = conn.execute(
        "UPDATE reply_templates SET name = ?, subject = ?, body = ?, updated_at = ? WHERE id = ?",
        (body.name, body.subject, body.body, utc_now_iso(), tid),
    )
    conn.commit()
    if cur.rowcount == 0:
        raise ApiError(404, "テンプレートが見つかりません。")
    audit.log(conn, "返信テンプレートを変更", body.name)
    return dict(conn.execute("SELECT * FROM reply_templates WHERE id = ?", (tid,)).fetchone())


@router.delete("/templates/{template_id}", response_model=schemas.OkResponse, summary="返信テンプレートを削除")
def delete_template(template_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    tid = parse_id(template_id)
    row = conn.execute("SELECT name FROM reply_templates WHERE id = ?", (tid,)).fetchone()
    if row is None:
        raise ApiError(404, "テンプレートが見つかりません。")
    conn.execute("DELETE FROM reply_templates WHERE id = ?", (tid,))
    conn.commit()
    audit.log(conn, "返信テンプレートを削除", row["name"])
    return {"ok": True}


# ------------------------------------------------------------------ 迷惑送信（ブロックリスト）

@router.get("/blocklist", summary="ブロックしているメールアドレス・ドメイン")
def list_blocklist(conn: sqlite3.Connection = Depends(get_conn)) -> list[dict[str, Any]]:
    return [dict(r) for r in conn.execute("SELECT * FROM blocklist ORDER BY id DESC")]


@router.post("/blocklist", status_code=201, summary="メールアドレス・ドメインをブロック")
def add_block(body: schemas.BlockIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if conn.execute("SELECT 1 FROM blocklist WHERE pattern = ?", (body.pattern,)).fetchone():
        raise ApiError(422, "入力内容をご確認ください。", {"pattern": "すでにブロックしています。"})
    cur = conn.execute(
        "INSERT INTO blocklist (pattern, note, created_at) VALUES (?, ?, ?)", (body.pattern, body.note, utc_now_iso())
    )
    conn.commit()
    audit.log(conn, "ブロックに追加", body.pattern)
    return dict(conn.execute("SELECT * FROM blocklist WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.delete("/blocklist/{block_id}", response_model=schemas.OkResponse, summary="ブロックを解除")
def delete_block(block_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    bid = parse_id(block_id)
    row = conn.execute("SELECT pattern FROM blocklist WHERE id = ?", (bid,)).fetchone()
    if row is None:
        raise ApiError(404, "見つかりません。")
    conn.execute("DELETE FROM blocklist WHERE id = ?", (bid,))
    conn.commit()
    audit.log(conn, "ブロックを解除", row["pattern"])
    return {"ok": True}
