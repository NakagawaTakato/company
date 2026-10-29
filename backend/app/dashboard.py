"""ダッシュボードの集計。"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta, timezone
from typing import Any

from . import billing, inquiries
from .db import JST, today_jst


def _month_start(day: date, back: int = 0) -> date:
    year, month = day.year, day.month - back
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


def summary(conn: sqlite3.Connection, statuses: list[str]) -> dict[str, Any]:
    today = datetime.now(JST).date()
    this_month = _month_start(today)
    last_month = _month_start(today, 1)
    first_month = _month_start(today, 11)

    def count_between(start: date, end: date | None) -> int:
        sql = "SELECT COUNT(*) FROM inquiries WHERE is_spam = 0 AND created_at >= ?"
        params: list[Any] = [inquiries.jst_date_to_utc_iso(start)]
        if end:
            sql += " AND created_at < ?"
            params.append(inquiries.jst_date_to_utc_iso(end))
        return conn.execute(sql, params).fetchone()[0]

    # 月ごとの件数（直近12か月、日本時間で集計）
    rows = conn.execute(
        """
        SELECT strftime('%Y-%m', created_at, '+9 hours') AS month, COUNT(*) AS n
        FROM inquiries WHERE is_spam = 0 AND created_at >= ?
        GROUP BY month
        """,
        (inquiries.jst_date_to_utc_iso(first_month),),
    ).fetchall()
    by_month = {r["month"]: r["n"] for r in rows}
    monthly = []
    for back in range(11, -1, -1):
        month = _month_start(today, back).strftime("%Y-%m")
        monthly.append({"month": month, "count": by_month.get(month, 0)})

    recent = conn.execute(
        "SELECT * FROM inquiries WHERE is_spam = 0 AND status = 'new' ORDER BY created_at DESC, id DESC LIMIT 5"
    ).fetchall()

    today_text = today_jst()
    contracts = billing.list_contracts(conn, None, None)
    live_contracts = [c for c in contracts if c["status"] != "ended"]

    payments_this_month = conn.execute(
        "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE paid_on >= ?", (this_month.isoformat(),)
    ).fetchone()[0]

    outstanding = 0
    for row in conn.execute("SELECT id FROM estimates WHERE status = 'accepted'"):
        estimate = billing.get_estimate(conn, row["id"])
        if estimate and estimate["balance"] > 0:
            outstanding += estimate["balance"]

    since = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    mail_problems = conn.execute(
        "SELECT COUNT(*) FROM mail_outbox WHERE status IN ('failed', 'skipped') AND created_at >= ?", (since,)
    ).fetchone()[0]

    logins = conn.execute(
        "SELECT ip, created_at FROM login_history WHERE success = 1 ORDER BY id DESC LIMIT 2"
    ).fetchall()
    previous_login = dict(logins[1]) if len(logins) > 1 else None

    return {
        "counts": inquiries.count_by_status(conn, statuses),
        "this_month": count_between(this_month, None),
        "last_month": count_between(last_month, this_month),
        "monthly": monthly,
        "recent_new": [inquiries.row_to_dict(r) for r in recent],
        "contracts_active": len(live_contracts),
        "contracts_ending": len([c for c in live_contracts if c["status"] == "cancel_requested"]),
        "monthly_revenue": sum(c["monthly_fee"] for c in live_contracts if c["start_date"] <= today_text),
        "payments_this_month": payments_this_month,
        "outstanding": outstanding,
        "estimates_open": conn.execute(
            "SELECT COUNT(*) FROM estimates WHERE status IN ('draft', 'sent')"
        ).fetchone()[0],
        "mail_problems": mail_problems,
        "previous_login": previous_login,
    }
