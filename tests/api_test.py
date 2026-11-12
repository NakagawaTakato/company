"""バックエンド API（FastAPI）の動作確認テスト。

起動中のバックエンドに対して実行します。データを書き込むので、
本番用ではなくテスト用のデータベースで起動したサーバーに対して使ってください。
通常は tests/run_api_tests.sh から実行します。

    python3 tests/api_test.py --base-url http://127.0.0.1:18000 --email admin@example.com --password xxxx
    python3 tests/api_test.py --base-url ... --email ... --password ... --check-login   # ログインできるかだけ確認
"""

from __future__ import annotations

import argparse
import base64
import email
import email.policy
import http.cookiejar
import io
import json
import re
import socketserver
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from typing import Any

PASSED = 0
FAILED: list[str] = []
FRONTEND_ORIGIN = "http://127.0.0.1:5173"
JST = timezone(timedelta(hours=9))
PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360f8cf00000301010018dd8db40000000049454e44ae426082"
)


class Client:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        raw: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, str], bytes]:
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        if data is not None and raw is None:
            req.add_header("Content-Type", "application/json")
        for key, value in (headers or {}).items():
            req.add_header(key, value)
        try:
            with self.opener.open(req, timeout=60) as res:
                return res.status, {k.lower(): v for k, v in res.headers.items()}, res.read()
        except urllib.error.HTTPError as err:
            return err.code, {k.lower(): v for k, v in err.headers.items()}, err.read()

    def json(
        self, method: str, path: str, body: Any = None, raw: bytes | None = None, headers: dict[str, str] | None = None
    ) -> tuple[int, Any]:
        status, _, content = self.request(method, path, body, raw, headers)
        try:
            return status, json.loads(content.decode("utf-8")) if content else None
        except ValueError:
            return status, content.decode("utf-8", "replace")


def check(name: str, condition: Any, detail: Any = "") -> None:
    global PASSED
    if condition:
        PASSED += 1
        print(f"  OK   {name}")
    else:
        FAILED.append(name)
        print(f"  NG   {name}  {str(detail)[:400]}")


# ------------------------------------------------------------------ テスト用のメール受信サーバー

class SmtpSink:
    """届いたメールを覚えておくだけの、テスト用 SMTP サーバー。"""

    def __init__(self) -> None:
        self.messages: list[email.message.EmailMessage] = []
        sink = self

        class Handler(socketserver.StreamRequestHandler):
            def handle(self) -> None:
                self.wfile.write(b"220 sink ESMTP\r\n")
                while True:
                    line = self.rfile.readline()
                    if not line:
                        return
                    command = line.decode("ascii", "replace").strip().upper()
                    if command.startswith(("EHLO", "HELO")):
                        self.wfile.write(b"250-sink\r\n250 OK\r\n")
                    elif command == "DATA":
                        self.wfile.write(b"354 End data with <CR><LF>.<CR><LF>\r\n")
                        chunks = []
                        while True:
                            data_line = self.rfile.readline()
                            if data_line in (b".\r\n", b".\n", b""):
                                break
                            chunks.append(data_line[1:] if data_line.startswith(b"..") else data_line)
                        sink.messages.append(email.message_from_bytes(b"".join(chunks), policy=email.policy.default))
                        self.wfile.write(b"250 OK\r\n")
                    elif command == "QUIT":
                        self.wfile.write(b"221 Bye\r\n")
                        return
                    else:
                        self.wfile.write(b"250 OK\r\n")

        self.server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def wait_for(self, count: int, timeout: float = 10) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if len(self.messages) >= count:
                return True
            time.sleep(0.1)
        return False

    def subjects(self) -> list[str]:
        return [str(m["subject"]) for m in self.messages]


class FakeMicrosoft:
    """Microsoft のサインイン（デバイスコード）と Graph の sendMail をまねる、テスト用のサーバー。"""

    def __init__(self, port: int) -> None:
        self.sent: list[email.message.EmailMessage] = []
        self.grants: list[str] = []
        self.polls = 0
        self.access = "at-0"
        self.refresh = ""
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args: Any) -> None:
                return

            def reply(self, code: int, body: dict[str, Any] | None = None) -> None:
                data = json.dumps(body or {}).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_POST(self) -> None:  # noqa: N802
                raw = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                if self.path.endswith("/oauth2/v2.0/devicecode"):
                    form = urllib.parse.parse_qs(raw.decode())
                    ok = form.get("client_id") == ["test-client"] and "Mail.Send" in form.get("scope", [""])[0]
                    return self.reply(200 if ok else 400, {
                        "device_code": "secret-device-code", "user_code": "TEST-CODE",
                        "verification_uri": "https://www.microsoft.com/link", "expires_in": 900, "interval": 1,
                    })
                if self.path.endswith("/oauth2/v2.0/token"):
                    form = {k: v[0] for k, v in urllib.parse.parse_qs(raw.decode()).items()}
                    fake.grants.append(form.get("grant_type", "").split(":")[-1])
                    if form.get("grant_type", "").endswith("device_code"):
                        if form.get("device_code") != "secret-device-code":
                            return self.reply(400, {"error": "invalid_grant"})
                        fake.polls += 1
                        if fake.polls == 1:
                            return self.reply(400, {"error": "authorization_pending"})
                    elif form.get("grant_type") == "refresh_token":
                        if form.get("refresh_token") != fake.refresh:
                            return self.reply(400, {"error": "invalid_grant", "error_description": "bad refresh"})
                    n = len(fake.grants)
                    fake.access, fake.refresh = f"at-{n}", f"rt-{n}"
                    # 有効期限を短くして、送信のたびにトークンの更新が走るようにします
                    return self.reply(200, {"access_token": fake.access, "refresh_token": fake.refresh, "expires_in": 30})
                if self.path == "/v1.0/me/sendMail":
                    if self.headers.get("Authorization") != f"Bearer {fake.access}":
                        return self.reply(401, {"error": {"code": "InvalidAuthenticationToken"}})
                    fake.sent.append(email.message_from_bytes(base64.b64decode(raw), policy=email.policy.default))
                    self.send_response(202)
                    self.end_headers()
                    return None
                return self.reply(404)

        self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def wait_for(self, count: int, timeout: float = 10) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if len(self.sent) >= count:
                return True
            time.sleep(0.1)
        return False


VALID_CONTACT = {
    "topics": ["python_react_fastapi"],
    "name": "テスト 太郎",
    "email": "ｔａｒｏ＠example.com",
    "phone": "０９０－１２３４－５６７８",
    "prefecture": "兵庫県",
    "age": "３０",
    "initial_payment": "cash",
    "monthly_payment": "none",
    "agreed": True,
    "website": "",
}


def contact(c: Client, **overrides: Any) -> tuple[int, Any]:
    return c.json("POST", "/api/contact", {**VALID_CONTACT, **overrides})


def find(c: Client, name: str, spam: bool = False) -> dict[str, Any] | None:
    _, body = c.json("GET", f"/api/admin/inquiries?q={urllib.parse.quote(name)}{'&spam=1' if spam else ''}")
    items = body.get("items", []) if isinstance(body, dict) else []
    return next((i for i in items if i["name"] == name), None)


def login(c: Client, email_addr: str, password: str) -> int:
    status, _ = c.json("POST", "/api/admin/login", {"email": email_addr, "password": password})
    return status


# ------------------------------------------------------------------ 公開側

def test_public(c: Client) -> None:
    print("[共通]")
    status, body = c.json("GET", "/api/health")
    check("ヘルスチェック", status == 200 and body.get("status") == "ok", (status, body))
    status, body = c.json("GET", "/")
    check("ルートは API の案内を返す", status == 200 and body.get("name") == "Katachi API", (status, body))
    status, body = c.json("GET", "/api/no-such-api")
    check("存在しない API は 404", status == 404 and "message" in body, (status, body))
    status, body = c.json("GET", "/contact")
    check("画面のパスは API 側では 404（画面は Vite が配信）", status == 404, (status, body))

    print("[CORS（画面からの呼び出し）]")
    for method in ("POST", "PUT", "DELETE"):
        status, headers, _ = c.request(
            "OPTIONS",
            "/api/admin/inquiries/1",
            headers={
                "Origin": FRONTEND_ORIGIN,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "content-type",
            },
        )
        check(
            f"許可した画面からの事前確認（{method}）に応答",
            status in (200, 204)
            and headers.get("access-control-allow-origin") == FRONTEND_ORIGIN
            and headers.get("access-control-allow-credentials") == "true",
            (status, headers),
        )
    status, headers, _ = c.request("GET", "/api/health", headers={"Origin": "http://evil.example"})
    check("許可していない接続元には許可ヘッダーを返さない", "access-control-allow-origin" not in headers, headers)

    print("[サイト内容（公開）]")
    status, body = c.json("GET", "/api/site")
    check(
        "テーマ色とサイト内容を返す",
        status == 200 and body["theme"]["primary_color"] == "#1558c0"
        and body["content"]["business"]["business_name"] and len(body["content"]["faq"]) == 8,
        body,
    )

    print("[お問い合わせ]")
    status, body = c.json("POST", "/api/contact", raw=b"{broken", headers={"Content-Type": "application/json"})
    check("壊れた JSON は 400", status == 400, (status, body))
    status, body = c.json("POST", "/api/contact", {})
    expected = {"topics", "name", "email", "phone", "prefecture", "initial_payment", "monthly_payment", "agreed"}
    check("空の送信は 422 で各項目のエラー", status == 422 and set(body.get("errors", {})) == expected, body)
    status, body = contact(c, email="bad", phone="123", age="200", topics=["unknown"], agreed=False)
    errors = body.get("errors", {}) if isinstance(body, dict) else {}
    check("形式エラーを検出", status == 422 and {"email", "phone", "age", "topics", "agreed"} <= set(errors), body)
    check("エラー文が日本語", errors.get("phone", "").startswith("電話番号の形式"), errors)
    status, body = contact(c)
    check("正しい内容は 201", status == 201 and body == {"ok": True}, (status, body))
    status, body = contact(c, name="=HYPERLINK(\"x\")", age="")
    check("年齢なしでも送信できる", status == 201, (status, body))
    status, body = contact(c, name="ボット", website="http://spam")
    check("迷惑送信（隠し欄あり）は成功扱いで保存しない", status == 201, (status, body))

    print("[管理画面 API: 未ログイン]")
    for method, path in (
        ("GET", "/api/admin/me"),
        ("GET", "/api/admin/inquiries"),
        ("GET", "/api/admin/inquiries.csv"),
        ("GET", "/api/admin/inquiries/1"),
        ("PATCH", "/api/admin/inquiries/1"),
        ("GET", "/api/admin/dashboard"),
        ("PUT", "/api/admin/theme"),
        ("GET", "/api/admin/estimates"),
        ("GET", "/api/admin/estimates.csv"),
        ("GET", "/api/admin/payments.csv"),
        ("GET", "/api/admin/backup"),
        ("POST", "/api/admin/uploads"),
    ):
        status, body = c.json(method, path, {"status": "done"} if method in ("PATCH", "PUT") else None)
        check(f"{method} {path} は 401", status == 401, (status, body))


# ------------------------------------------------------------------ ログイン・お問い合わせ

def test_login(c: Client, email_addr: str, password: str) -> None:
    print("[ログイン]")
    check("パスワード違いは 401", login(c, email_addr, "wrong-password") == 401)
    status, body = c.json("POST", "/api/admin/login", {"email": "", "password": ""})
    check("未入力は 422", status == 422, (status, body))
    status, body = c.json("POST", "/api/admin/login", {"email": email_addr.upper(), "password": password})
    check("正しいログイン（メールの大文字小文字は区別しない）", status == 200 and body.get("email") == email_addr.lower(), body)
    cookie = next((ck for ck in c.jar if ck.name == "bt_admin_session"), None)
    check("ログイン Cookie が発行される", cookie is not None and cookie.path == "/api", cookie)
    status, body = c.json("GET", "/api/admin/me")
    check("ログイン中のユーザー", status == 200 and body.get("email") == email_addr.lower(), body)


def test_inquiries(c: Client) -> int:
    print("[一覧・詳細・更新]")
    status, body = c.json("GET", "/api/admin/inquiries")
    items = body.get("items", []) if isinstance(body, dict) else []
    taro = next((i for i in items if i["name"] == "テスト 太郎"), None)
    check("一覧に保存した内容がある", status == 200 and taro is not None, body)
    check("ボットの送信は保存されていない", all(i["name"] != "ボット" for i in items))
    check("ページ分けの情報", body.get("page") == 1 and body.get("pages") >= 1 and body.get("per_page") == 20, body)
    if not taro:
        return 0
    check("電話番号は数字だけに整える", taro["phone"] == "09012345678", taro["phone"])
    check("全角のメール・年齢を半角に整える", taro["email"] == "taro@example.com" and taro["age"] == 30, taro)
    check("受付直後は未対応", taro["status"] == "new" and taro["is_spam"] is False, taro)
    counts = body.get("counts", {})
    check(
        "件数の集計（6つの対応状況＋すべて＋迷惑送信）",
        set(counts) == {"all", "new", "in_progress", "quoted", "contracted", "done", "declined", "spam"},
        counts,
    )

    status, body = c.json("GET", "/api/admin/inquiries?q=%E5%A4%AA%E9%83%8E")
    check("キーワード検索", status == 200 and body["items"] and all("太郎" in i["name"] for i in body["items"]), body)
    status, body = c.json("GET", "/api/admin/inquiries?q=%25")
    check("検索語の % を特別扱いしない", status == 200 and body["items"] == [], body)
    status, body = c.json("GET", "/api/admin/inquiries?status=bad")
    check("不正な対応状況の絞り込みは 400", status == 400, (status, body))
    today = datetime.now(JST).date()
    status, body = c.json("GET", f"/api/admin/inquiries?from={today}&to={today}")
    check("期間（今日）で絞り込み", status == 200 and any(i["id"] == taro["id"] for i in body["items"]), body)
    status, body = c.json("GET", f"/api/admin/inquiries?from={today + timedelta(days=1)}")
    check("期間（明日以降）は0件", status == 200 and body["items"] == [], body)
    status, body = c.json("GET", "/api/admin/inquiries?from=2026-13-40")
    check("おかしな日付は 400", status == 400 and "日付" in body.get("message", ""), body)
    status, body = c.json("GET", "/api/admin/inquiries?sort=oldest")
    check("古い順に並べ替え", status == 200 and body["items"][0]["created_at"] <= body["items"][-1]["created_at"], body)
    status, body = c.json("GET", "/api/admin/inquiries?sort=evil")
    check("不正な並び順は 400", status == 400, (status, body))

    tid = taro["id"]
    status, body = c.json("GET", f"/api/admin/inquiries/{tid}")
    check("詳細にメモ・送信メール・見積書・おまかせ管理プランが付く", status == 200 and {"notes", "mails", "estimates", "contracts"} <= set(body), body)
    check("詳細: ID が数字でなければ 404", c.json("GET", "/api/admin/inquiries/abc")[0] == 404)
    check("詳細: 存在しない ID は 404", c.json("GET", "/api/admin/inquiries/999999")[0] == 404)
    status, body = c.json("PATCH", f"/api/admin/inquiries/{tid}", {"status": "bad"})
    check("不正な対応状況は 422", status == 422, (status, body))
    status, body = c.json("PATCH", f"/api/admin/inquiries/{tid}", {"status": "quoted"})
    check("対応状況を「見積送付済み」に変更", status == 200 and body["status"] == "quoted", body)
    check("変更の記録がメモ欄に残る", any(n["kind"] == "system" and "見積送付済み" in n["body"] for n in body["notes"]), body.get("notes"))
    status, body = c.json("GET", "/api/admin/inquiries?status=quoted")
    check("見積送付済みで絞り込み", status == 200 and any(i["id"] == tid for i in body["items"]), body)

    print("[対応メモ]")
    status, note = c.json("POST", f"/api/admin/inquiries/{tid}/notes", {"body": "  電話で日程を調整  "})
    check("メモを追加（前後の空白は除く）", status == 201 and note.get("body") == "電話で日程を調整", (status, note))
    status, body = c.json("POST", f"/api/admin/inquiries/{tid}/notes", {"body": ""})
    check("空のメモは 422（日本語のエラー）", status == 422 and body["errors"].get("body") == "入力してください。", body)
    status, body = c.json("DELETE", f"/api/admin/inquiries/{tid}/notes/{note['id']}")
    check("メモを削除", status == 200, (status, body))
    status, body = c.json("GET", f"/api/admin/inquiries/{tid}")
    system_note = next(n for n in body["notes"] if n["kind"] == "system")
    status2, _ = c.json("DELETE", f"/api/admin/inquiries/{tid}/notes/{system_note['id']}")
    check("自動の記録は削除できない（404）", status2 == 404)
    return tid


def test_pagination(c: Client) -> None:
    print("[ページ分け]")
    for n in range(23):
        contact(c, name=f"ページ確認 {n:02d}", email=f"page{n}@example.com")
    q = urllib.parse.quote("ページ確認")
    status, body = c.json("GET", f"/api/admin/inquiries?q={q}")
    check(
        "1ページ目は20件・全部で2ページ",
        status == 200 and len(body["items"]) == 20 and body["total"] == 23 and body["pages"] == 2,
        body.get("total"),
    )
    status, body = c.json("GET", f"/api/admin/inquiries?q={q}&page=2")
    check("2ページ目は3件", status == 200 and len(body["items"]) == 3 and body["page"] == 2, body.get("items"))
    status, body = c.json("GET", "/api/admin/inquiries?page=abc")
    check("おかしなページ番号は1ページ目", status == 200 and body["page"] == 1, body.get("page"))


def test_spam_and_delete(c: Client) -> None:
    print("[迷惑送信・ブロック・削除]")
    contact(c, name="迷惑 花子", email="bad@spam.example")
    item = find(c, "迷惑 花子")
    status, body = c.json("PATCH", f"/api/admin/inquiries/{item['id']}", {"is_spam": True})
    check("迷惑送信にする", status == 200 and body["is_spam"] is True, body)
    check("迷惑送信は通常の一覧から消える", find(c, "迷惑 花子") is None)
    check("迷惑送信の一覧に出る", find(c, "迷惑 花子", spam=True) is not None)

    status, body = c.json("POST", "/api/admin/blocklist", {"pattern": "not-an-email"})
    check("ブロック: 形式エラーは 422", status == 422, body)
    status, block = c.json("POST", "/api/admin/blocklist", {"pattern": "@SPAM.example", "note": "テスト"})
    check("ドメインをブロック（小文字にそろえる）", status == 201 and block["pattern"] == "@spam.example", block)
    status, body = c.json("POST", "/api/admin/blocklist", {"pattern": "@spam.example"})
    check("同じものは追加できない", status == 422, body)
    contact(c, name="ブロック 次郎", email="other@spam.example")
    check(
        "ブロックしたドメインからの送信は迷惑送信として保存",
        find(c, "ブロック 次郎") is None and find(c, "ブロック 次郎", spam=True) is not None,
    )
    status, body = c.json("DELETE", f"/api/admin/blocklist/{block['id']}")
    check("ブロックを解除", status == 200, body)

    status, body = c.json("DELETE", f"/api/admin/inquiries/{item['id']}")
    check("お問い合わせを削除", status == 200, body)
    check("削除後は 404", c.json("GET", f"/api/admin/inquiries/{item['id']}")[0] == 404)


def test_mail(c: Client, tid: int) -> None:
    print("[メール]")
    status, body = c.json("GET", "/api/admin/mail/settings")
    check(
        "初期の送信方法は Outlook（サインイン前は送れない）",
        status == 200 and body["method"] == "outlook" and body["ready"] is False
        and body["outlook"]["configured"] and not body["outlook"]["signed_in"],
        body,
    )
    status, body = c.json("GET", "/api/admin/mail/outbox")
    skipped = [m for m in body["items"] if m["status"] == "skipped"]
    check(
        "サインイン前の通知・自動返信は「未送信」で記録（理由つき）",
        status == 200 and len(skipped) >= 2 and "サインイン" in skipped[0]["error"],
        body["items"][:3],
    )
    status, body = c.json("POST", "/api/admin/mail/test", {"to": "owner@example.com"})
    check("サインイン前にテスト送信すると、理由つきのエラー", status == 400 and "サインイン" in body.get("message", ""), body)
    status, body = c.json("PUT", "/api/admin/mail/method", {"method": "fax"})
    check("送信方法は outlook / smtp のみ", status == 422, body)
    status, body = c.json("PUT", "/api/admin/mail/method", {"method": "smtp"})
    check("送信方法を SMTP に切り替え", status == 200 and body["method"] == "smtp" and body["smtp"]["password_set"] is False, body)
    status, body = c.json("POST", "/api/admin/mail/test", {"to": "owner@example.com"})
    check("SMTP 未設定のままテスト送信すると、理由つきのエラー", status == 400 and "SMTP" in body.get("message", ""), body)

    sink = SmtpSink()
    smtp = {
        "host": "127.0.0.1", "port": sink.port, "security": "none", "username": "", "password": "secret-pw",
        "from_address": "noreply@example.com", "from_name": "Katachi テスト",
    }
    status, body = c.json("PUT", "/api/admin/mail/smtp", {**smtp, "from_address": "bad"})
    check("送信元アドレスの形式エラーは 422", status == 422 and "from_address" in body.get("errors", {}), body)
    status, body = c.json("PUT", "/api/admin/mail/smtp", smtp)
    check(
        "送信設定を保存（パスワードは返さない）",
        status == 200 and body["smtp"]["ready"] and body["smtp"]["password_set"] and "password" not in body["smtp"],
        body,
    )
    status, body = c.json("PUT", "/api/admin/mail/smtp", {**smtp, "password": None})
    check("パスワード欄が空なら今のパスワードのまま", status == 200 and body["smtp"]["password_set"], body)

    status, body = c.json("POST", "/api/admin/mail/test", {"to": "owner@example.com"})
    check("テストメールを送信", status == 200 and sink.wait_for(1) and "テストメール" in sink.subjects()[0], (status, body, sink.subjects()))
    sender = str(sink.messages[0]["from"]) if sink.messages else ""
    check("差出人名（日本語）と送信元アドレス", "noreply@example.com" in sender and "Katachi" in sender, sender)

    notify = {
        "admin_notify": True, "admin_to": ["owner@example.com", "staff@example.com"], "auto_reply": True,
        "auto_reply_subject": "【{business_name}】受付しました", "auto_reply_body": "{name} 様\n\n{inquiry_summary}\n",
        "site_url": "http://127.0.0.1:5173/",
    }
    status, body = c.json("PUT", "/api/admin/mail/notifications", {**notify, "admin_to": ["bad"]})
    check("通知先の形式エラーは 422", status == 422, body)
    status, body = c.json("PUT", "/api/admin/mail/notifications", notify)
    check("通知・自動返信の設定を保存", status == 200 and body["notifications"]["site_url"] == "http://127.0.0.1:5173", body)

    before = len(sink.messages)
    contact(c, name="メール 三郎", email="saburo@example.com")
    arrived = sink.wait_for(before + 3)
    subjects = sink.subjects()[before:]
    check("新着通知（2人）と自動返信が届く", arrived and len(subjects) == 3, subjects)
    auto = next((m for m in sink.messages[before:] if str(m["to"]) == "saburo@example.com"), None)
    auto_text = auto.get_content() if auto else ""
    check(
        "自動返信に名前と受付内容が入る",
        "メール 三郎 様" in auto_text and "お住まい: 兵庫県" in auto_text and auto is not None and "受付しました" in str(auto["subject"]),
        auto_text,
    )
    admin_mail = next((m for m in sink.messages[before:] if str(m["to"]) == "owner@example.com"), None)
    item = find(c, "メール 三郎")
    admin_text = admin_mail.get_content() if admin_mail else ""
    check("新着通知に管理画面へのリンクが入る", item and f"http://127.0.0.1:5173/admin/inquiries/{item['id']}" in admin_text, admin_text)

    status, body = c.json(
        "POST", f"/api/admin/inquiries/{tid}/reply", {"subject": "お見積りのご案内", "body": "テスト 太郎 様\n\nよろしくお願いします。"}
    )
    check(
        "お客さまに返信",
        status == 200 and sink.wait_for(before + 4) and str(sink.messages[-1]["to"]) == "taro@example.com",
        (status, body),
    )
    check("返信内容がメモ欄に残る", any(n["kind"] == "email" and "お見積りのご案内" in n["body"] for n in body.get("notes", [])), body.get("notes"))
    check("送信メールの一覧に「送信済み」で出る", any(m["status"] == "sent" and m["kind"] == "reply" for m in body.get("mails", [])), body.get("mails"))

    status, body = c.json("GET", "/api/admin/mail/outbox")
    old = next((m for m in body["items"] if m["status"] == "skipped"), None)
    status, body = c.json("POST", f"/api/admin/mail/outbox/{old['id']}/retry")
    check("未送信のメールを送り直す", status == 200, body)
    status, body = c.json("POST", f"/api/admin/mail/outbox/{old['id']}/retry")
    check("送信済みは送り直さない", status == 400, body)

    status, body = c.json("DELETE", f"/api/admin/mail/outbox/{old['id']}")
    check("送信済みのメールの記録を削除", status == 200, body)
    status, body = c.json("GET", "/api/admin/mail/outbox")
    check("削除した記録は送信履歴から消える", all(m["id"] != old["id"] for m in body["items"]), body["items"][:3])
    check("削除済みの記録をもう一度削除すると 404", c.json("DELETE", f"/api/admin/mail/outbox/{old['id']}")[0] == 404)
    unsent = next((m for m in body["items"] if m["status"] == "skipped"), None)
    status, body = c.json("DELETE", f"/api/admin/mail/outbox/{unsent['id'] if unsent else 0}")
    check("未送信のメールの記録を削除", unsent is not None and status == 200, body)

    c.json("PUT", "/api/admin/mail/smtp", {**smtp, "port": 1})
    status, body = c.json("POST", "/api/admin/mail/test", {"to": "owner@example.com"})
    check("つながらないときは日本語のエラー", status == 400 and "送信できませんでした" in body.get("message", ""), body)
    c.json("PUT", "/api/admin/mail/smtp", {"host": "", "port": 587, "security": "starttls", "username": "", "password": "", "from_address": "", "from_name": ""})

    print("[返信テンプレート]")
    status, body = c.json("GET", "/api/admin/templates")
    check("最初から2つのテンプレートがある", status == 200 and len(body) >= 2, body)
    status, created = c.json("POST", "/api/admin/templates", {"name": "テスト", "subject": "件名 {name}", "body": "本文"})
    check("テンプレートを追加", status == 201 and created["name"] == "テスト", created)
    status, body = c.json("PUT", f"/api/admin/templates/{created['id']}", {"name": "テスト2", "subject": "件名", "body": "本文2"})
    check("テンプレートを変更", status == 200 and body["name"] == "テスト2", body)
    status, body = c.json("POST", "/api/admin/templates", {"name": "", "subject": "", "body": ""})
    check("空のテンプレートは 422", status == 422 and {"name", "subject", "body"} <= set(body.get("errors", {})), body)
    status, body = c.json("DELETE", f"/api/admin/templates/{created['id']}")
    check("テンプレートを削除", status == 200, body)


def test_outlook(c: Client, fake: FakeMicrosoft) -> None:
    print("[Outlook（Microsoft Graph）で送信]")
    c.json(
        "PUT", "/api/admin/mail/notifications",
        {"admin_notify": True, "admin_to": [], "auto_reply": True,
         "auto_reply_subject": "【{business_name}】お問い合わせを受け付けました", "auto_reply_body": "{name} 様\n\n{inquiry_summary}\n",
         "site_url": "http://127.0.0.1:5173"},
    )
    status, body = c.json("PUT", "/api/admin/mail/method", {"method": "outlook"})
    check("送信方法を Outlook に戻す", status == 200 and body["method"] == "outlook", body)
    status, flow = c.json("POST", "/api/admin/mail/outlook/device-code")
    check("サインイン用コードを発行（内部のコードは画面に渡さない）",
          status == 200 and flow.get("user_code") == "TEST-CODE" and "device_code" not in flow, flow)
    status, body = c.json("POST", "/api/admin/mail/outlook/poll", {"flow_id": flow.get("flow_id", "")})
    check("ブラウザでのサインイン前は pending", status == 200 and body.get("status") == "pending", body)
    status, body = c.json("POST", "/api/admin/mail/outlook/poll", {"flow_id": flow.get("flow_id", "")})
    check("サインイン完了", status == 200 and body.get("status") == "ok" and body["settings"]["ready"]
          and body["settings"]["outlook"]["signed_in"], body)
    status, body = c.json("POST", "/api/admin/mail/outlook/poll", {"flow_id": flow.get("flow_id", "")})
    check("使い終わったサインイン用コードは使えない", status == 400, body)

    before = len(fake.sent)
    status, body = c.json("POST", "/api/admin/mail/test", {"to": "owner@example.com"})
    check("Outlook でテストメールを送信", status == 200 and fake.wait_for(before + 1), (status, body))
    check("期限切れ間近のトークンは自動で更新してから送る", "refresh_token" in fake.grants, fake.grants)
    sender = str(fake.sent[-1]["from"]) if fake.sent else ""
    check("差出人は .env の MAIL_FROM_ADDRESS", "owner@example.com" in sender, sender)

    before = len(fake.sent)
    contact(c, name="アウトルック 四郎", email="shiro@example.com")
    arrived = fake.wait_for(before + 2)
    mails = fake.sent[before:]
    notify = next((m for m in mails if str(m["to"]) == "someone6231@outlook.jp"), None)
    auto = next((m for m in mails if str(m["to"]) == "shiro@example.com"), None)
    check("お問い合わせ送信 → someone6231@outlook.jp に新着通知", arrived and notify is not None, [str(m["to"]) for m in mails])
    check("新着通知の件名は元の Laravel 版と同じ形", notify is not None and str(notify["subject"]) == "【お問い合わせ】アウトルック 四郎 様",
          notify and str(notify["subject"]))
    notify_text = notify.get_content() if notify else ""
    check("新着通知の本文（■ 見出しの形・受付日時・管理画面へのリンク）",
          "■ お名前\nアウトルック 四郎" in notify_text and "■ 受付日時" in notify_text and "/admin/inquiries/" in notify_text, notify_text)
    check("新着通知に返信すると、お客さま宛てになる（Reply-To）", notify is not None and str(notify["reply-to"]) == "shiro@example.com",
          notify and notify["reply-to"])
    check("お客さまに自動返信が届く", auto is not None and "アウトルック 四郎 様" in auto.get_content(), auto and auto.get_content())
    status, body = c.json("GET", "/api/admin/mail/outbox")
    check("送信履歴は「送信済み」", all(m["status"] == "sent" for m in body["items"][:3]), body["items"][:3])

    status, body = c.json("POST", "/api/admin/mail/outlook/logout")
    check("サインインを解除", status == 200 and not body["outlook"]["signed_in"] and body["ready"] is False, body)
    status, body = c.json("POST", "/api/admin/mail/test", {"to": "owner@example.com"})
    check("解除後は送れない（理由つき）", status == 400 and "サインイン" in body.get("message", ""), body)


def test_csv(c: Client) -> None:
    print("[CSV]")
    status, headers, content = c.request("GET", "/api/admin/inquiries.csv", headers={"Origin": FRONTEND_ORIGIN})
    text = content.decode("utf-8", "replace")
    check(
        "画面からファイル名を読めるよう公開ヘッダーに含める",
        "content-disposition" in headers.get("access-control-expose-headers", "").lower(),
        headers,
    )
    check("CSV を取得", status == 200 and headers.get("content-type", "").startswith("text/csv"), status)
    check("ファイル名付きでダウンロード", "attachment" in headers.get("content-disposition", ""), headers)
    check("Excel 用の BOM 付き UTF-8", content.startswith(b"\xef\xbb\xbf"), content[:10])
    check("見出し行", '"ID","受付日時","対応状況","ご相談内容","お名前"' in text and '"最終更新"' in text, text[:160])
    topic_label = "Python(React/FastAPI)"
    check(f"ラベルで出力（手渡し・{topic_label}）", "手渡し" in text and topic_label in text, text[:300])
    check("数式として実行されないよう ' を付ける", "\"'=HYPERLINK(\"\"x\"\")\"" in text, "")
    check("改行コードは CRLF", "\r\n" in text, "")
    status, _, content = c.request("GET", f"/api/admin/inquiries.csv?q={urllib.parse.quote('テスト')}")
    rows = content.decode("utf-8").strip().split("\r\n")
    check("CSV も一覧と同じ条件で絞り込める", status == 200 and len(rows) >= 2 and all("テスト" in r for r in rows[1:]), rows[:3])


# ------------------------------------------------------------------ サイト内容・デザイン

def test_theme_and_content(c: Client) -> None:
    print("[デザイン（テーマ色）]")
    status, body = c.json("PUT", "/api/admin/theme", {"primary_color": "#ffff00"})
    check("明るすぎる色は 422（理由つき）", status == 422 and "明るすぎ" in body["errors"].get("primary_color", ""), body)
    status, body = c.json("PUT", "/api/admin/theme", {"primary_color": "red"})
    check("色の形式エラーは 422", status == 422, body)
    status, body = c.json("PUT", "/api/admin/theme", {"primary_color": "#0F766E"})
    check("テーマ色を変更", status == 200 and body["primary_color"] == "#0f766e" and body["default_color"] == "#1558c0", body)
    status, body = c.json("GET", "/api/site")
    check("公開サイトにテーマ色が反映される", body["theme"]["primary_color"] == "#0f766e", body["theme"])
    c.json("PUT", "/api/admin/theme", {"primary_color": "#1558c0"})

    print("[サイト内容]")
    status, body = c.json("GET", "/api/admin/content")
    check("サイト内容を取得（初期値）", status == 200 and body["customized"]["business"] is False, body.get("customized"))
    business = {**body["content"]["business"], "line_url": "javascript:alert(1)"}
    status, body = c.json("PUT", "/api/admin/content/business", business)
    check("LINE の URL は https のみ（不正な URL は 422）", status == 422 and "line_url" in body.get("errors", {}), body)
    business["line_url"] = "https://line.me/ti/p/test"
    business["business_form"] = "個人事業主(開業届 提出済み・2026年10月1日 開業)"
    status, body = c.json("PUT", "/api/admin/content/business", business)
    check("事業者情報を保存", status == 200 and body["customized"]["business"], body.get("customized"))
    status, site = c.json("GET", "/api/site")
    check("公開サイトに事業者情報が反映される", site["content"]["business"]["line_url"] == "https://line.me/ti/p/test", site["content"]["business"])
    status, body = c.json("PUT", "/api/admin/content/business", {**business, "invoice_number": "T123"})
    check("登録番号は T + 13桁のみ（違えば 422）", status == 422 and "invoice_number" in body.get("errors", {}), body)
    status, body = c.json("PUT", "/api/admin/content/business", {**business, "invoice_number": "T1234567890123"})
    check("登録番号を保存", status == 200 and body["content"]["business"]["invoice_number"] == "T1234567890123", body["content"]["business"])
    c.json("PUT", "/api/admin/content/business", business)

    status, body = c.json("PUT", "/api/admin/content/faq", [{"q": "質問1", "a": "回答1"}, {"q": "", "a": "x"}])
    check("よくある質問: 空の質問は 422（何件目かわかる）", status == 422 and "1.q" in body.get("errors", {}), body)
    status, body = c.json("PUT", "/api/admin/content/faq", [{"q": "質問1", "a": "回答1"}])
    check("よくある質問を保存", status == 200 and body["content"]["faq"] == [{"q": "質問1", "a": "回答1"}], body["content"]["faq"])
    status, body = c.json("PUT", "/api/admin/content/prices", {"rows": [{"name": "LP", "price": "10万円"}], "notes": ["税込です", " "]})
    check("料金を保存（空の補足は除く）", status == 200 and body["content"]["prices"]["notes"] == ["税込です"], body["content"]["prices"])
    status, body = c.json(
        "PUT", "/api/admin/content/testimonials",
        [{"name": "A 様", "text": "ありがとうございました", "date": "2026年10月", "published": True}],
    )
    check("お客さまの声を保存", status == 200 and len(body["content"]["testimonials"]) == 1, body["content"]["testimonials"])
    status, body = c.json("PUT", "/api/admin/content/other_works", [{"value": "予約システム"}])
    check("そのほかの制作物を保存", status == 200 and body["content"]["other_works"] == ["予約システム"], body["content"]["other_works"])

    print("[画像のアップロード]")
    status, body = c.json("POST", "/api/admin/uploads", raw=b"not an image", headers={"Content-Type": "image/png"})
    check("画像以外は 422", status == 422 and "PNG" in body.get("message", ""), body)
    status, body = c.json("POST", "/api/admin/uploads", raw=PNG_1PX, headers={"Content-Type": "image/png"})
    check("画像をアップロード", status == 201 and re.match(r"^/uploads/[0-9a-f]{24}\.png$", body.get("url", "")), body)
    url = body.get("url", "")
    status, headers, content = c.request("GET", url)
    check("アップロードした画像を配信", status == 200 and headers.get("content-type") == "image/png" and content == PNG_1PX, status)
    check("おかしなファイル名は 404", c.request("GET", "/uploads/..%2f..%2f.env")[0] == 404)
    status, body = c.json("PUT", "/api/admin/content/works", [{"image": "/etc/passwd", "title": "x"}])
    check("制作実績: アップロード以外の画像パスは 422", status == 422, body)
    status, body = c.json(
        "PUT", "/api/admin/content/works",
        [{"image": url, "alt": "説明", "badge": "新作", "title": "予約サイト", "text": "説明文"}],
    )
    check("制作実績を保存", status == 200 and body["content"]["works"][0]["image"] == url, body["content"]["works"])

    for section in ("business", "prices", "faq", "works", "other_works", "testimonials"):
        c.json("DELETE", f"/api/admin/content/{section}")
    status, body = c.json("GET", "/api/admin/content")
    check("初期値に戻す", status == 200 and not any(body["customized"].values()) and len(body["content"]["faq"]) == 8, body.get("customized"))


# ------------------------------------------------------------------ 見積書・入金・おまかせ管理プラン

def test_billing(c: Client, tid: int) -> None:
    print("[見積書]")
    estimate = {
        "customer_name": "テスト 太郎", "title": "ホームページ制作", "issue_date": "2026-10-27", "valid_until": "2026-11-26",
        "delivery": "ご契約から1か月", "payment_terms": "ご契約時に50%、納品時に50%", "notes": "", "tax_rate": 10,
        "status": "draft", "inquiry_id": tid,
        "items": [
            {"description": "デザイン", "quantity": 1.5, "unit": "式", "unit_price": 10000},
            {"description": "コーディング", "quantity": 1, "unit": "式", "unit_price": 50000},
        ],
    }
    status, body = c.json("POST", "/api/admin/estimates", {**estimate, "items": []})
    check("明細なしは 422", status == 422 and "items" in body.get("errors", {}), body)
    status, body = c.json("POST", "/api/admin/estimates", {**estimate, "valid_until": "2026-10-01"})
    check("有効期限が発行日より前は 422", status == 422 and "有効期限" in json.dumps(body, ensure_ascii=False), body)
    status, body = c.json(
        "POST", "/api/admin/estimates", {**estimate, "items": [{"description": "x", "quantity": "abc", "unit_price": 1}]}
    )
    check("数量が数字でなければ 422（何行目かわかる）", status == 422 and "items.0.quantity" in body.get("errors", {}), body)
    status, created = c.json("POST", "/api/admin/estimates", estimate)
    today = datetime.now(JST).strftime("%Y-%m%d")
    check(
        "見積書を作成（番号は 年-月日-連番-時分）",
        status == 201 and re.fullmatch(rf"{today}-\d{{3}}-\d{{4}}", created["number"]) is not None,
        created,
    )
    check("敬称（初期値は様）", created.get("honorific") == "様", created)
    status, body = c.json("POST", "/api/admin/estimates", {**estimate, "honorific": "殿"})
    check("敬称は様・御中のみ（違えば 422）", status == 422 and "honorific" in body.get("errors", {}), body)
    check(
        "金額の計算（小計65,000・税6,500・合計71,500）",
        (created.get("subtotal"), created.get("tax"), created.get("total")) == (65000, 6500, 71500),
        created,
    )
    eid = created["id"]
    status, body = c.json(
        "PUT", f"/api/admin/estimates/{eid}",
        {**estimate, "status": "accepted", "honorific": "御中"},
    )
    check("見積書を変更（承諾）", status == 200 and body["status"] == "accepted" and body["number"] == created["number"], body)
    check("敬称を変更", body.get("honorific") == "御中", body)

    # 番号は自分で入力できる（空なら自動）
    status, body = c.json("GET", "/api/admin/next-numbers")
    check(
        "次に付く番号を取得（入力欄の初期値）",
        status == 200 and all(re.fullmatch(rf"{today}-\d{{3}}-\d{{4}}", body.get(k, "")) for k in ("estimate", "receipt"))
        and body["estimate"] != created["number"],
        body,
    )
    status, body = c.json("POST", "/api/admin/estimates", {**estimate, "number": created["number"]})
    check("見積番号の重なりは 422", status == 422 and body.get("errors", {}).get("number") == "この番号はすでに使われています。", body)
    status, body = c.json("POST", "/api/admin/estimates", {**estimate, "number": "見積 1"})
    check("見積番号は半角英数字とハイフンのみ（違えば 422）", status == 422 and "半角" in body.get("errors", {}).get("number", ""), body)
    status, own = c.json("POST", "/api/admin/estimates", {**estimate, "number": "TEST-EST-0001"})
    check("見積番号を自分で入力して作成", status == 201 and own.get("number") == "TEST-EST-0001", own)
    c.json("DELETE", f"/api/admin/estimates/{own['id']}")
    status, body = c.json("PUT", f"/api/admin/estimates/{eid}", {**estimate, "status": "accepted", "number": "TEST-EST-0002"})
    check("見積番号をあとから変更", status == 200 and body.get("number") == "TEST-EST-0002", body)
    status, body = c.json("PUT", f"/api/admin/estimates/{eid}", {**estimate, "status": "accepted", "number": created["number"]})
    check("見積番号を元に戻す（同じ見積書の番号は重なりとみなさない）", status == 200 and body.get("number") == created["number"], body)
    status, body = c.json("GET", f"/api/admin/inquiries/{tid}")
    check("お問い合わせの詳細に見積書が出る", any(e["id"] == eid for e in body["estimates"]), body["estimates"])
    status, body = c.json("GET", f"/api/admin/estimates?q={urllib.parse.quote('テスト')}")
    check("見積書の一覧・検索", status == 200 and any(e["id"] == eid for e in body["items"]), body)

    print("[入金・領収書]")
    payment = {
        "customer_name": "テスト 太郎", "description": "ホームページ制作費 着手金として", "amount": 35750,
        "method": "card", "paid_on": "2026-10-28", "note": "", "estimate_id": eid,
    }
    status, body = c.json("POST", "/api/admin/payments", {**payment, "amount": 0})
    check("金額0は 422", status == 422, body)
    status, body = c.json("POST", "/api/admin/payments", {**payment, "method": "bitcoin"})
    check("支払い方法は選択肢のみ", status == 422 and body["errors"].get("method") == "選択肢から選んでください。", body)
    status, paid = c.json("POST", "/api/admin/payments", payment)
    check(
        "入金を記録（領収書番号を自動採番）",
        status == 201 and re.fullmatch(rf"{today}-\d{{3}}-\d{{4}}", paid["receipt_number"]) is not None
        and paid["estimate"]["id"] == eid
        and paid["estimate"]["tax_rate"] == 10,
        paid,
    )
    status, body = c.json("POST", "/api/admin/payments", {**payment, "receipt_number": paid["receipt_number"]})
    check(
        "領収書番号の重なりは 422",
        status == 422 and body.get("errors", {}).get("receipt_number") == "この番号はすでに使われています。",
        body,
    )
    status, body = c.json("PUT", f"/api/admin/payments/{paid['id']}", {**payment, "receipt_number": "TEST-R-0001"})
    check("領収書番号をあとから変更", status == 200 and body.get("receipt_number") == "TEST-R-0001", body)
    c.json("PUT", f"/api/admin/payments/{paid['id']}", {**payment, "receipt_number": paid["receipt_number"]})
    status, body = c.json("GET", f"/api/admin/estimates/{eid}")
    check("見積書に入金済み・残額が出る", body["paid"] == 35750 and body["balance"] == 35750 and len(body["payments"]) == 1, body)
    status, body = c.json("GET", "/api/admin/payments")
    check("入金の一覧と合計", status == 200 and body["total_amount"] >= 35750, body.get("total_amount"))

    print("[おまかせ管理プラン]")
    contract = {
        "customer_name": "テスト 太郎", "email": "taro@example.com", "site_name": "テスト商店", "site_url": "https://example.com",
        "monthly_fee": 5000, "start_date": "2026-10-01", "note": "", "inquiry_id": tid,
    }
    status, body = c.json("POST", "/api/admin/contracts", {**contract, "site_url": "ftp://x"})
    check("サイトの URL の形式エラーは 422", status == 422 and "site_url" in body.get("errors", {}), body)
    status, created_c = c.json("POST", "/api/admin/contracts", contract)
    check("おまかせ管理プランを登録（契約中）", status == 201 and created_c["status"] == "active", created_c)
    status, body = c.json("GET", "/api/admin/dashboard")
    check(
        "ダッシュボードの集計",
        status == 200 and len(body["monthly"]) == 12 and body["this_month"] >= 1
        and body["contracts_active"] >= 1 and body["monthly_revenue"] >= 5000 and body["outstanding"] >= 35750,
        {k: body.get(k) for k in ("this_month", "contracts_active", "monthly_revenue", "outstanding")},
    )
    status, body = c.json("POST", f"/api/admin/contracts/{created_c['id']}/cancel", {"requested_on": "2026-12-15"})
    check("解約の申し出 → 翌月末で終了", status == 200 and body["end_date"] == "2027-01-31" and body["status"] == "cancel_requested", body)
    status, body = c.json("GET", "/api/admin/contracts")
    check("おまかせ管理プランの一覧（状態ごとの件数）", status == 200 and body["counts"]["cancel_requested"] >= 1, body.get("counts"))

    print("[見積書・入金の CSV]")
    for path, name, header, expect in (
        (f"/api/admin/estimates.csv?status=accepted&q={urllib.parse.quote('テスト')}", "estimates_", "見積番号", created["number"]),
        (f"/api/admin/payments.csv?q={urllib.parse.quote(paid['receipt_number'])}", "payments_", "領収書番号", paid["receipt_number"]),
    ):
        status, headers, content = c.request("GET", path)
        text = content.decode("utf-8", "replace")
        rows = text.strip().split("\r\n")
        check(
            f"{name}CSV を取得（BOM 付き・ファイル名・見出し）",
            status == 200 and headers.get("content-type", "").startswith("text/csv")
            and name in headers.get("content-disposition", "") and text.startswith(f'\ufeff"{header}"'),
            (status, headers.get("content-disposition"), text[:80]),
        )
        check(f"{name}CSV は一覧と同じ条件で絞り込める", len(rows) >= 2 and all(expect in r for r in rows[1:]), rows[:3])
    status, _, content = c.request("GET", "/api/admin/estimates.csv?status=accepted")
    check("見積書の CSV に明細と入金済み・残額が入る", "デザイン 1.5式 × 10,000円 = 15,000円" in content.decode("utf-8") and '"35750","35750"' in content.decode("utf-8"), "")
    status, _, _ = c.request("GET", "/api/admin/estimates.csv?status=bad")
    check("CSV も状態の指定が正しくなければ 400", status == 400, status)

    status, body = c.json("DELETE", f"/api/admin/payments/{paid['id']}")
    check("入金の記録を削除", status == 200, body)
    status, body = c.json("DELETE", f"/api/admin/contracts/{created_c['id']}")
    check("おまかせ管理プランを削除", status == 200, body)
    status, body = c.json("DELETE", f"/api/admin/estimates/{eid}")
    check("見積書を削除", status == 200 and c.json("GET", f"/api/admin/estimates/{eid}")[0] == 404, body)


# ------------------------------------------------------------------ データ管理・履歴・アカウント

def test_data_and_logs(c: Client) -> None:
    print("[データ管理]")
    status, body = c.json("PUT", "/api/admin/retention", {"enabled": True, "months": 0, "statuses": ["done"], "spam_days": 30})
    check("自動削除: 0か月は 422", status == 422 and "months" in body.get("errors", {}), body)
    status, body = c.json(
        "PUT", "/api/admin/retention", {"enabled": True, "months": 12, "statuses": ["done", "declined"], "spam_days": 30}
    )
    check("自動削除の設定を保存", status == 200 and body["enabled"] and isinstance(body["targets"], int), body)
    status, body = c.json("POST", "/api/admin/retention/run", {"dry_run": True})
    check("削除対象の件数を確認（削除はしない）", status == 200 and body["count"] == 0, body)
    c.json("PUT", "/api/admin/retention", {"enabled": False, "months": 24, "statuses": ["done", "declined"], "spam_days": 30})

    status, headers, content = c.request("GET", "/api/admin/backup")
    names = zipfile.ZipFile(io.BytesIO(content)).namelist() if status == 200 else []
    check(
        "バックアップ（zip）をダウンロード",
        status == 200 and "data/app.db" in names and headers.get("content-type") == "application/zip",
        names,
    )

    print("[履歴]")
    status, body = c.json("GET", "/api/admin/login-history")
    check(
        "ログイン履歴（成功と失敗）",
        status == 200 and any(i["success"] for i in body["items"]) and any(not i["success"] for i in body["items"]),
        body["items"][:2],
    )
    actions: set[str] = set()
    page, pages_total = 1, 1
    while page <= pages_total and page <= 20:  # すべてのページを読む（念のため20ページまで）
        status, body = c.json("GET", f"/api/admin/audit-logs?page={page}")
        actions |= {i["action"] for i in body["items"]}
        pages_total = body.get("pages", 1)
        page += 1
    check("操作の記録", {"対応状況を変更", "テーマ色を変更", "見積書を作成", "お問い合わせを削除"} <= actions, sorted(actions))


def test_account(c: Client, email_addr: str, password: str, new_password: str) -> None:
    print("[パスワード変更]")
    status, body = c.json("POST", "/api/admin/password", {"current_password": "wrong", "new_password": new_password})
    check("今のパスワードが違うと 422", status == 422 and "current_password" in body.get("errors", {}), body)
    status, body = c.json("POST", "/api/admin/password", {"current_password": password, "new_password": "short"})
    check("短いパスワードは 422", status == 422 and body["errors"].get("new_password") == "8文字以上で入力してください。", body)
    status, body = c.json("POST", "/api/admin/password", {"current_password": password, "new_password": password})
    check("同じパスワードには変えられない", status == 422, body)
    other = Client(c.base_url)
    login(other, email_addr, password)
    status, body = c.json("POST", "/api/admin/password", {"current_password": password, "new_password": new_password})
    check("パスワードを変更", status == 200, body)
    check("変更した画面はログインしたまま", c.json("GET", "/api/admin/me")[0] == 200)
    check("ほかの端末のログインは無効になる", other.json("GET", "/api/admin/me")[0] == 401)
    check("新しいパスワードでログインできる", login(Client(c.base_url), email_addr, new_password) == 200)
    check("古いパスワードではログインできない", login(Client(c.base_url), email_addr, password) == 401)

    print("[ログアウト]")
    status, body = c.json("POST", "/api/admin/logout", {})
    check("ログアウト", status == 200, (status, body))
    status, body = c.json("GET", "/api/admin/me")
    check("ログアウト後は 401", status == 401, (status, body))


def main() -> int:
    parser = argparse.ArgumentParser(description="Katachi API テスト")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--new-password", default="changed-password-456")
    parser.add_argument("--check-login", action="store_true", help="ログインできるかだけ確認する")
    parser.add_argument("--fake-microsoft-port", type=int, default=0, help="Outlook 送信のテスト用に偽の Microsoft サーバーを立てるポート")
    args = parser.parse_args()

    if args.check_login:
        ok = login(Client(args.base_url), args.email, args.password) == 200
        print(f"  {'OK' if ok else 'NG'}   {args.email} でログインできる")
        return 0 if ok else 1

    c = Client(args.base_url)
    test_public(c)
    test_login(c, args.email, args.password)
    tid = test_inquiries(c)
    test_pagination(c)
    test_spam_and_delete(c)
    test_mail(c, tid)
    if args.fake_microsoft_port:
        test_outlook(c, FakeMicrosoft(args.fake_microsoft_port))
    test_csv(c)
    test_theme_and_content(c)
    test_billing(c, tid)
    test_data_and_logs(c)
    test_account(c, args.email, args.password, args.new_password)

    print(f"\n結果: {PASSED} 件成功 / {len(FAILED)} 件失敗")
    for name in FAILED:
        print(f"  失敗: {name}")
    return 1 if FAILED else 0


if __name__ == "__main__":
    sys.exit(main())
