"""AI Nova サイトの FastAPI バックエンド（API 専用・ポート 8000）。

画面（React）は frontend/ を Vite で別に起動し、.env.fastapi の接続先からこの API を呼び出します。
API の説明ページ: http://127.0.0.1:8000/api/docs
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import audit, db, maintenance, schemas, security, settings_store
from .db import utc_now_iso
from .deps import ApiError, settings
from .routers import admin, admin_billing, admin_manage, contact

logger = logging.getLogger("bluetab")
RETENTION_INTERVAL_SECONDS = 24 * 60 * 60


def run_retention_once() -> None:
    """設定で有効になっていれば、古いお問い合わせを削除します。"""
    conn = db.connect(settings.database_path)
    try:
        rule = settings_store.get_setting(conn, "retention")
        if not rule["enabled"]:
            return
        count = maintenance.run_retention(conn, rule, dry_run=False)
        settings_store.put_raw(conn, "retention.last_run", {"at": utc_now_iso(), "deleted": count})
        if count:
            audit.log(conn, "古いお問い合わせを削除（自動）", f"{count} 件")
    finally:
        conn.close()


async def retention_loop() -> None:
    await asyncio.sleep(10)
    while True:
        try:
            await asyncio.to_thread(run_retention_once)
        except Exception:  # 自動削除に失敗してもサーバーは止めません
            logger.exception("自動削除に失敗しました")
        await asyncio.sleep(RETENTION_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db(settings.database_path)
    conn = db.connect(settings.database_path)
    try:
        security.sync_admin(conn, settings.admin_email, settings.admin_password)
        security.purge_expired_sessions(conn)
    finally:
        conn.close()
    task = asyncio.create_task(retention_loop())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


app = FastAPI(
    title="AI Nova API (FastAPI)",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)


@app.exception_handler(ApiError)
async def handle_api_error(_: Request, exc: ApiError) -> JSONResponse:
    body: dict[str, Any] = {"message": exc.message}
    if exc.errors:
        body["errors"] = exc.errors
    return JSONResponse(body, status_code=exc.status_code)


def _japanese_message(error: dict[str, Any]) -> str:
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    if kind == "missing":
        return "入力してください。"
    if kind == "string_too_short":
        return "入力してください。" if ctx.get("min_length", 1) <= 1 else f"{ctx['min_length']}文字以上で入力してください。"
    if kind == "string_too_long":
        return f"{ctx.get('max_length')}文字以内で入力してください。"
    if kind == "too_short":
        return f"{ctx.get('min_length')}件以上入力してください。"
    if kind == "too_long":
        return f"{ctx.get('max_length')}件以内にしてください。"
    if kind in ("int_parsing", "int_from_float", "float_parsing", "int_type", "float_type"):
        return "数値で入力してください。"
    if kind == "greater_than_equal":
        return f"{ctx.get('ge')}以上で入力してください。"
    if kind == "greater_than":
        return f"{ctx.get('gt')}より大きい値で入力してください。"
    if kind == "less_than_equal":
        return f"{ctx.get('le')}以下で入力してください。"
    if kind.startswith("date"):
        return "日付の形式が正しくありません（例: 2026-10-27）。"
    if kind in ("literal_error", "enum"):
        return "選択肢から選んでください。"
    if kind in ("bool_parsing", "bool_type"):
        return "はい・いいえで指定してください。"
    if kind in ("string_type", "list_type", "dict_type", "model_type", "model_attributes_type"):
        return "形式が正しくありません。"
    if kind == "value_error":
        return str(error.get("msg", "")).removeprefix("Value error, ")
    return "入力内容が正しくありません。"


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    errors: dict[str, str] = {}
    for error in exc.errors():
        if error.get("type") == "json_invalid":
            return JSONResponse({"message": "リクエストの形式が正しくありません。"}, status_code=400)
        location = [str(part) for part in error.get("loc", ()) if part not in ("body",)]
        errors.setdefault(".".join(location) or "body", _japanese_message(error))
    return JSONResponse({"message": "入力内容をご確認ください。", "errors": errors}, status_code=422)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# 画面（Vite の開発サーバー）から Cookie 付きで API を呼べるようにします。
# 最後に追加したミドルウェアが一番外側になるので、エラー応答にも CORS ヘッダーが付きます。
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Accept"],
    expose_headers=["Content-Disposition"],
)

app.include_router(contact.router)
app.include_router(admin.router)
app.include_router(admin_manage.router)
app.include_router(admin_billing.router)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"name": "AI Nova API", "backend": "fastapi", "docs": "/api/docs"}


@app.get("/api/health", response_model=schemas.HealthResponse, tags=["共通"], summary="動作確認")
def health() -> dict[str, str]:
    return {"status": "ok", "backend": "fastapi"}


@app.api_route("/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def not_found(rest: str) -> None:
    raise ApiError(404, "見つかりません。")
