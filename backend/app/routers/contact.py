"""公開サイト向けの API（お問い合わせ受付・テーマ色とサイト内容・アップロード画像）。"""

from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import FileResponse

from .. import inquiries, mailer, schemas, settings_store, uploads
from ..deps import UPLOAD_DIR, ApiError, client_ip, contact_limiter, get_conn, read_json, settings

router = APIRouter(tags=["公開サイト"])


@router.post(
    "/api/contact",
    status_code=201,
    response_model=schemas.OkResponse,
    responses={**schemas.ERROR_RESPONSES, 429: {"model": schemas.ErrorResponse}},
    openapi_extra=schemas.json_body(schemas.ContactRequest),
    summary="お問い合わせを送信する",
)
async def create_contact(
    request: Request, background: BackgroundTasks, conn: sqlite3.Connection = Depends(get_conn)
) -> dict[str, bool]:
    ip = client_ip(request)
    if contact_limiter.is_limited(ip):
        raise ApiError(429, "送信回数が多すぎます。しばらくしてからお試しください。")
    payload = await read_json(request)

    # 迷惑送信対策: 人には見えない入力欄に値がある場合は、保存せずに成功として返します
    if isinstance(payload.get("website"), str) and payload["website"].strip():
        return {"ok": True}

    data, errors = inquiries.validate_contact(payload, settings.options)
    if errors:
        raise ApiError(422, "入力内容をご確認ください。", errors)

    # ブロックしたアドレスからの送信は「迷惑送信」として保存し、通知メールは送りません
    is_spam = inquiries.is_blocked(conn, data["email"])
    inquiry_id = inquiries.insert_inquiry(conn, data, is_spam=is_spam)
    contact_limiter.hit(ip)

    if not is_spam:
        item = inquiries.get_inquiry(conn, inquiry_id)
        outbox_ids = mailer.queue_new_inquiry_mails(conn, item, settings.options)
        if outbox_ids:
            background.add_task(mailer.deliver_in_background, settings.database_path, outbox_ids)
    return {"ok": True}


@router.get("/api/site", summary="公開サイトのテーマ色とサイト内容")
def site(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {
        "theme": settings_store.get_setting(conn, "theme"),
        "content": settings_store.get_content(conn),
    }


@router.get("/uploads/{name}", include_in_schema=False)
def uploaded_image(name: str) -> FileResponse:
    path = uploads.find_image(UPLOAD_DIR, name)
    if path is None:
        raise ApiError(404, "見つかりません。")
    media_type = uploads.MEDIA_TYPES[path.suffix.lstrip(".")]
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "public, max-age=31536000, immutable"})
