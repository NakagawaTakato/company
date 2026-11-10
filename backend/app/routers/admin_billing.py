"""管理画面の API（見積書・入金と領収書・おまかせ管理プラン）。"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from .. import audit, billing, billing_csv, inquiries, schemas
from ..db import JST, today_jst
from ..deps import PER_PAGE, ApiError, get_conn, page_number, pages, parse_id, require_admin

router = APIRouter(prefix="/api/admin", tags=["管理画面: 見積書・入金・おまかせ管理プラン"], dependencies=[Depends(require_admin)])

ESTIMATE_LABELS = billing_csv.ESTIMATE_LABELS

# CSV は絞り込み条件に合うものをすべて出力します（ページ分けなし）
CSV_LIMIT = 100_000
CSV_RESPONSES = {200: {"content": {"text/csv": {}}, "description": "CSV ファイル"}}


def _csv_response(conn: sqlite3.Connection, name: str, label: str, count: int, text: str) -> Response:
    filename = datetime.now(JST).strftime(f"{name}_%Y%m%d_%H%M%S.csv")
    audit.log(conn, f"{label}を CSV で出力", f"{count} 件")
    return Response(
        content=text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _estimate_status(raw: str | None) -> str | None:
    status = raw or None
    if status and status not in billing.ESTIMATE_STATUSES:
        raise ApiError(400, "状態の指定が正しくありません。")
    return status


def _check_inquiry(conn: sqlite3.Connection, inquiry_id: int | None) -> None:
    if inquiry_id is not None and inquiries.get_inquiry(conn, inquiry_id) is None:
        raise ApiError(422, "入力内容をご確認ください。", {"inquiry_id": "関連するお問い合わせが見つかりません。"})


def _estimate_or_404(conn: sqlite3.Connection, raw_id: str) -> dict[str, Any]:
    estimate = billing.get_estimate(conn, parse_id(raw_id))
    if estimate is None:
        raise ApiError(404, "見積書が見つかりません。")
    return estimate


def _estimate_data(body: schemas.EstimateIn) -> dict[str, Any]:
    data = body.model_dump()
    data["issue_date"] = body.issue_date.isoformat()
    data["valid_until"] = body.valid_until.isoformat()
    return data


# ------------------------------------------------------------------ 見積書

@router.get("/estimates", summary="見積書の一覧")
def list_estimates(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    q = request.query_params
    status = _estimate_status(q.get("status"))
    page = page_number(q.get("page"))
    # 選択肢に使うときは ?per_page=100 までまとめて取得できます
    per_page = min(max(page_number(q.get("per_page")) if q.get("per_page") else PER_PAGE, 1), 100)
    items, total = billing.list_estimates(conn, (q.get("q") or "").strip() or None, status, page, per_page)
    return {"items": items, "total": total, "page": page, "pages": pages(total, per_page), "per_page": per_page}


@router.get(
    "/estimates.csv",
    response_class=Response,
    responses=CSV_RESPONSES,
    summary="見積書を CSV でダウンロード（一覧と同じ絞り込み条件・明細つき）",
)
def export_estimates_csv(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> Response:
    q = request.query_params
    items, _ = billing.list_estimates(
        conn, (q.get("q") or "").strip() or None, _estimate_status(q.get("status")), 1, CSV_LIMIT, with_items=True
    )
    return _csv_response(conn, "estimates", "見積書", len(items), billing_csv.estimates_csv(items))


@router.post("/estimates", status_code=201, summary="見積書を作成")
def create_estimate(body: schemas.EstimateIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    _check_inquiry(conn, body.inquiry_id)
    estimate_id = billing.save_estimate(conn, _estimate_data(body))
    estimate = billing.get_estimate(conn, estimate_id)
    audit.log(conn, "見積書を作成", f"{estimate['number']} {body.customer_name} 様 {estimate['total']:,}円")
    if body.inquiry_id is not None:
        inquiries.add_note(conn, body.inquiry_id, f"見積書 {estimate['number']} を作成（{estimate['total']:,}円）", kind="system")
    return estimate


@router.get("/estimates/{estimate_id}", summary="見積書の詳細（入金の合計と残額つき）")
def get_estimate(estimate_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    estimate = _estimate_or_404(conn, estimate_id)
    payments, _, _ = billing.list_payments(conn, None, 1, 100, estimate_id=estimate["id"])
    return {**estimate, "payments": payments}


@router.put("/estimates/{estimate_id}", summary="見積書を変更")
def update_estimate(estimate_id: str, body: schemas.EstimateIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    current = _estimate_or_404(conn, estimate_id)
    _check_inquiry(conn, body.inquiry_id)
    billing.save_estimate(conn, _estimate_data(body), current["id"])
    estimate = billing.get_estimate(conn, current["id"])
    audit.log(conn, "見積書を変更", f"{estimate['number']}（{ESTIMATE_LABELS[body.status]}） {estimate['total']:,}円")
    return get_estimate(estimate_id, conn)


@router.delete("/estimates/{estimate_id}", response_model=schemas.OkResponse, summary="見積書を削除")
def delete_estimate(estimate_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    estimate = _estimate_or_404(conn, estimate_id)
    billing.delete_estimate(conn, estimate["id"])
    audit.log(conn, "見積書を削除", f"{estimate['number']} {estimate['customer_name']} 様")
    return {"ok": True}


# ------------------------------------------------------------------ 入金・領収書

def _payment_or_404(conn: sqlite3.Connection, raw_id: str) -> dict[str, Any]:
    payment = billing.get_payment(conn, parse_id(raw_id))
    if payment is None:
        raise ApiError(404, "入金の記録が見つかりません。")
    return payment


def _payment_data(conn: sqlite3.Connection, body: schemas.PaymentIn) -> dict[str, Any]:
    if body.estimate_id is not None and billing.get_estimate(conn, body.estimate_id) is None:
        raise ApiError(422, "入力内容をご確認ください。", {"estimate_id": "見積書が見つかりません。"})
    data = body.model_dump()
    data["paid_on"] = body.paid_on.isoformat()
    return data


@router.get("/payments", summary="入金の一覧（期間内の合計つき）")
def list_payments(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    q = request.query_params
    page = page_number(q.get("page"))
    items, total, total_amount = billing.list_payments(conn, (q.get("q") or "").strip() or None, page, PER_PAGE)
    return {
        "items": items, "total": total, "page": page, "pages": pages(total), "per_page": PER_PAGE,
        "total_amount": total_amount,
    }


@router.get(
    "/payments.csv",
    response_class=Response,
    responses=CSV_RESPONSES,
    summary="入金の記録を CSV でダウンロード（一覧と同じ検索条件）",
)
def export_payments_csv(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> Response:
    items, _, _ = billing.list_payments(conn, (request.query_params.get("q") or "").strip() or None, 1, CSV_LIMIT)
    return _csv_response(conn, "payments", "入金の記録", len(items), billing_csv.payments_csv(items))


@router.post("/payments", status_code=201, summary="入金を記録（領収書番号を自動で付けます）")
def create_payment(body: schemas.PaymentIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    payment = billing.get_payment(conn, billing.save_payment(conn, _payment_data(conn, body)))
    audit.log(conn, "入金を記録", f"{payment['receipt_number']} {body.customer_name} 様 {body.amount:,}円")
    return payment


@router.get("/payments/{payment_id}", summary="入金の詳細（領収書の表示用）")
def get_payment(payment_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return _payment_or_404(conn, payment_id)


@router.put("/payments/{payment_id}", summary="入金の記録を変更")
def update_payment(payment_id: str, body: schemas.PaymentIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    current = _payment_or_404(conn, payment_id)
    billing.save_payment(conn, _payment_data(conn, body), current["id"])
    audit.log(conn, "入金の記録を変更", f"{current['receipt_number']} {body.amount:,}円")
    return _payment_or_404(conn, payment_id)


@router.delete("/payments/{payment_id}", response_model=schemas.OkResponse, summary="入金の記録を削除")
def delete_payment(payment_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    payment = _payment_or_404(conn, payment_id)
    billing.delete_payment(conn, payment["id"])
    audit.log(conn, "入金の記録を削除", f"{payment['receipt_number']} {payment['customer_name']} 様")
    return {"ok": True}


# ------------------------------------------------------------------ おまかせ管理プラン

def _contract_or_404(conn: sqlite3.Connection, raw_id: str) -> dict[str, Any]:
    contract = billing.get_contract(conn, parse_id(raw_id))
    if contract is None:
        raise ApiError(404, "おまかせ管理プランが見つかりません。")
    return contract


def _contract_data(body: schemas.ContractIn) -> dict[str, Any]:
    data = body.model_dump()
    for key in ("start_date", "cancel_requested_on", "end_date"):
        data[key] = data[key].isoformat() if data[key] else None
    return data


@router.get("/contracts", summary="おまかせ管理プランの一覧（契約中の月額合計つき）")
def list_contracts(request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    q = request.query_params
    status = q.get("status") or None
    if status and status not in ("active", "cancel_requested", "ended"):
        raise ApiError(400, "状態の指定が正しくありません。")
    items = billing.list_contracts(conn, status, (q.get("q") or "").strip() or None)
    everything = billing.list_contracts(conn, None, None)
    today = today_jst()
    return {
        "items": items,
        "monthly_revenue": sum(
            c["monthly_fee"] for c in everything if c["status"] != "ended" and c["start_date"] <= today
        ),
        "counts": {s: len([c for c in everything if c["status"] == s]) for s in ("active", "cancel_requested", "ended")},
    }


@router.post("/contracts", status_code=201, summary="おまかせ管理プランを登録")
def create_contract(body: schemas.ContractIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    _check_inquiry(conn, body.inquiry_id)
    contract = billing.get_contract(conn, billing.save_contract(conn, _contract_data(body)))
    audit.log(conn, "おまかせ管理プランを登録", f"{body.customer_name} 様 {body.site_name} 月額{body.monthly_fee:,}円")
    if body.inquiry_id is not None:
        inquiries.add_note(conn, body.inquiry_id, f"おまかせ管理プラン「{body.site_name}」を登録", kind="system")
    return contract


@router.get("/contracts/{contract_id}", summary="おまかせ管理プランの詳細")
def get_contract(contract_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return _contract_or_404(conn, contract_id)


@router.put("/contracts/{contract_id}", summary="おまかせ管理プランを変更")
def update_contract(contract_id: str, body: schemas.ContractIn, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    current = _contract_or_404(conn, contract_id)
    _check_inquiry(conn, body.inquiry_id)
    billing.save_contract(conn, _contract_data(body), current["id"])
    audit.log(conn, "おまかせ管理プランを変更", f"{body.customer_name} 様 {body.site_name}")
    return _contract_or_404(conn, contract_id)


@router.post("/contracts/{contract_id}/cancel", summary="解約の申し出を登録（終了日は申し出日の翌月末）")
def request_cancel(contract_id: str, body: schemas.CancelRequest, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    contract = _contract_or_404(conn, contract_id)
    requested_on = body.requested_on or date.fromisoformat(today_jst())
    billing.request_cancel(conn, contract["id"], requested_on)
    updated = _contract_or_404(conn, contract_id)
    audit.log(conn, "おまかせ管理プランの解約申し出を登録", f"{contract['customer_name']} 様 {contract['site_name']}（{updated['end_date']} で終了）")
    return updated


@router.delete("/contracts/{contract_id}", response_model=schemas.OkResponse, summary="おまかせ管理プランを削除")
def delete_contract(contract_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, bool]:
    contract = _contract_or_404(conn, contract_id)
    billing.delete_contract(conn, contract["id"])
    audit.log(conn, "おまかせ管理プランを削除", f"{contract['customer_name']} 様 {contract['site_name']}")
    return {"ok": True}
