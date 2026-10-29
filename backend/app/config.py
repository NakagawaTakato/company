"""設定の読み込み（.env と shared/contact_options.json）。

OS の環境変数が設定されていれば、.env の値より優先します。
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# プロジェクトフォルダ（.env, data/, shared/, frontend/ がある場所）
ROOT_DIR = Path(os.environ.get("BLUETAB_ROOT") or Path(__file__).resolve().parents[2])


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


# 画面（Vite）の URL。API を呼び出してよい接続元として CORS で許可します。
DEFAULT_FRONTEND_ORIGINS = (
    "http://127.0.0.1:5173,http://localhost:5173"
)


@dataclass(frozen=True)
class Settings:
    admin_email: str
    admin_password: str
    database_path: Path
    cookie_secure: bool
    frontend_origins: list[str]
    options: dict[str, Any]
    # Outlook（Microsoft Graph）でメールを送る設定（元の Laravel 版と同じ Azure のアプリ）
    microsoft_client_id: str
    microsoft_tenant: str
    mail_from_address: str
    mail_from_name: str


def load_settings() -> Settings:
    file_values = _read_env_file(ROOT_DIR / ".env")

    def get(key: str, default: str = "") -> str:
        return os.environ.get(key, file_values.get(key, default))

    database_path = Path(get("DATABASE_PATH", "data/app.db"))
    if not database_path.is_absolute():
        database_path = ROOT_DIR / database_path

    options = json.loads((ROOT_DIR / "shared" / "contact_options.json").read_text(encoding="utf-8"))

    origins: list[str] = []
    for origin in get("FRONTEND_ORIGINS", DEFAULT_FRONTEND_ORIGINS).split(","):
        origin = origin.strip().rstrip("/")
        if origin and origin not in origins:
            origins.append(origin)

    return Settings(
        admin_email=get("ADMIN_EMAIL").strip().lower(),
        admin_password=get("ADMIN_PASSWORD"),
        database_path=database_path,
        cookie_secure=get("COOKIE_SECURE", "false").strip().lower() in ("1", "true", "yes"),
        frontend_origins=origins,
        options=options,
        microsoft_client_id=get("MICROSOFT_CLIENT_ID").strip(),
        microsoft_tenant=get("MICROSOFT_TENANT", "consumers").strip() or "consumers",
        mail_from_address=get("MAIL_FROM_ADDRESS").strip(),
        mail_from_name=get("MAIL_FROM_NAME").strip(),
    )
