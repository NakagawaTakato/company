"""データの管理（個人情報の自動削除・バックアップ）。"""

from __future__ import annotations

import sqlite3
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from . import db


def _months_ago(months: int) -> datetime:
    now = datetime.now(timezone.utc)
    year, month = now.year, now.month - months
    while month <= 0:
        month += 12
        year -= 1
    day = min(now.day, 28)
    return now.replace(year=year, month=month, day=day)


def retention_targets(conn: sqlite3.Connection, rule: dict[str, Any]) -> list[int]:
    """自動削除の対象になるお問い合わせの ID。
    - 対応が終わった（指定の対応状況）問い合わせで、最終更新から指定の月数が過ぎたもの
    - 迷惑送信で、受付から指定の日数が過ぎたもの
    """
    cutoff = _months_ago(int(rule["months"])).strftime("%Y-%m-%dT%H:%M:%SZ")
    spam_cutoff = (datetime.now(timezone.utc) - timedelta(days=int(rule["spam_days"]))).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    statuses = list(rule["statuses"]) or ["__none__"]
    marks = ",".join("?" for _ in statuses)
    rows = conn.execute(
        f"""
        SELECT id FROM inquiries
        WHERE (is_spam = 0 AND status IN ({marks}) AND updated_at < ?)
           OR (is_spam = 1 AND created_at < ?)
        """,
        [*statuses, cutoff, spam_cutoff],
    ).fetchall()
    return [r["id"] for r in rows]


def run_retention(conn: sqlite3.Connection, rule: dict[str, Any], dry_run: bool) -> int:
    ids = retention_targets(conn, rule)
    if ids and not dry_run:
        conn.executemany("DELETE FROM inquiries WHERE id = ?", [(i,) for i in ids])
        conn.commit()
    return len(ids)


def create_backup(database_path: Path, uploads_dir: Path) -> Path:
    """データベースとアップロード画像を zip にまとめます（一時ファイルのパスを返します）。"""
    work = Path(tempfile.mkdtemp(prefix="bluetab-backup-"))
    snapshot = work / "app.db"
    source = db.connect(database_path)
    target = sqlite3.connect(snapshot)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    archive = work / "backup.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(snapshot, "data/app.db")
        if uploads_dir.is_dir():
            for path in sorted(uploads_dir.iterdir()):
                if path.is_file():
                    zf.write(path, f"data/uploads/{path.name}")
        zf.writestr(
            "README.txt",
            "Katachi サイトのバックアップです。\n"
            "戻すときは、サーバーを止めてから data/app.db と data/uploads/ をプロジェクトの data フォルダに上書きしてください。\n",
        )
    snapshot.unlink()
    return archive
