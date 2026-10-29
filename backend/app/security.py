"""管理者ログインまわり（パスワードハッシュ・セッション・ログイン履歴・試行回数制限）。

管理者は .env の ADMIN_EMAIL の1人だけです。
- パスワードは管理画面から変更できます。
- .env の ADMIN_PASSWORD を書き換えて再起動すると、その値にリセットされます（忘れたとき用）。
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque

from . import settings_store
from .db import utc_now_iso

SESSION_COOKIE = "bt_admin_session"
SESSION_TTL_SECONDS = 12 * 60 * 60
PBKDF2_ITERATIONS = 600_000
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
ENV_PASSWORD_KEY = "admin.env_password_hash"  # 最後に反映した .env のパスワード（ハッシュ）


# ------------------------------------------------------------------ パスワード

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# 存在しないメールアドレスでも同じだけ時間をかけ、登録の有無を推測されにくくします
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def password_problem(password: str) -> str | None:
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"パスワードは{MIN_PASSWORD_LENGTH}文字以上にしてください。"
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"パスワードは{MAX_PASSWORD_LENGTH}文字以内にしてください。"
    return None


def sync_admin(conn: sqlite3.Connection, email: str, password: str) -> None:
    """.env の ADMIN_EMAIL / ADMIN_PASSWORD をもとに管理者を用意します（起動時に実行）。"""
    if not email or "@" not in email:
        raise RuntimeError(".env の ADMIN_EMAIL にメールアドレスを設定してください。")
    if password == "__GENERATE__" or password_problem(password):
        raise RuntimeError(
            f".env の ADMIN_PASSWORD は {MIN_PASSWORD_LENGTH}〜{MAX_PASSWORD_LENGTH} 文字で設定してください。"
        )

    now = utc_now_iso()
    row = conn.execute("SELECT id, password_hash FROM admins WHERE email = ?", (email,)).fetchone()
    applied_env_hash = settings_store.get_raw(conn, ENV_PASSWORD_KEY)
    env_changed = not (isinstance(applied_env_hash, str) and verify_password(password, applied_env_hash))

    if row is None:
        conn.execute(
            "INSERT INTO admins (email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (email, hash_password(password), now, now),
        )
    elif env_changed and not verify_password(password, row["password_hash"]):
        # .env のパスワードが書き換えられた → その値にリセットし、ログイン中のセッションを無効にします
        conn.execute(
            "UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?",
            (hash_password(password), now, row["id"]),
        )
        conn.execute("DELETE FROM admin_sessions WHERE admin_id = ?", (row["id"],))

    # 管理者は .env の1人だけにします（メールアドレスを変えた場合、古いアカウントは削除）
    conn.execute("DELETE FROM admins WHERE email != ?", (email,))
    conn.commit()
    if env_changed:
        settings_store.put_raw(conn, ENV_PASSWORD_KEY, hash_password(password))


def authenticate(conn: sqlite3.Connection, email: str, password: str) -> sqlite3.Row | None:
    row = conn.execute(
        "SELECT id, email, password_hash FROM admins WHERE email = ?", (email.strip().lower(),)
    ).fetchone()
    if row is None:
        verify_password(password, _DUMMY_HASH)
        return None
    return row if verify_password(password, row["password_hash"]) else None


def change_password(conn: sqlite3.Connection, admin_id: int, new_password: str, keep_token: str) -> None:
    conn.execute(
        "UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?",
        (hash_password(new_password), utc_now_iso(), admin_id),
    )
    # ほかの端末のログインは無効にします（今の画面はログインしたまま）
    conn.execute(
        "DELETE FROM admin_sessions WHERE admin_id = ? AND token_hash != ?", (admin_id, _token_hash(keep_token))
    )
    conn.commit()


def current_password_hash(conn: sqlite3.Connection, admin_id: int) -> str:
    return conn.execute("SELECT password_hash FROM admins WHERE id = ?", (admin_id,)).fetchone()["password_hash"]


# ------------------------------------------------------------------ セッション

def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(conn: sqlite3.Connection, admin_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (_token_hash(token), admin_id, int(time.time()) + SESSION_TTL_SECONDS, utc_now_iso()),
    )
    conn.commit()
    return token


def get_session_admin(conn: sqlite3.Connection, token: str) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT a.id, a.email
        FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        """,
        (_token_hash(token), int(time.time())),
    ).fetchone()


def delete_session(conn: sqlite3.Connection, token: str) -> None:
    conn.execute("DELETE FROM admin_sessions WHERE token_hash = ?", (_token_hash(token),))
    conn.commit()


def purge_expired_sessions(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM admin_sessions WHERE expires_at <= ?", (int(time.time()),))
    conn.commit()


# ------------------------------------------------------------------ ログイン履歴

def record_login(conn: sqlite3.Connection, email: str, success: bool, ip: str, user_agent: str) -> None:
    conn.execute(
        "INSERT INTO login_history (email, success, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?)",
        (email.strip().lower()[:254], 1 if success else 0, ip[:64], user_agent[:300], utc_now_iso()),
    )
    conn.commit()


# ------------------------------------------------------------------ 試行回数の制限

class RateLimiter:
    """一定時間内の回数を IP アドレスごとに数えます（メモリ上のみ）。"""

    def __init__(self, max_events: int, window_seconds: int) -> None:
        self.max_events = max_events
        self.window_seconds = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _trim(self, key: str, now: float) -> deque[float]:
        events = self._events[key]
        while events and events[0] <= now - self.window_seconds:
            events.popleft()
        return events

    def is_limited(self, key: str) -> bool:
        with self._lock:
            return len(self._trim(key, time.monotonic())) >= self.max_events

    def hit(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._trim(key, now).append(now)

    def reset(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)
