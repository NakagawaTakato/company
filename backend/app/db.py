"""SQLite データベース。

起動時に init_db() が足りない表・列を順番に追加します（既存のデータはそのまま残ります）。
どこまで追加したかは PRAGMA user_version に記録しています。
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

JST = timezone(timedelta(hours=9))

# 1つ目: 最初の構成 / 2つ目以降: 追加分（順番を変えないでください）
MIGRATIONS: list[str] = [
    """
    CREATE TABLE IF NOT EXISTS inquiries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        topics          TEXT    NOT NULL,              -- JSON 配列（例: ["python_react_fastapi"]）
        name            TEXT    NOT NULL,
        email           TEXT    NOT NULL,
        phone           TEXT    NOT NULL,              -- 数字のみ（ハイフンなし）
        prefecture      TEXT    NOT NULL,
        age             INTEGER,
        initial_payment TEXT    NOT NULL,
        monthly_payment TEXT    NOT NULL,
        status          TEXT    NOT NULL DEFAULT 'new',
        created_at      TEXT    NOT NULL,              -- UTC（例: 2026-10-26T05:00:00Z）
        updated_at      TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries (created_at);

    CREATE TABLE IF NOT EXISTS admins (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
        token_hash TEXT    PRIMARY KEY,
        admin_id   INTEGER NOT NULL REFERENCES admins (id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,                   -- UNIX 秒
        created_at TEXT    NOT NULL
    );
    """,
    """
    BEGIN;
    ALTER TABLE inquiries ADD COLUMN is_spam INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX idx_inquiries_status ON inquiries (is_spam, status);

    -- 対応メモ・メール送信・自動の記録（タイムライン）
    CREATE TABLE inquiry_notes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        inquiry_id  INTEGER NOT NULL REFERENCES inquiries (id) ON DELETE CASCADE,
        kind        TEXT    NOT NULL DEFAULT 'note',   -- note / email / system
        body        TEXT    NOT NULL,
        created_at  TEXT    NOT NULL
    );
    CREATE INDEX idx_inquiry_notes_inquiry ON inquiry_notes (inquiry_id);

    -- 各種設定（テーマ色・メール・自動削除・サイト内容など）。value は JSON
    CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE login_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        email      TEXT    NOT NULL,
        success    INTEGER NOT NULL,
        ip         TEXT    NOT NULL DEFAULT '',
        user_agent TEXT    NOT NULL DEFAULT '',
        created_at TEXT    NOT NULL
    );

    CREATE TABLE audit_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        action     TEXT NOT NULL,
        detail     TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );

    CREATE TABLE mail_outbox (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        inquiry_id INTEGER REFERENCES inquiries (id) ON DELETE SET NULL,
        kind       TEXT NOT NULL,                      -- admin_notify / auto_reply / reply / test
        to_addr    TEXT NOT NULL,
        subject    TEXT NOT NULL,
        body       TEXT NOT NULL,
        status     TEXT NOT NULL,                      -- pending / sent / failed / skipped
        error      TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        sent_at    TEXT
    );

    CREATE TABLE reply_templates (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        subject    TEXT NOT NULL,
        body       TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

    CREATE TABLE blocklist (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern    TEXT NOT NULL UNIQUE,               -- メールアドレス、または @ドメイン
        note       TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
    );

    CREATE TABLE estimates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        number        TEXT    NOT NULL UNIQUE,
        inquiry_id    INTEGER REFERENCES inquiries (id) ON DELETE SET NULL,
        customer_name TEXT    NOT NULL,
        title         TEXT    NOT NULL,
        issue_date    TEXT    NOT NULL,
        valid_until   TEXT    NOT NULL,
        delivery      TEXT    NOT NULL DEFAULT '',
        payment_terms TEXT    NOT NULL DEFAULT '',
        notes         TEXT    NOT NULL DEFAULT '',
        tax_rate      INTEGER NOT NULL DEFAULT 10,
        status        TEXT    NOT NULL DEFAULT 'draft',  -- draft / sent / accepted / rejected
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL
    );

    CREATE TABLE estimate_items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        estimate_id INTEGER NOT NULL REFERENCES estimates (id) ON DELETE CASCADE,
        description TEXT    NOT NULL,
        quantity    REAL    NOT NULL,
        unit        TEXT    NOT NULL DEFAULT '式',
        unit_price  INTEGER NOT NULL,
        sort_order  INTEGER NOT NULL
    );

    CREATE TABLE payments (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_number TEXT    NOT NULL UNIQUE,
        estimate_id    INTEGER REFERENCES estimates (id) ON DELETE SET NULL,
        customer_name  TEXT    NOT NULL,
        description    TEXT    NOT NULL,
        amount         INTEGER NOT NULL,
        method         TEXT    NOT NULL,               -- cash / card / bank
        paid_on        TEXT    NOT NULL,
        note           TEXT    NOT NULL DEFAULT '',
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
    );

    CREATE TABLE contracts (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        inquiry_id          INTEGER REFERENCES inquiries (id) ON DELETE SET NULL,
        customer_name       TEXT    NOT NULL,
        email               TEXT    NOT NULL DEFAULT '',
        site_name           TEXT    NOT NULL,
        site_url            TEXT    NOT NULL DEFAULT '',
        monthly_fee         INTEGER NOT NULL,
        start_date          TEXT    NOT NULL,
        cancel_requested_on TEXT,
        end_date            TEXT,
        note                TEXT    NOT NULL DEFAULT '',
        created_at          TEXT    NOT NULL,
        updated_at          TEXT    NOT NULL
    );

    INSERT INTO reply_templates (name, subject, body, created_at, updated_at) VALUES
    ('お問い合わせのお礼（ご相談の日程調整）',
     '【{business_name}】お問い合わせありがとうございます',
     '{name} 様

{business_name}の{owner}です。
このたびはお問い合わせいただき、ありがとうございます。

ご相談の内容をくわしくうかがいたいので、ご都合のよい日時をいくつか教えていただけますでしょうか。
（{hours}で対応しております）

よろしくお願いいたします。

――――――――――――――――
{business_name}　{owner}
メール: {business_email}
電話: {business_phone}',
     strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    ('お見積りのご案内',
     '【{business_name}】お見積りのご案内',
     '{name} 様

{business_name}の{owner}です。
先日はご相談いただき、ありがとうございました。

お見積書をお送りします。内容・金額・納期・お支払い時期をご確認いただき、
ご不明な点があれば、お気軽にご質問ください。

ご納得いただけましたら、ご返信にてお知らせください。確認でき次第、着手いたします。

――――――――――――――――
{business_name}　{owner}
メール: {business_email}
電話: {business_phone}',
     strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
    COMMIT;
    """,
    """
    BEGIN;
    -- 返信先（新着通知メールに返信すると、お客さま宛てになるように）
    ALTER TABLE mail_outbox ADD COLUMN reply_to TEXT NOT NULL DEFAULT '';
    COMMIT;
    """,
    """
    BEGIN;
    -- ご相談内容の選択肢を「Laravel(PHP)」から「Python(フロントエンド React/バックエンド FastAPI)」に変更。
    -- これまでに届いたお問い合わせも、新しい選択肢で表示されるように置き換えます。
    UPDATE inquiries
       SET topics = REPLACE(topics, '"laravel_php"', '"python_react_fastapi"')
     WHERE instr(topics, '"laravel_php"') > 0;
    COMMIT;
    """,
    """
    BEGIN;
    -- 見積書の宛名の敬称（様 / 御中）と納品場所
    ALTER TABLE estimates ADD COLUMN honorific TEXT NOT NULL DEFAULT '様';
    ALTER TABLE estimates ADD COLUMN delivery_place TEXT NOT NULL DEFAULT '';
    COMMIT;
    """,
    """
    BEGIN;
    -- 見積書の納品場所はやめました（版 5 で追加した列を削除）
    ALTER TABLE estimates DROP COLUMN delivery_place;
    COMMIT;
    """,
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_jst() -> str:
    return datetime.now(JST).strftime("%Y-%m-%d")


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for number, sql in enumerate(MIGRATIONS[version:], start=version + 1):
            conn.executescript(sql)
            conn.execute(f"PRAGMA user_version = {number}")
            conn.commit()
    finally:
        conn.close()


def paginate(
    conn: sqlite3.Connection, sql: str, params: list, page: int, per_page: int
) -> tuple[list[sqlite3.Row], int]:
    """SELECT 文に件数とページ分けを付けて実行します。"""
    total = conn.execute(f"SELECT COUNT(*) FROM ({sql})", params).fetchone()[0]
    rows = conn.execute(f"{sql} LIMIT ? OFFSET ?", [*params, per_page, (page - 1) * per_page]).fetchall()
    return rows, total
