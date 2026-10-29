"""画像のアップロード（制作実績の画像など）。保存先は data/uploads/ です。"""

from __future__ import annotations

import re
import secrets
from pathlib import Path

MAX_BYTES = 5 * 1024 * 1024
NAME_RE = re.compile(r"^[0-9a-f]{24}\.(png|jpg|gif|webp)$")
MEDIA_TYPES = {"png": "image/png", "jpg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}


def detect_extension(data: bytes) -> str | None:
    """ファイルの中身（先頭のバイト）から画像の種類を判定します。"""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if len(data) > 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def save_image(upload_dir: Path, data: bytes) -> str:
    extension = detect_extension(data)
    if extension is None:
        raise ValueError("画像は PNG・JPEG・GIF・WebP のいずれかを選んでください。")
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{secrets.token_hex(12)}.{extension}"
    (upload_dir / name).write_bytes(data)
    return name


def find_image(upload_dir: Path, name: str) -> Path | None:
    if not NAME_RE.match(name):
        return None
    path = upload_dir / name
    return path if path.is_file() else None
