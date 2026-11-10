"""管理画面の API（ログイン・パスワード変更・お問い合わせ）。"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from .. import audit, billing, inquiries, mailer, schemas, security
from ..deps import (
    PER_PAGE,
    STATUS_LABELS,
    STATUS_VALUES,
    ApiError,
    client_ip,
    get_conn,
    login_limiter,
    page_number,
    pages,
    parse_id,
    read_json,
    require_admin,
    settings,
)

router = APIRouter(prefix="/api/admin", tags=["管理画面: ログイン・お問い合わせ"])

NOT_FOUND = "お問い合わせが見つかりません。"


def _status(raw: str | None) -> str | None:
    if not raw or raw == "all":
        return None
    if raw not in STATUS_VALUES:
        raise ApiError(400, "対応状況の指定が正しくありません。")
    return raw


def _date(raw: str | None, label: str) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ApiError(400, f"{label}の日付の形式が正しくありません（例: 2026-10-27）。") from None


def _filter(request: Request) -> inquiries.InquiryFilter:
    q = request.query_params
    sort = q.get("sort") or "newest"
    if sort not in inquiries.SORTS:
        raise ApiError(400, "並び順の指定が正しくありません。")
    return inquiries.InquiryFilter(
        status=_status(q.get("status")),
        q=(q.get("q") or "").strip() or None,
        date_from=_date(q.get("from"), "開始"),
        date_to=_date(q.get("to"), "終了"),
        spam=q.get("spam") in ("1", "true"),
        sort=sort,
    )


def _get_or_404(conn: sqlite3.Connection, raw_id: str) -> dict[str, Any]:
    item = inquiries.get_inquiry(conn, parse_id(raw_id, NOT_FOUND))
    if item is None:
        raise ApiError(404, NOT_FOUND)
    return item


# ------------------------------------------------------------------ ログイン

@router.post(
    "/login",
    response_model=schemas.AdminResponse,
    responses={**schemas.ERROR_RESPONSES, **schemas.AUTH_RESPONSES, 429: {"model": schemas.ErrorResponse}},
    openapi_extra=schemas.json_body(schemas.LoginRequest),
    summary="ログインする（Cookie が発行されます）",
)
async def login(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> JSONResponse:
    ip = client_ip(request)
    if login_limiter.is_limited(ip):
        raise ApiError(429, "ログインの試行回数が多すぎます。しばらくしてからお試しください。")
    payload = await read_json(request)
    email = payload.get("email") if isinstance(payload.get("email"), str) else ""
    password = payload.get("password") if isinstance(payload.get("password"), str) else ""
    if not email.strip() or not password:
        raise ApiError(422, "メールアドレスとパスワードを入力してください。")

    user_agent = request.headers.get("user-agent", "")
    admin = security.authenticate(conn, email, password)
    security.record_login(conn, email, admin is not None, ip, user_agent)
    if admin is None:
        login_limiter.hit(ip)
        raise ApiError(401, "メールアドレスまたはパスワードが正しくありません。")

    login_limiter.reset(ip)
    token = security.create_session(conn, admin["id"])
    response = JSONResponse({"email": admin["email"]})
    response.set_cookie(
        security.SESSION_COOKIE,
        token,
        max_age=security.SESSION_TTL_SECONDS,
        path="/api",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )
    return response


@router.post("/logout", response_model=schemas.OkResponse, summary="ログアウトする")
def logout(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> JSONResponse:
    token = request.cookies.get(security.SESSION_COOKIE)
    if token:
        security.delete_session(conn, token)
    response = JSONResponse({"ok": True})
    response.delete_cookie(
        security.SESSION_COOKIE, path="/api", httponly=True, secure=settings.cookie_secure, samesite="strict"
    )
    return response


@router.get("/me", response_model=schemas.AdminResponse, responses=schemas.AUTH_RESPONSES, summary="ログイン中の管理者")
def me(admin: sqlite3.Row = Depends(require_admin)) -> dict[str, str]:
    return {"email": admin["email"]}


@router.post("/password", response_model=schemas.OkResponse, summary="パスワードを変更する")
def change_password(
    body: schemas.PasswordChange,
    request: Request,
    admin: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, bool]:
    if not security.verify_password(body.current_password, security.current_password_hash(conn, admin["id"])):
        raise ApiError(422, "入力内容をご確認ください。", {"current_password": "今のパスワードが正しくありません。"})
    problem = security.password_problem(body.new_password)
    if problem:
        raise ApiError(422, "入力内容をご確認ください。", {"new_password": problem})
    security.change_password(conn, admin["id"], body.new_password, request.cookies.get(security.SESSION_COOKIE, ""))
    audit.log(conn, "パスワードを変更", "ほかの端末のログインは無効にしました")
    return {"ok": True}


# ------------------------------------------------------------------ お問い合わせ

@router.get("/inquiries", responses=schemas.AUTH_RESPONSES, summary="お問い合わせの一覧（絞り込み・並び替え・ページ分け）")
def list_inquiries(
    request: Request,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    f = _filter(request)
    page = page_number(request.query_params.get("page"))
    items, total = inquiries.list_inquiries(conn, f, page, PER_PAGE)
    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": pages(total),
        "per_page": PER_PAGE,
        "counts": inquiries.count_by_status(conn, STATUS_VALUES),
    }


@router.get(
    "/inquiries.csv",
    response_class=Response,
    responses={**schemas.AUTH_RESPONSES, 200: {"content": {"text/csv": {}}, "description": "CSV ファイル"}},
    summary="お問い合わせを CSV でダウンロード（一覧と同じ絞り込み条件・Excel 用の BOM 付き UTF-8）",
)
def export_csv(
    request: Request,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> Response:
    items, _total = inquiries.list_inquiries(conn, _filter(request))
    filename = datetime.now(inquiries.JST).strftime("inquiries_%Y%m%d_%H%M%S.csv")
    audit.log(conn, "お問い合わせを CSV で出力", f"{len(items)} 件")
    return Response(
        content=inquiries.build_csv(items, settings.options).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/inquiries/{inquiry_id}", responses=schemas.AUTH_RESPONSES, summary="お問い合わせの詳細（メモ・送信メール・関連する見積書とおまかせ管理プラン）")
def get_inquiry(
    inquiry_id: str,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    item = _get_or_404(conn, inquiry_id)
    estimates, _ = billing.list_estimates(conn, None, None, 1, 50, inquiry_id=item["id"])
    return {
        **item,
        "notes": inquiries.list_notes(conn, item["id"]),
        "mails": inquiries.list_mails(conn, item["id"]),
        "estimates": [
            {k: e[k] for k in ("id", "number", "title", "total", "status", "issue_date")} for e in estimates
        ],
        "contracts": [
            {k: c[k] for k in ("id", "site_name", "monthly_fee", "status", "start_date")}
            for c in billing.list_contracts(conn, None, None, inquiry_id=item["id"])
        ],
    }


@router.patch("/inquiries/{inquiry_id}", responses=schemas.AUTH_RESPONSES, summary="対応状況・迷惑送信の印を変更する")
def update_inquiry(
    inquiry_id: str,
    body: schemas.InquiryUpdate,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    item = _get_or_404(conn, inquiry_id)
    if body.status is not None and body.status not in STATUS_VALUES:
        raise ApiError(422, "対応状況の指定が正しくありません。", {"status": "対応状況を選択してください。"})
    inquiries.update_inquiry(conn, item["id"], status=body.status, is_spam=body.is_spam)
    if body.status is not None and body.status != item["status"]:
        change = f"対応状況を「{STATUS_LABELS[item['status']]}」から「{STATUS_LABELS[body.status]}」に変更"
        inquiries.add_note(conn, item["id"], change, kind="system")
        audit.log(conn, "対応状況を変更", f"#{item['id']} {item['name']} 様: {STATUS_LABELS[body.status]}")
    if body.is_spam is not None and body.is_spam != item["is_spam"]:
        label = "迷惑送信にしました" if body.is_spam else "迷惑送信から戻しました"
        inquiries.add_note(conn, item["id"], label, kind="system")
        audit.log(conn, label, f"#{item['id']} {item['name']} 様")
    return get_inquiry(str(item["id"]), _, conn)


@router.delete("/inquiries/{inquiry_id}", response_model=schemas.OkResponse, summary="お問い合わせを削除する")
def delete_inquiry(
    inquiry_id: str,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, bool]:
    item = _get_or_404(conn, inquiry_id)
    inquiries.delete_inquiry(conn, item["id"])
    audit.log(conn, "お問い合わせを削除", f"#{item['id']} {item['name']} 様（{item['email']}）")
    return {"ok": True}


@router.post("/inquiries/{inquiry_id}/notes", status_code=201, summary="対応メモを追加する")
def add_note(
    inquiry_id: str,
    body: schemas.NoteCreate,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    item = _get_or_404(conn, inquiry_id)
    return inquiries.add_note(conn, item["id"], body.body)


@router.delete("/inquiries/{inquiry_id}/notes/{note_id}", response_model=schemas.OkResponse, summary="対応メモを削除する")
def delete_note(
    inquiry_id: str,
    note_id: str,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, bool]:
    item = _get_or_404(conn, inquiry_id)
    if not inquiries.delete_note(conn, item["id"], parse_id(note_id)):
        raise ApiError(404, "メモが見つかりません。")
    return {"ok": True}


@router.post("/inquiries/{inquiry_id}/reply", summary="お客さまにメールで返信する")
def reply(
    inquiry_id: str,
    body: schemas.ReplyRequest,
    _: sqlite3.Row = Depends(require_admin),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    item = _get_or_404(conn, inquiry_id)
    outbox_id = mailer.record(conn, "reply", item["email"], body.subject, body.body, item["id"])
    sent, error = mailer.deliver(conn, outbox_id)
    if not sent:
        raise ApiError(400, error)
    inquiries.add_note(conn, item["id"], f"メールで返信しました\n件名: {body.subject}\n\n{body.body}", kind="email")
    if item["status"] == "new":
        inquiries.update_inquiry(conn, item["id"], status="in_progress")
        inquiries.add_note(conn, item["id"], "返信したため、対応状況を「対応中」に変更", kind="system")
    audit.log(conn, "メールで返信", f"#{item['id']} {item['name']} 様: {body.subject}")
    return get_inquiry(str(item["id"]), _, conn)
