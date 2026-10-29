"""管理画面での操作の記録。"""

from __future__ import annotations

import sqlite3

from .db import utc_now_iso


def log(conn: sqlite3.Connection, action: str, detail: str = "") -> None:
    conn.execute(
        "INSERT INTO audit_logs (action, detail, created_at) VALUES (?, ?, ?)",
        (action, detail[:1000], utc_now_iso()),
    )
    conn.commit()
