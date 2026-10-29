"""Outlook にサインインするコマンド（元の `php artisan mail:outlook-login` と同じ手順）。

    cd backend && .venv/bin/python -m app.outlook_login

管理画面の「メール」→「Outlook にサインイン」からも同じことができます。
"""

from __future__ import annotations

import sys

from . import outlook
from .config import load_settings


def main() -> int:
    settings = load_settings()
    config = outlook.OutlookConfig(
        settings.microsoft_client_id, settings.microsoft_tenant, settings.database_path.parent / "microsoft-oauth.json"
    )
    try:
        device = outlook.request_device_code(config)
        print(f"1. ブラウザで次のページを開いてください: {device['verification_uri']}")
        print(f"2. 次のコードを入力してください: {device['user_code']}")
        print("3. メールを送る Outlook アカウントでサインインし、アクセスを許可してください。")
        print("（サインインが終わるまで、このまま待ちます）", flush=True)
        outlook.wait_for_device_login(config, device)
    except outlook.OutlookError as error:
        print(f"エラー: {error}", file=sys.stderr)
        return 1
    print("サインインしました。お問い合わせメールを Outlook から送れます。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
