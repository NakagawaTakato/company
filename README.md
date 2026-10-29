# Katachi ホームページ制作サイト

Laravel（PHP）で作られていたサイトを、**フロントエンド React（Vite）／バックエンド FastAPI（Python）** で作り直したものです。
画面は Vite で起動し、`frontend/.env.fastapi` に書いた接続先の API（FastAPI）を呼び出します。

## フォルダ構成

```
python/                          … my-app のルート（C:\Users\document\python）
├── frontend/                    # React (Vite)・ポート 5173
│   ├── src/
│   │   ├── api/client.ts        # API 呼び出しを集約
│   │   ├── App.tsx              # 画面の切り替え（ルーティング）
│   │   ├── pages/ components/ content/ lib/ styles/
│   ├── .env.fastapi             # 接続先：FastAPI (8000) / 画面のポート 5173
│   ├── package.json
│   └── vite.config.ts
│
├── backend/                     # FastAPI（ポート 8000）
│   ├── app/
│   │   ├── main.py              # アプリ本体（CORS・エラー応答・ルーターの登録）
│   │   ├── routers/contact.py   # お問い合わせ受付 API
│   │   ├── routers/admin.py     # 管理画面 API（ログイン・一覧・詳細・CSV）
│   │   ├── schemas.py           # 入出力の型
│   │   └── deps.py config.py db.py security.py inquiries.py
│   └── requirements.txt
│
├── shared/contact_options.json  # フォームの選択肢（画面とバックエンドで共通）
├── data/app.db                  # SQLite データベース
├── .env                         # 設定（管理者ログイン・ポート・CORS）※初回起動時に自動作成
├── run_backend.sh               # 起動コマンド（API + 画面）
├── scripts/common.sh            # 起動コマンドの共通処理
└── tests/                       # API テスト
```

## 起動のしかた（WSL のターミナルで実行）

### かんたんな方法（おすすめ）

```bash
cd /mnt/c/Users/document/python
./run_backend.sh
```

- API（8000）と画面（5173）の両方が起動します。「FastAPI 版 で起動しました」と出たら、Windows のブラウザで http://127.0.0.1:5173 を開いてください。
- 止めるときは `Ctrl+C` を押します（API と画面の両方が止まります）。
- 初回だけ準備に数分かかります。Python の仮想環境、Node.js、npm パッケージは自動で用意されます
  （Node.js は `~/.local/share/bluetab-tools` に入るので、sudo は不要です）。
- オプションは `./run_backend.sh --help` で確認できます。

### 1つずつ起動する方法（ターミナルを2つ使う）

**ターミナル1（API）**
```bash
cd /mnt/c/Users/document/python/backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**ターミナル2（画面）**
```bash
cd /mnt/c/Users/document/python/frontend
export PATH="$HOME/.local/share/bluetab-tools/node/bin:$PATH"
npm run dev:fastapi
```

`Local: http://127.0.0.1:5173/` と出たら、ブラウザで http://127.0.0.1:5173 を開きます。
`npm` が見つからないと出る場合は、2行目の `export` を実行し忘れていないか確認してください（ターミナルを開くたびに必要です）。

## 画面

| URL | 内容 |
| --- | --- |
| http://127.0.0.1:5173/ | トップページ |
| http://127.0.0.1:5173/contact | お問い合わせフォーム（送信すると `/contact/complete`） |
| http://127.0.0.1:5173/line | LINE でのご相談（QR コード） |
| http://127.0.0.1:5173/tokushoho | 事業者情報・お取引について（特定商取引法に基づく表記） |
| http://127.0.0.1:5173/admin/login | 管理者ログイン |
| http://127.0.0.1:5173/admin | お問い合わせ一覧（対応状況で絞り込み、キーワード検索、CSV ダウンロード） |

API の説明ページ（http://127.0.0.1:8000/api/docs）も見られます。http://127.0.0.1:8000 は API なので、サイトの画面は表示されません。

## 管理画面のログイン

初回起動時に `.env` が自動で作られ、ランダムなパスワードが設定されます。
ログイン情報は `.env` の `ADMIN_EMAIL` と `ADMIN_PASSWORD` です。書き換えて API を再起動すると、その内容に変わります。

## 接続先・ポートの設定

| 設定 | ファイル |
| --- | --- |
| 画面がつなぐ API の URL（`VITE_API_BASE_URL`）と画面のポート（`DEV_PORT`） | `frontend/.env.fastapi` |
| API のポート（`BACKEND_PORT=8000`） | `.env` |
| API を呼んでよい画面の URL（CORS の許可：`FRONTEND_ORIGINS`） | `.env` |

ポートを変えるときは、上の設定がそろうように変更してください（`./run_backend.sh` の `PORT=` / `WEB_PORT=` を使う場合は自動でそろえます）。

## 内容を変えたいとき

| 変えたいもの | ファイル |
| --- | --- |
| 事業者情報（電話番号、メール、LINE の URL など） | `frontend/src/lib/site.ts` |
| トップページの文章（経歴、料金、よくある質問など） | `frontend/src/content/home.ts` |
| フォームの選択肢（ご相談内容、支払い方法、都道府県） | `shared/contact_options.json` |
| 事業者情報ページの文章 | `frontend/src/pages/TokushohoPage.tsx` |
| 個人情報の取扱いの文章 | `frontend/src/components/PrivacyPolicy.tsx` |
| API の呼び出し方 | `frontend/src/api/client.ts` |

画面は開発サーバーで動いているので、ファイルを保存するとブラウザに自動で反映されます。
LINE の QR コードは、`site.ts` の URL から自動で作られます。

## テスト

```bash
tests/run_api_tests.sh
```

テスト用の一時データベースで起動して確認するので、`data/app.db` の中身は変わりません。

## 本番公開するとき

- 画面はビルドして、静的ファイルとして公開します。API の公開 URL を指定してビルドしてください。
  `VITE_API_BASE_URL=https://api.example.com npm run build:fastapi`（出力先は `frontend/dist/`）
- `.env` の `FRONTEND_ORIGINS` に、公開する画面の URL（例：`https://www.example.com`）を設定してください。
- ログインの Cookie を使うため、画面と API は同じドメインの配下にしてください（例：`www.example.com` と `api.example.com`）。
- HTTPS で公開し、`.env` の `COOKIE_SECURE=true` にしてください。
- `.env` にはパスワードが入っているため、他の人と共有しないでください（`.gitignore` 済み）。
