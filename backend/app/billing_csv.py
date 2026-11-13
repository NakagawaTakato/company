"""見積書・入金（領収書）の CSV 出力（Excel 用の BOM 付き UTF-8）。"""

from __future__ import annotations

import csv
import io
from typing import Any, Iterable

from .inquiries import _safe_cell, format_jst

ESTIMATE_LABELS = {"draft": "下書き", "sent": "送付済み", "accepted": "承諾", "rejected": "不成立"}
PAYMENT_LABELS = {"cash": "現金（手渡し）", "card": "クレジットカード", "bank": "銀行振込"}


def _to_csv(header: list[str], rows: Iterable[Iterable[Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([_safe_cell(v) for v in row])
    # Excel で文字化けしないよう、先頭に BOM を付けます
    return "﻿" + buffer.getvalue()


def _items_text(items: list[dict[str, Any]]) -> str:
    return " / ".join(
        f"{i['description']} {i['quantity']}{i['unit']} × {i['unit_price']:,}円 = {i['amount']:,}円" for i in items
    )


def estimates_csv(items: list[dict[str, Any]]) -> str:
    return _to_csv(
        [
            "見積番号", "発行日", "有効期限", "状態", "お客さま名", "敬称", "件名", "明細", "小計", "消費税率(%)", "消費税",
            "合計", "入金済み", "残額", "納期", "お支払い条件", "備考", "作成日時", "最終更新",
        ],
        (
            (
                e["number"], e["issue_date"], e["valid_until"], ESTIMATE_LABELS.get(e["status"], e["status"]),
                e["customer_name"], e["honorific"], e["title"], _items_text(e.get("items", [])), e["subtotal"], e["tax_rate"],
                e["tax"], e["total"], e["paid"], e["balance"], e["delivery"], e["payment_terms"], e["notes"],
                format_jst(e["created_at"]), format_jst(e["updated_at"]),
            )
            for e in items
        ),
    )


def payments_csv(items: list[dict[str, Any]]) -> str:
    return _to_csv(
        ["領収書番号", "入金日", "お客さま名", "但し書き", "金額", "お支払い方法", "見積番号", "備考", "記録日時", "最終更新"],
        (
            (
                p["receipt_number"], p["paid_on"], p["customer_name"], p["description"], p["amount"],
                PAYMENT_LABELS.get(p["method"], p["method"]), (p["estimate"] or {}).get("number", ""), p["note"],
                format_jst(p["created_at"]), format_jst(p["updated_at"]),
            )
            for p in items
        ),
    )
