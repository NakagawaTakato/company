"""見積書・入金（領収書）・おまかせ管理プラン。

- 金額は円（整数）。明細の金額は「数量 × 単価」を四捨五入、消費税は切り捨てです。
- 見積番号は Q-年月-連番、領収書番号は R-年月-連番 で自動採番します。
- おまかせ管理プランの解約は「前月末までのお申し出」なので、申し出日の翌月末を終了日にします。
"""

from __future__ import annotations

import calendar
import sqlite3
from datetime import date, datetime
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from typing import Any

from .db import JST, paginate, today_jst, utc_now_iso

ESTIMATE_STATUSES = ("draft", "sent", "accepted", "rejected")
PAYMENT_METHODS = ("cash", "card", "bank")


def next_number(conn: sqlite3.Connection, table: str, column: str, prefix: str) -> str:
    base = f"{prefix}-{datetime.now(JST).strftime('%Y%m')}-"
    numbers = [
        int(row[0][len(base):])
        for row in conn.execute(f"SELECT {column} FROM {table} WHERE {column} LIKE ?", (base + "%",))
        if row[0][len(base):].isdigit()
    ]
    return f"{base}{(max(numbers) + 1 if numbers else 1):03d}"


# ------------------------------------------------------------------ 見積書

def line_amount(quantity: float, unit_price: int) -> int:
    value = Decimal(str(quantity)) * Decimal(unit_price)
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def totals(items: list[dict[str, Any]], tax_rate: int) -> dict[str, int]:
    subtotal = sum(line_amount(i["quantity"], i["unit_price"]) for i in items)
    tax = int((Decimal(subtotal) * Decimal(tax_rate) / Decimal(100)).quantize(Decimal("1"), rounding=ROUND_DOWN))
    return {"subtotal": subtotal, "tax": tax, "total": subtotal + tax}


def _estimate_items(conn: sqlite3.Connection, estimate_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT description, quantity, unit, unit_price FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order",
        (estimate_id,),
    ).fetchall()
    items = []
    for r in rows:
        quantity = r["quantity"]
        items.append({
            "description": r["description"],
            "quantity": int(quantity) if float(quantity).is_integer() else quantity,
            "unit": r["unit"],
            "unit_price": r["unit_price"],
            "amount": line_amount(quantity, r["unit_price"]),
        })
    return items


def _paid_total(conn: sqlite3.Connection, estimate_id: int) -> int:
    return conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE estimate_id = ?", (estimate_id,)
    ).fetchone()[0]


def _estimate_dict(conn: sqlite3.Connection, row: sqlite3.Row, with_items: bool) -> dict[str, Any]:
    items = _estimate_items(conn, row["id"])
    result = {k: row[k] for k in row.keys()}
    result.update(totals(items, row["tax_rate"]))
    result["paid"] = _paid_total(conn, row["id"])
    result["balance"] = result["total"] - result["paid"]
    if with_items:
        result["items"] = items
    return result


def save_estimate(conn: sqlite3.Connection, data: dict[str, Any], estimate_id: int | None = None) -> int:
    now = utc_now_iso()
    fields = (
        data["customer_name"], data["title"], data["issue_date"], data["valid_until"], data["delivery"],
        data["payment_terms"], data["notes"], data["tax_rate"], data["status"], data.get("inquiry_id"),
    )
    if estimate_id is None:
        cur = conn.execute(
            """
            INSERT INTO estimates
                (customer_name, title, issue_date, valid_until, delivery, payment_terms, notes, tax_rate, status,
                 inquiry_id, number, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*fields, next_number(conn, "estimates", "number", "Q"), now, now),
        )
        estimate_id = int(cur.lastrowid)
    else:
        conn.execute(
            """
            UPDATE estimates SET customer_name = ?, title = ?, issue_date = ?, valid_until = ?, delivery = ?,
                payment_terms = ?, notes = ?, tax_rate = ?, status = ?, inquiry_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (*fields, now, estimate_id),
        )
        conn.execute("DELETE FROM estimate_items WHERE estimate_id = ?", (estimate_id,))
    conn.executemany(
        """
        INSERT INTO estimate_items (estimate_id, description, quantity, unit, unit_price, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (estimate_id, i["description"], i["quantity"], i["unit"], i["unit_price"], n)
            for n, i in enumerate(data["items"])
        ],
    )
    conn.commit()
    return estimate_id


def get_estimate(conn: sqlite3.Connection, estimate_id: int) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM estimates WHERE id = ?", (estimate_id,)).fetchone()
    return _estimate_dict(conn, row, with_items=True) if row else None


def list_estimates(
    conn: sqlite3.Connection, q: str | None, status: str | None, page: int, per_page: int = 20, inquiry_id: int | None = None,
    with_items: bool = False,
) -> tuple[list[dict[str, Any]], int]:
    sql = "SELECT * FROM estimates WHERE 1 = 1"
    params: list[Any] = []
    if q:
        sql += " AND (instr(lower(customer_name), lower(?)) > 0 OR instr(lower(title), lower(?)) > 0 OR instr(number, ?) > 0)"
        params.extend([q, q, q])
    if status:
        sql += " AND status = ?"
        params.append(status)
    if inquiry_id is not None:
        sql += " AND inquiry_id = ?"
        params.append(inquiry_id)
    sql += " ORDER BY issue_date DESC, id DESC"
    rows, total = paginate(conn, sql, params, page, per_page)
    return [_estimate_dict(conn, r, with_items=with_items) for r in rows], total


def delete_estimate(conn: sqlite3.Connection, estimate_id: int) -> None:
    conn.execute("DELETE FROM estimates WHERE id = ?", (estimate_id,))
    conn.commit()


# ------------------------------------------------------------------ 入金・領収書

def save_payment(conn: sqlite3.Connection, data: dict[str, Any], payment_id: int | None = None) -> int:
    now = utc_now_iso()
    fields = (
        data.get("estimate_id"), data["customer_name"], data["description"], data["amount"], data["method"],
        data["paid_on"], data["note"],
    )
    if payment_id is None:
        cur = conn.execute(
            """
            INSERT INTO payments
                (estimate_id, customer_name, description, amount, method, paid_on, note, receipt_number,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*fields, next_number(conn, "payments", "receipt_number", "R"), now, now),
        )
        payment_id = int(cur.lastrowid)
    else:
        conn.execute(
            """
            UPDATE payments SET estimate_id = ?, customer_name = ?, description = ?, amount = ?, method = ?,
                paid_on = ?, note = ?, updated_at = ?
            WHERE id = ?
            """,
            (*fields, now, payment_id),
        )
    conn.commit()
    return payment_id


def _payment_dict(conn: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    result = {k: row[k] for k in row.keys()}
    estimate = None
    if row["estimate_id"] is not None:
        e = conn.execute("SELECT id, number, title FROM estimates WHERE id = ?", (row["estimate_id"],)).fetchone()
        estimate = dict(e) if e else None
    result["estimate"] = estimate
    return result


def get_payment(conn: sqlite3.Connection, payment_id: int) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM payments WHERE id = ?", (payment_id,)).fetchone()
    return _payment_dict(conn, row) if row else None


def list_payments(
    conn: sqlite3.Connection, q: str | None, page: int, per_page: int = 20, estimate_id: int | None = None
) -> tuple[list[dict[str, Any]], int, int]:
    sql = "SELECT * FROM payments WHERE 1 = 1"
    params: list[Any] = []
    if q:
        sql += " AND (instr(lower(customer_name), lower(?)) > 0 OR instr(lower(description), lower(?)) > 0 OR instr(receipt_number, ?) > 0)"
        params.extend([q, q, q])
    if estimate_id is not None:
        sql += " AND estimate_id = ?"
        params.append(estimate_id)
    total_amount = conn.execute(f"SELECT COALESCE(SUM(amount), 0) FROM ({sql})", params).fetchone()[0]
    sql += " ORDER BY paid_on DESC, id DESC"
    rows, total = paginate(conn, sql, params, page, per_page)
    return [_payment_dict(conn, r) for r in rows], total, total_amount


def delete_payment(conn: sqlite3.Connection, payment_id: int) -> None:
    conn.execute("DELETE FROM payments WHERE id = ?", (payment_id,))
    conn.commit()


# ------------------------------------------------------------------ おまかせ管理プラン

def end_of_next_month(day: date) -> date:
    year, month = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    return date(year, month, calendar.monthrange(year, month)[1])


def contract_status(row: dict[str, Any], today: str) -> str:
    if row.get("end_date") and row["end_date"] < today:
        return "ended"
    if row.get("cancel_requested_on"):
        return "cancel_requested"
    return "active"


def _contract_dict(row: sqlite3.Row, today: str) -> dict[str, Any]:
    result = {k: row[k] for k in row.keys()}
    result["status"] = contract_status(result, today)
    return result


def save_contract(conn: sqlite3.Connection, data: dict[str, Any], contract_id: int | None = None) -> int:
    now = utc_now_iso()
    fields = (
        data.get("inquiry_id"), data["customer_name"], data["email"], data["site_name"], data["site_url"],
        data["monthly_fee"], data["start_date"], data.get("cancel_requested_on"), data.get("end_date"), data["note"],
    )
    if contract_id is None:
        cur = conn.execute(
            """
            INSERT INTO contracts
                (inquiry_id, customer_name, email, site_name, site_url, monthly_fee, start_date,
                 cancel_requested_on, end_date, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*fields, now, now),
        )
        contract_id = int(cur.lastrowid)
    else:
        conn.execute(
            """
            UPDATE contracts SET inquiry_id = ?, customer_name = ?, email = ?, site_name = ?, site_url = ?,
                monthly_fee = ?, start_date = ?, cancel_requested_on = ?, end_date = ?, note = ?, updated_at = ?
            WHERE id = ?
            """,
            (*fields, now, contract_id),
        )
    conn.commit()
    return contract_id


def get_contract(conn: sqlite3.Connection, contract_id: int) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM contracts WHERE id = ?", (contract_id,)).fetchone()
    return _contract_dict(row, today_jst()) if row else None


def list_contracts(
    conn: sqlite3.Connection, status: str | None, q: str | None, inquiry_id: int | None = None
) -> list[dict[str, Any]]:
    sql = "SELECT * FROM contracts WHERE 1 = 1"
    params: list[Any] = []
    if q:
        sql += " AND (instr(lower(customer_name), lower(?)) > 0 OR instr(lower(site_name), lower(?)) > 0)"
        params.extend([q, q])
    if inquiry_id is not None:
        sql += " AND inquiry_id = ?"
        params.append(inquiry_id)
    sql += " ORDER BY start_date DESC, id DESC"
    today = today_jst()
    items = [_contract_dict(r, today) for r in conn.execute(sql, params).fetchall()]
    return [i for i in items if not status or i["status"] == status]


def request_cancel(conn: sqlite3.Connection, contract_id: int, requested_on: date) -> None:
    conn.execute(
        "UPDATE contracts SET cancel_requested_on = ?, end_date = ?, updated_at = ? WHERE id = ?",
        (requested_on.isoformat(), end_of_next_month(requested_on).isoformat(), utc_now_iso(), contract_id),
    )
    conn.commit()


def delete_contract(conn: sqlite3.Connection, contract_id: int) -> None:
    conn.execute("DELETE FROM contracts WHERE id = ?", (contract_id,))
    conn.commit()
