# 04 API 設計

## 1. 共通の仕様

### 1.1 基本

| 項目 | 内容 |
| --- | --- |
| 接続先 | 開発: `http://127.0.0.1:8000`。画面は `frontend/.env.fastapi` の `VITE_API_BASE_URL` を使う |
| 形式 | リクエスト・レスポンスとも JSON（UTF-8）。例外は CSV（API-11・API-70・API-71）、zip（API-21）、画像のアップロード（API-35）、画像の取得（API-05） |
| 画面からの呼び方 | `fetch` に `credentials: 'include'`（Cookie を送る）。`Accept: application/json`、本文があれば `Content-Type: application/json`（`api/client.ts`） |
| 説明ページ | `/api/docs`（Swagger UI）、`/api/openapi.json`。API-01・API-05 は載せていない |
| 定義されていないパス | 404 `{"message": "見つかりません。"}` |

画面は、API の接続先が `127.0.0.1` か `localhost` で、画面も `127.0.0.1` か `localhost` で開いているときは、API のホスト名を画面と同じにそろえます（ブラウザは 127.0.0.1 と localhost を別のサイトとして扱い、ログインの Cookie が送られなくなるため）。

### 1.2 認証

| 項目 | 内容 |
| --- | --- |
| 方式 | Cookie `bt_admin_session`（API-06 のログインで発行）。中身はランダムなトークン（[07](07_セキュリティ設計.md) 3章） |
| ログインが必要な API | `/api/admin/` で始まる API のうち、API-06（ログイン）と API-07（ログアウト）を除くすべて |
| 未ログイン・期限切れ | 401 `{"message": "ログインしてください。"}` |

### 1.3 エラーの応答

```json
{
  "message": "入力内容をご確認ください。",
  "errors": { "name": "お名前を入力してください。" }
}
```

| 項目 | 内容 |
| --- | --- |
| `message` | 画面にそのまま出せる日本語の文 |
| `errors` | 入力エラーのときだけ。キーは項目名、値はエラー文。入れ子の項目は「.」でつなぐ（例: `rows.0.name`、`items.0.quantity`）。本文がリストの API は先頭が行番号（例: `0.q`）。項目にひもづかないエラー（日付の前後関係など）はキー `body` |

### 1.4 ステータスコード

| コード | 意味 | 主な場合 |
| --- | --- | --- |
| 200 | 成功 | 取得・変更・削除 |
| 201 | 作成した | お問い合わせの受付、メモ・テンプレート・ブロック・見積書・入金・おまかせ管理プランの追加、画像のアップロード |
| 400 | リクエストが正しくない | 本文が JSON のオブジェクトでない、絞り込みの値が正しくない、メールを送れなかった、サインインの期限切れ |
| 401 | 未ログイン | ログインが必要な API を Cookie なしで呼んだ、ログインに失敗した |
| 404 | 見つからない | ID が数字でない・存在しない、定義されていないパス |
| 413 | 大きすぎる | 5MB を超える画像 |
| 422 | 入力エラー | 入力チェックに合わない |
| 429 | 回数が多すぎる | ログインの失敗、お問い合わせの送信 |

### 1.5 入力エラーの文

管理画面からの入力は Pydantic でチェックし、エラーを次の日本語に置き換えます（`main.py` の `_japanese_message`）。お問い合わせ（API-03）とログイン（API-06）は、API の中で個別の文を作ります。

| エラーの種類 | 文 |
| --- | --- |
| 項目がない | 入力してください。 |
| 短すぎる | 入力してください。（最小が1文字のとき）/ {n}文字以上で入力してください。 |
| 長すぎる | {n}文字以内で入力してください。 |
| リストの件数が少ない / 多い | {n}件以上入力してください。/ {n}件以内にしてください。 |
| 数値でない | 数値で入力してください。 |
| 範囲外 | {n}以上で入力してください。/ {n}より大きい値で入力してください。/ {n}以下で入力してください。 |
| 日付の形式 | 日付の形式が正しくありません（例: 2026-10-27）。 |
| 選択肢にない | 選択肢から選んでください。 |
| 真偽でない | はい・いいえで指定してください。 |
| 型が違う | 形式が正しくありません。 |
| 個別のチェック | チェックで決めた文（例: メールアドレスの形式が正しくありません。） |
| そのほか | 入力内容が正しくありません。 |

本文が JSON として読めないときは、400 `{"message": "リクエストの形式が正しくありません。"}` です。入力エラーの `message` は「入力内容をご確認ください。」です。

### 1.6 ページ分け

| 項目 | 内容 |
| --- | --- |
| パラメータ | `?page=`。1〜99999 の整数。それ以外（空・文字・0・全角など）は1ページ目として扱う |
| 1ページの件数 | 20件（見積書の一覧だけ `?per_page=` で1〜100件にできる） |
| 応答 | `{"items": [...], "total": 全件数, "page": ページ, "pages": 全ページ数（最低1）, "per_page": 件数}` |

### 1.7 そのほかの決まり

| 項目 | 内容 |
| --- | --- |
| パスの ID | 12桁以内の半角数字。それ以外は 404 |
| 日時 | UTC の `YYYY-MM-DDTHH:MM:SSZ` |
| 日付 | `YYYY-MM-DD`（日本時間の日付） |
| 文字列の前後の空白 | 管理画面からの入力は、前後の空白を除いてからチェックする |
| 応答ヘッダー（すべての応答） | `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin` |
| 応答ヘッダー（`/api/` 以下） | `Cache-Control: no-store` |
| CORS | `.env` の `FRONTEND_ORIGINS` の接続元だけを許可。Cookie あり、メソッド GET・POST・PUT・PATCH・DELETE、ヘッダー `Content-Type`・`Accept`、画面から読めるヘッダー `Content-Disposition` |
| 操作の記録 | 管理画面での変更・ダウンロードは `audit_logs` に記録する（一覧は [06](06_処理設計.md) 21章） |

## 2. API 一覧

| ID | メソッド | パス | 概要 | ログイン |
| --- | --- | --- | --- | --- |
| API-01 | GET | `/` | API の案内 | 不要 |
| API-02 | GET | `/api/health` | 動作確認 | 不要 |
| API-03 | POST | `/api/contact` | お問い合わせを送信する | 不要 |
| API-04 | GET | `/api/site` | 公開サイトのテーマ色とサイト内容 | 不要 |
| API-05 | GET | `/uploads/{name}` | アップロードした画像 | 不要 |
| API-06 | POST | `/api/admin/login` | ログインする | 不要 |
| API-07 | POST | `/api/admin/logout` | ログアウトする | 不要 |
| API-08 | GET | `/api/admin/me` | ログイン中の管理者 | 必要 |
| API-09 | POST | `/api/admin/password` | パスワードを変更する | 必要 |
| API-10 | GET | `/api/admin/inquiries` | お問い合わせの一覧 | 必要 |
| API-11 | GET | `/api/admin/inquiries.csv` | お問い合わせの CSV | 必要 |
| API-12 | GET | `/api/admin/inquiries/{id}` | お問い合わせの詳細 | 必要 |
| API-13 | PATCH | `/api/admin/inquiries/{id}` | 対応状況・迷惑送信の印を変える | 必要 |
| API-14 | DELETE | `/api/admin/inquiries/{id}` | お問い合わせを削除する | 必要 |
| API-15 | POST | `/api/admin/inquiries/{id}/notes` | 対応メモを追加する | 必要 |
| API-16 | DELETE | `/api/admin/inquiries/{id}/notes/{note_id}` | 対応メモを削除する | 必要 |
| API-17 | POST | `/api/admin/inquiries/{id}/reply` | お客さまにメールで返信する | 必要 |
| API-18 | GET | `/api/admin/dashboard` | ダッシュボードの集計 | 必要 |
| API-19 | GET | `/api/admin/login-history` | ログイン履歴 | 必要 |
| API-20 | GET | `/api/admin/audit-logs` | 操作の記録 | 必要 |
| API-21 | GET | `/api/admin/backup` | バックアップの zip | 必要 |
| API-22 | GET | `/api/admin/retention` | 自動削除の設定 | 必要 |
| API-23 | PUT | `/api/admin/retention` | 自動削除の設定を保存する | 必要 |
| API-24 | POST | `/api/admin/retention/run` | 自動削除を今すぐ実行する | 必要 |
| API-25 | GET | `/api/admin/theme` | テーマ色 | 必要 |
| API-26 | PUT | `/api/admin/theme` | テーマ色を変える | 必要 |
| API-27 | GET | `/api/admin/content` | サイト内容 | 必要 |
| API-28 | PUT | `/api/admin/content/business` | 事業者情報を保存する | 必要 |
| API-29 | PUT | `/api/admin/content/prices` | 料金の目安を保存する | 必要 |
| API-30 | PUT | `/api/admin/content/faq` | よくある質問を保存する | 必要 |
| API-31 | PUT | `/api/admin/content/works` | 制作実績を保存する | 必要 |
| API-32 | PUT | `/api/admin/content/other_works` | そのほかの制作物を保存する | 必要 |
| API-33 | PUT | `/api/admin/content/testimonials` | お客さまの声を保存する | 必要 |
| API-34 | DELETE | `/api/admin/content/{section}` | サイト内容を初期値に戻す | 必要 |
| API-35 | POST | `/api/admin/uploads` | 画像をアップロードする | 必要 |
| API-36 | GET | `/api/admin/mail/settings` | メールの設定 | 必要 |
| API-37 | PUT | `/api/admin/mail/method` | 送信方法を切り替える | 必要 |
| API-38 | POST | `/api/admin/mail/outlook/device-code` | Outlook のサインイン用コードを発行する | 必要 |
| API-39 | POST | `/api/admin/mail/outlook/poll` | Outlook のサインインが終わったか確認する | 必要 |
| API-40 | POST | `/api/admin/mail/outlook/logout` | Outlook のサインインを解除する | 必要 |
| API-41 | PUT | `/api/admin/mail/smtp` | SMTP の設定を保存する | 必要 |
| API-42 | PUT | `/api/admin/mail/notifications` | 新着通知・自動返信の設定を保存する | 必要 |
| API-43 | POST | `/api/admin/mail/test` | テストメールを送る | 必要 |
| API-44 | GET | `/api/admin/mail/outbox` | 送信履歴 | 必要 |
| API-45 | POST | `/api/admin/mail/outbox/{id}/retry` | 送れなかったメールを送り直す | 必要 |
| API-46 | DELETE | `/api/admin/mail/outbox/{id}` | 送信履歴の記録を削除する | 必要 |
| API-47 | GET | `/api/admin/templates` | 返信テンプレートの一覧 | 必要 |
| API-48 | POST | `/api/admin/templates` | 返信テンプレートを追加する | 必要 |
| API-49 | PUT | `/api/admin/templates/{id}` | 返信テンプレートを変える | 必要 |
| API-50 | DELETE | `/api/admin/templates/{id}` | 返信テンプレートを削除する | 必要 |
| API-51 | GET | `/api/admin/blocklist` | ブロックの一覧 | 必要 |
| API-52 | POST | `/api/admin/blocklist` | アドレス・ドメインをブロックする | 必要 |
| API-53 | DELETE | `/api/admin/blocklist/{id}` | ブロックを解除する | 必要 |
| API-54 | GET | `/api/admin/estimates` | 見積書の一覧 | 必要 |
| API-55 | POST | `/api/admin/estimates` | 見積書を作成する | 必要 |
| API-56 | GET | `/api/admin/estimates/{id}` | 見積書の詳細 | 必要 |
| API-57 | PUT | `/api/admin/estimates/{id}` | 見積書を変える | 必要 |
| API-58 | DELETE | `/api/admin/estimates/{id}` | 見積書を削除する | 必要 |
| API-59 | GET | `/api/admin/payments` | 入金の一覧 | 必要 |
| API-60 | POST | `/api/admin/payments` | 入金を記録する | 必要 |
| API-61 | GET | `/api/admin/payments/{id}` | 入金の詳細 | 必要 |
| API-62 | PUT | `/api/admin/payments/{id}` | 入金の記録を変える | 必要 |
| API-63 | DELETE | `/api/admin/payments/{id}` | 入金の記録を削除する | 必要 |
| API-64 | GET | `/api/admin/contracts` | おまかせ管理プランの一覧 | 必要 |
| API-65 | POST | `/api/admin/contracts` | おまかせ管理プランを登録する | 必要 |
| API-66 | GET | `/api/admin/contracts/{id}` | おまかせ管理プランの詳細（画面からは使っていない） | 必要 |
| API-67 | PUT | `/api/admin/contracts/{id}` | おまかせ管理プランを変える | 必要 |
| API-68 | POST | `/api/admin/contracts/{id}/cancel` | 解約の申し出を登録する | 必要 |
| API-69 | DELETE | `/api/admin/contracts/{id}` | おまかせ管理プランを削除する | 必要 |
| API-70 | GET | `/api/admin/estimates.csv` | 見積書の CSV | 必要 |
| API-71 | GET | `/api/admin/payments.csv` | 入金の CSV | 必要 |
| API-72 | GET | `/api/admin/next-numbers` | 次に自動で付く見積番号・領収書番号 | 必要 |

## 3. 共通のデータの形

応答で使うデータの形です。「日時」は 1.7 の形式です。

### Inquiry（お問い合わせ）

| 項目 | 型 | 内容 |
| --- | --- | --- |
| id | 数値 | |
| topics | 文字列の配列 | ご相談内容の値（例 `["python_react_fastapi"]`） |
| name / email / prefecture | 文字列 | |
| phone | 文字列 | 数字のみ |
| age | 数値 / null | |
| initial_payment / monthly_payment | 文字列 | お支払い方法の値 |
| status | 文字列 | 対応状況の値 |
| is_spam | 真偽 | 迷惑送信か |
| created_at / updated_at | 日時 | 受付日時 / 最終更新 |

### InquiryDetail（お問い合わせの詳細）

Inquiry の項目に、次を加えたものです。

| 項目 | 内容 |
| --- | --- |
| notes | Note の配列（新しい順） |
| mails | このお問い合わせの送信履歴（新しい順）。`id, kind, to_addr, subject, status, error, created_at, sent_at` |
| estimates | 関連する見積書（発行日の新しい順・50件まで）。`id, number, title, total, status, issue_date` |
| contracts | 関連するおまかせ管理プラン（開始日の新しい順）。`id, site_name, monthly_fee, status, start_date` |

### Note（メモ・記録）

`id`（数値）、`kind`（`note` 手入力のメモ / `email` 返信したメール / `system` 自動の記録）、`body`（文字列）、`created_at`（日時）

### OutboxMail（送信履歴）

`id, inquiry_id（数値 / null）, inquiry_name（お問い合わせのお名前 / null）, kind, to_addr, subject, status, error, created_at, sent_at（日時 / null）`。値は [05](05_DB設計.md) のコード値のとおりです。

### Estimate（見積書）

| 項目 | 型 | 内容 |
| --- | --- | --- |
| id / number | 数値 / 文字列 | 番号は `YYYY-MMDD-NNN-HHMM`（以前に作ったものは `Q-YYYYMM-NNN` のまま） |
| inquiry_id | 数値 / null | 関連するお問い合わせ |
| customer_name / title / delivery / payment_terms / notes | 文字列 | |
| honorific | 文字列 | 宛名の敬称 `様` / `御中` |
| issue_date / valid_until | 日付 | 発行日 / 有効期限 |
| tax_rate | 数値 | 消費税率（%） |
| status | 文字列 | `draft` / `sent` / `accepted` / `rejected` |
| subtotal / tax / total | 数値 | 小計（税抜）/ 消費税 / 合計（税込） |
| paid / balance | 数値 | 入金済みの合計 / 残額（合計 − 入金済み） |
| created_at / updated_at | 日時 | |
| items | 配列 | 詳細のときだけ。`description, quantity, unit, unit_price, amount`（quantity は整数なら整数で返す。amount は数量 × 単価を四捨五入） |
| payments | Payment の配列 | API-56・API-57 の応答だけ（入金日の新しい順・100件まで） |

### Payment（入金）

| 項目 | 型 | 内容 |
| --- | --- | --- |
| id / receipt_number | 数値 / 文字列 | 番号は `YYYY-MMDD-NNN-HHMM`（以前に作ったものは `R-YYYYMM-NNN` のまま） |
| estimate_id | 数値 / null | 関連する見積書 |
| estimate | オブジェクト / null | `{id, number, title, tax_rate}` |
| customer_name / description / note | 文字列 | お客さま名 / 但し書き / メモ |
| amount | 数値 | 金額（税込） |
| method | 文字列 | `cash` / `card` / `bank` |
| paid_on | 日付 | 入金日 |
| created_at / updated_at | 日時 | |

### Contract（おまかせ管理プラン）

| 項目 | 型 | 内容 |
| --- | --- | --- |
| id | 数値 | |
| inquiry_id | 数値 / null | 関連するお問い合わせ |
| customer_name / email / site_name / site_url / note | 文字列 | |
| monthly_fee | 数値 | 月額（税込） |
| start_date | 日付 | 開始日 |
| cancel_requested_on / end_date | 日付 / null | 解約の申し出日 / 終了日 |
| status | 文字列 | `active` / `cancel_requested` / `ended`（保存せず、その日に計算する。[06](06_処理設計.md) 15章） |
| created_at / updated_at | 日時 | |

### MailSettings（メールの設定）

| 項目 | 内容 |
| --- | --- |
| method | 今の送信方法 `outlook` / `smtp` |
| ready / reason | 今の送信方法で送れるか / 送れないときの理由（[06](06_処理設計.md) 4.3） |
| smtp | `host, port, security, username, from_address, from_name`、`password_set`（パスワードが保存されているか）、`ready`（サーバー名と送信元があるか）。**パスワードそのものは返さない** |
| outlook | `configured`（`.env` に `MICROSOFT_CLIENT_ID` があるか）、`signed_in`（トークンのファイルがあるか）、`tenant`、`from_address`（`.env` の `MAIL_FROM_ADDRESS`、なければ事業者情報のメール） |
| notifications | `admin_notify, admin_to, auto_reply, auto_reply_subject, auto_reply_body, site_url` |
| business_email | 事業者情報のメール |

### Retention（自動削除の設定）

`enabled`（真偽）、`months`（数値）、`statuses`（対応状況の配列）、`spam_days`（数値）、`targets`（今の設定で削除の対象になる件数）、`last_run`（`{"at": 日時, "deleted": 件数}` / null）

### SiteContent（サイト内容）

| 項目 | 内容 |
| --- | --- |
| business | `business_name, owner, address, phone, email, hours, business_form, line_url, invoice_number` |
| prices | `{"rows": [{"name", "price"}], "notes": [文字列]}` |
| faq | `[{"q", "a"}]` |
| works | `[{"image", "alt", "badge", "title", "text"}]` |
| other_works | `[文字列]` |
| testimonials | `[{"name", "text", "date", "published"}]` |

### そのほか

| 名前 | 項目 |
| --- | --- |
| Template（返信テンプレート） | `id, name, subject, body, created_at, updated_at` |
| Block（ブロック） | `id, pattern, note, created_at` |
| LoginRecord（ログイン履歴） | `id, email, success（1 / 0）, ip, user_agent, created_at` |
| AuditRecord（操作の記録） | `id, action, detail, created_at` |

## 4. 各 API の詳細

### 4.1 共通

#### API-01 GET `/`（API の案内）

応答 200: `{"name": "Katachi API", "backend": "fastapi", "docs": "/api/docs"}`

#### API-02 GET `/api/health`（動作確認）

応答 200: `{"status": "ok", "backend": "fastapi"}`。起動スクリプトとテストが、API が起動したかの確認に使います。

### 4.2 公開サイト

#### API-03 POST `/api/contact`（お問い合わせを送信する）

本文（JSON）:

| 項目 | 型 | 必須 | チェック（[06](06_処理設計.md) 2.2） |
| --- | --- | --- | --- |
| topics | 文字列の配列 | ○ | 選択肢にある値が1つ以上（選択肢にない値・重複は捨てる） |
| name | 文字列 | ○ | 前後の空白を除いて1〜100文字 |
| email | 文字列 | ○ | 全角を半角にして、メールの形式・254文字まで |
| phone | 文字列 | ○ | 全角を半角にし、記号を除いて「0で始まる10〜11桁」 |
| prefecture | 文字列 | ○ | 47都道府県のどれか |
| age | 文字列 | − | 空、または1〜120の整数（全角も可） |
| initial_payment | 文字列 | ○ | `cash` / `card` |
| monthly_payment | 文字列 | ○ | `card_auto` / `none` |
| agreed | 真偽 | ○ | `true` |
| website | 文字列 | − | 隠し欄。通常は空 |

応答 201: `{"ok": true}`

処理:

1. 接続元の IP が回数の上限（10分に10件）に達していれば 429。
2. 本文を読む。JSON のオブジェクトでなければ 400。
3. `website` に空白以外の文字があれば、**何も保存せずに** 201 `{"ok": true}` を返す（回数にも数えない）。
4. 入力をチェックして整える。エラーがあれば 422（`errors` にすべての項目のエラー）。
5. メールアドレスがブロックリストに当てはまるか調べる。
6. お問い合わせを保存する（対応状況 `new`、迷惑送信の印は 5 の結果）。
7. 回数に1件数える。
8. 迷惑送信でなければ、新着通知と自動返信を送信履歴に登録し、応答を返したあとで送る（[06](06_処理設計.md) 4.8）。迷惑送信ならメールは送らない。

| コード | 条件 | message |
| --- | --- | --- |
| 400 | 本文が JSON のオブジェクトでない | リクエストの形式が正しくありません。 |
| 422 | 入力エラー | 入力内容をご確認ください。（`errors` つき） |
| 429 | 回数の上限 | 送信回数が多すぎます。しばらくしてからお試しください。 |

#### API-04 GET `/api/site`（公開サイトのテーマ色とサイト内容）

応答 200: `{"theme": {"primary_color": "#1558c0"}, "content": SiteContent}`。保存していない項目は初期値（`shared/site_defaults.json`）を返します。

#### API-05 GET `/uploads/{name}`（アップロードした画像）

| 項目 | 内容 |
| --- | --- |
| name | `^[0-9a-f]{24}\.(png\|jpg\|gif\|webp)$` に合うこと |
| 応答 200 | 画像（Content-Type は拡張子から `image/png`・`image/jpeg`・`image/gif`・`image/webp`）。`Cache-Control: public, max-age=31536000, immutable` |
| 404 | 名前の形式が違う・ファイルがない（「見つかりません。」） |

### 4.3 ログイン・アカウント

#### API-06 POST `/api/admin/login`（ログインする）

本文: `{"email": 文字列, "password": 文字列}`

応答 200: `{"email": "admin@example.com"}` と Cookie。

| Cookie の属性 | 値 |
| --- | --- |
| 名前 | `bt_admin_session` |
| Max-Age | 43200（12時間） |
| Path | `/api` |
| HttpOnly | あり |
| SameSite | Strict |
| Secure | `.env` の `COOKIE_SECURE=true` のときあり |

処理:

1. 接続元の IP が、15分に10回の失敗に達していれば 429。
2. 本文を読む（JSON のオブジェクトでなければ 400）。`email`・`password` が文字列でなければ空として扱う。
3. どちらかが空なら 422「メールアドレスとパスワードを入力してください。」（`errors` はなし）。
4. 認証する（メールは前後の空白を除いて小文字にして比べる。[07](07_セキュリティ設計.md) 2章）。
5. 成功・失敗にかかわらず、ログイン履歴に記録する（メール・結果・IP・User-Agent）。
6. 失敗なら、失敗の回数に1回数えて 401「メールアドレスまたはパスワードが正しくありません。」
7. 成功なら、その IP の失敗の回数を0に戻し、セッションを作って Cookie を発行する。

#### API-07 POST `/api/admin/logout`（ログアウトする）

Cookie があれば、そのセッションを削除します。応答 200 `{"ok": true}` と、Cookie を削除するヘッダー。ログインしていなくても呼べます。

#### API-08 GET `/api/admin/me`（ログイン中の管理者）

応答 200: `{"email": "..."}`。未ログインは 401。

#### API-09 POST `/api/admin/password`（パスワードを変更する）

| 項目 | 型 | 必須 | チェック |
| --- | --- | --- | --- |
| current_password | 文字列 | ○ | 1〜128文字 |
| new_password | 文字列 | ○ | 8〜128文字。今のパスワードと違うこと（同じなら `body`「新しいパスワードは、今のパスワードと別のものにしてください。」） |

処理: 今のパスワードを確かめる（違えば 422 `{"current_password": "今のパスワードが正しくありません。"}`）→ パスワードを変える → **ほかの端末のセッションを削除**（この画面のセッションは残す）→ 操作の記録「パスワードを変更」。応答 200 `{"ok": true}`。

### 4.4 お問い合わせ

#### API-10 GET `/api/admin/inquiries`（お問い合わせの一覧）

| パラメータ | 内容 | 正しくないとき（400） |
| --- | --- | --- |
| status | 対応状況の値。`all` または空なら絞り込まない | 対応状況の指定が正しくありません。 |
| q | お名前・メール（大文字と小文字を区別しない）・電話番号に含まれる文字 | |
| from / to | 受付日（日本時間）。`from` の 0:00 以降、`to` の翌日 0:00 より前 | 開始（終了）の日付の形式が正しくありません（例: 2026-10-27）。 |
| spam | `1` か `true` なら迷惑送信だけ。ほかは迷惑送信以外だけ | |
| sort | `newest`（受付の新しい順・初期）/ `oldest`（古い順）/ `name`（名前順）/ `updated`（更新の新しい順） | 並び順の指定が正しくありません。 |
| page | 1.6 のとおり | |

応答 200: ページ分けの形に `counts` を加えたもの。

`counts`: `{"new": n, "in_progress": n, "quoted": n, "contracted": n, "done": n, "declined": n, "all": 迷惑送信以外の合計, "spam": 迷惑送信の件数}`（絞り込みに関係なく、全体の件数）

#### API-11 GET `/api/admin/inquiries.csv`（お問い合わせの CSV）

パラメータは API-10 と同じです（`page` は使わず、条件に合うすべて）。

応答 200: `Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="inquiries_YYYYMMDD_HHMMSS.csv"`（日時は日本時間）。中身は [06](06_処理設計.md) 10章。操作の記録「お問い合わせを CSV で出力」（{n} 件）。

#### API-12 GET `/api/admin/inquiries/{id}`（お問い合わせの詳細）

応答 200: InquiryDetail。見つからないときは 404「お問い合わせが見つかりません。」

#### API-13 PATCH `/api/admin/inquiries/{id}`（対応状況・迷惑送信の印を変える）

本文: `{"status"?: 文字列, "is_spam"?: 真偽}`（どちらか、または両方）

処理:

1. お問い合わせがなければ 404。
2. `status` が対応状況の値でなければ 422（message「対応状況の指定が正しくありません。」、`{"status": "対応状況を選択してください。"}`）。
3. 指定された項目と最終更新を変える。
4. 対応状況が変わったら、記録「対応状況を「{前}」から「{後}」に変更」と、操作の記録「対応状況を変更」。
5. 迷惑送信の印が変わったら、記録「迷惑送信にしました」/「迷惑送信から戻しました」と、同じ文の操作の記録。

応答 200: InquiryDetail。

#### API-14 DELETE `/api/admin/inquiries/{id}`（お問い合わせを削除する）

処理: お問い合わせを削除します。**メモ・記録（inquiry_notes）と、このお問い合わせの送信履歴（mail_outbox）も削除します**（※課題 No.1: 今は送信履歴が残り、お問い合わせとのひもづけだけが外れる）。見積書・おまかせ管理プランは残し、お問い合わせとのひもづけだけを外します。操作の記録「お問い合わせを削除」。

応答 200: `{"ok": true}`。見つからないときは 404。

#### API-15 POST `/api/admin/inquiries/{id}/notes`（対応メモを追加する）

本文: `{"body": 文字列}`（前後の空白を除いて1〜5000文字）

応答 201: Note。お問い合わせの最終更新も変わります。

#### API-16 DELETE `/api/admin/inquiries/{id}/notes/{note_id}`（対応メモを削除する）

手入力のメモ（`kind = note`）だけ削除できます。自動の記録・返信の記録、存在しないメモは 404「メモが見つかりません。」。応答 200: `{"ok": true}`。

#### API-17 POST `/api/admin/inquiries/{id}/reply`（お客さまにメールで返信する）

本文: `{"subject": 1〜200文字, "body": 1〜20000文字}`

処理:

1. 送信履歴に登録する（種類 `reply`、宛先はお問い合わせのメールアドレス）。
2. その場で送る（[06](06_処理設計.md) 4.1）。送れなければ 400（message は送れなかった理由）。送信履歴には「失敗」または「未送信」として残り、送信履歴から送り直せる。
3. 送れたら、記録（種類 `email`）「メールで返信しました（改行）件名: {件名}（改行2つ）{本文}」を追加する。
4. 対応状況が「未対応」なら「対応中」に変え、記録「返信したため、対応状況を「対応中」に変更」を追加する。
5. 操作の記録「メールで返信」。

応答 200: InquiryDetail。

### 4.5 ダッシュボード・履歴

#### API-18 GET `/api/admin/dashboard`（ダッシュボードの集計）

| 項目 | 内容（計算は [06](06_処理設計.md) 16章） |
| --- | --- |
| counts | API-10 の `counts` と同じ |
| this_month / last_month | 今月・先月のお問い合わせの件数 |
| monthly | 直近12か月の `[{"month": "YYYY-MM", "count": n}]`（古い月から） |
| recent_new | 未対応のお問い合わせ（新しい順・5件）。Inquiry の配列 |
| contracts_active / contracts_ending | 終了していないおまかせ管理プランの件数 / そのうち解約予定の件数 |
| monthly_revenue | 終了していない、開始済みのおまかせ管理プランの月額の合計 |
| payments_this_month | 入金日が今月1日以降の入金の合計 |
| outstanding | 状態が「承諾」の見積書の残額の合計 |
| estimates_open | 状態が「下書き」「送付済み」の見積書の件数 |
| mail_problems | 直近30日に登録した送信履歴のうち「失敗」「未送信」の件数 |
| previous_login | 1つ前の成功したログイン `{"ip", "created_at"}` / null |

#### API-19 GET `/api/admin/login-history`（ログイン履歴）・API-20 GET `/api/admin/audit-logs`（操作の記録）

`?page=` のページ分け（新しい順）。items は LoginRecord / AuditRecord です。

### 4.6 データ管理

#### API-21 GET `/api/admin/backup`（バックアップの zip）

応答 200: `application/zip`、ファイル名 `katachi-backup-YYYYMMDD-HHMMSS.zip`（日本時間）。中身は [06](06_処理設計.md) 12章。応答を送ったあとで一時フォルダを削除します。操作の記録「バックアップをダウンロード」。

#### API-22 GET `/api/admin/retention`（自動削除の設定）

応答 200: Retention。保存していなければ初期値（無効・24か月・対応済みとお断り・迷惑送信30日）です。

#### API-23 PUT `/api/admin/retention`（自動削除の設定を保存する）

| 項目 | 型 | 必須 | チェック |
| --- | --- | --- | --- |
| enabled | 真偽 | ○ | |
| months | 整数 | ○ | 1〜120 |
| statuses | 文字列の配列 | ○ | 10個まで。すべて対応状況の値（違えば 422 `{"statuses": "対応状況を選択してください。"}`） |
| spam_days | 整数 | ○ | 1〜3650 |

応答 200: Retention。操作の記録「自動削除の設定を変更」（「有効 / 24か月 / 迷惑送信 30日」の形）。

#### API-24 POST `/api/admin/retention/run`（自動削除を今すぐ実行する）

本文: `{"dry_run": 真偽}`（省略時 `true`）。**保存済みの設定**で対象を決めます。

- `dry_run: true` … 件数を数えるだけ。
- `dry_run: false` … 削除し（[06](06_処理設計.md) 11章）、前回の実行（日時・件数）を保存して、操作の記録「古いお問い合わせを削除（手動）」。設定が「無効」でも実行します。

応答 200: `{"count": 件数}`

### 4.7 デザイン（色）

#### API-25 GET `/api/admin/theme`（テーマ色）

応答 200: `{"primary_color": "#1558c0", "default_color": "#1558c0"}`（`default_color` は初期の色）

#### API-26 PUT `/api/admin/theme`（テーマ色を変える）

本文: `{"primary_color": 文字列}`

| チェック | エラー文（項目 `primary_color`） |
| --- | --- |
| `#` と16進数6桁（大文字も可） | 色は #1558c0 のような形式で指定してください。 |
| 白い文字とのコントラスト比が 4.5 以上 | この色は明るすぎて、白い文字が読みにくくなります。もう少し濃い色を選んでください。 |

小文字にして保存します。応答は API-25 と同じ。操作の記録「テーマ色を変更」（色）。

### 4.8 サイト内容・画像

#### API-27 GET `/api/admin/content`（サイト内容）

応答 200: `{"content": SiteContent, "customized": {"business": 真偽, "prices": 真偽, "faq": 真偽, "works": 真偽, "other_works": 真偽, "testimonials": 真偽}}`（`customized` は保存したことがあるか）

#### API-28〜33 PUT `/api/admin/content/{項目}`（サイト内容を保存する）

項目ごとに、本文の全体で置き換えます。応答は API-27 と同じ。操作の記録「サイト内容を変更」（項目名）。

| ID | 項目 | 本文 | チェック |
| --- | --- | --- | --- |
| API-28 | business（事業者情報） | オブジェクト | `invoice_number` のほかは必須。`business_name` 1〜60 / `owner` 1〜40 / `address` 1〜100 / `phone` 1〜30 / `email` 1〜254・形式 / `hours` 1〜60 / `business_form` 1〜120 / `line_url` 1〜300・`https://` で始まる URL / `invoice_number` 空、または `T` + 13桁（インボイスの登録番号） |
| API-29 | prices（料金の目安） | `{"rows": [...], "notes": [...]}` | `rows` 1〜30行（`name` 1〜100・`price` 1〜40）。`notes` 10個まで（空は除き、1つ300文字まで。超えると「補足の文章は1つあたり300文字以内にしてください。」） |
| API-30 | faq（よくある質問） | `[{"q", "a"}]` | 50件まで（超えると `body`「よくある質問は50件以内にしてください。」）。`q` 1〜200・`a` 1〜2000 |
| API-31 | works（制作実績） | `[{"image", "alt", "badge", "title", "text"}]` | 20件まで（`body`「制作実績は20件以内にしてください。」）。`image` は `/uploads/{24桁の16進数}.{png・jpg・gif・webp}` か `/images/{英数字・_・-}.{png・jpg・jpeg・gif・webp・svg}`（違えば「画像をアップロードしてください。」）。`alt` 100まで・`badge` 20まで・`title` 1〜60・`text` 300まで |
| API-32 | other_works（そのほかの制作物） | `[{"value"}]` | 40件まで（`body`「そのほかの制作物は40件以内にしてください。」）。`value` 1〜60。保存するときは文字列の配列にする |
| API-33 | testimonials（お客さまの声） | `[{"name", "text", "date", "published"}]` | 50件まで（`body`「お客さまの声は50件以内にしてください。」）。`name` 1〜60・`text` 1〜1000・`date` 30まで・`published` 省略時 `true` |

#### API-34 DELETE `/api/admin/content/{section}`（サイト内容を初期値に戻す）

`section` は6つの項目のどれか（違えば 404「見つかりません。」）。保存した内容を消して初期値に戻します。応答は API-27 と同じ。操作の記録「サイト内容を初期値に戻す」（項目名）。

#### API-35 POST `/api/admin/uploads`（画像をアップロードする）

本文: 画像ファイルそのもの（JSON ではない。`Content-Type` は画像の種類）

処理:

1. `Content-Length` が 5MB（5×1024×1024 バイト）を超えていれば 413「画像は5MB以下にしてください。」
2. 本文を読み、5MB を超えていれば 413（同じ文）。
3. ファイルの先頭のバイトで種類を判定する（PNG・JPEG・GIF・WebP）。どれでもなければ 422「画像は PNG・JPEG・GIF・WebP のいずれかを選んでください。」
4. ランダムな名前（16進数24桁 + 拡張子）で `data/uploads/` に保存する。
5. 操作の記録「画像をアップロード」（ファイル名）。

応答 201: `{"url": "/uploads/{name}"}`。サイト内容（制作実績）に保存するまでは、公開サイトには出ません。

### 4.9 メール

#### API-36 GET `/api/admin/mail/settings`（メールの設定）

応答 200: MailSettings

#### API-37 PUT `/api/admin/mail/method`（送信方法を切り替える）

本文: `{"method": "outlook" | "smtp"}`（ほかの値は 422「選択肢から選んでください。」）。応答 200: MailSettings。操作の記録「メールの送信方法を変更」。

#### API-38 POST `/api/admin/mail/outlook/device-code`（Outlook のサインイン用コードを発行する）

処理（[06](06_処理設計.md) 5章）:

1. Microsoft にサインイン用のコードの発行を依頼する。
2. 新しい `flow_id`（ランダム）を作り、Microsoft から受け取った `device_code` を、期限とともに API のメモリに保存する。期限切れのものは、このときに捨てる。**`device_code` は画面に渡さない。**

応答 200: `{"flow_id", "user_code", "verification_uri", "expires_in"（秒・既定900）, "interval"（秒・既定5）}`

400: `.env` の `MICROSOFT_CLIENT_ID` がない（「.env の MICROSOFT_CLIENT_ID が設定されていません。」）、Microsoft に接続できない、Microsoft がエラーを返した。

#### API-39 POST `/api/admin/mail/outlook/poll`（Outlook のサインインが終わったか確認する）

本文: `{"flow_id": 1〜100文字}`

| 結果 | 応答 |
| --- | --- |
| まだ | 200 `{"status": "pending"}` |
| 確認の間隔を空けてほしい | 200 `{"status": "slow_down"}` |
| 完了（トークンを保存した） | 200 `{"status": "ok", "settings": MailSettings}`。`flow_id` を捨て、操作の記録「Outlook にサインイン」 |
| `flow_id` がない・期限切れ | 400「サインインの有効期限が切れました。もう一度やり直してください。」 |
| Microsoft の期限切れ・キャンセル・そのほかのエラー | 400（理由）。`flow_id` を捨てる |

#### API-40 POST `/api/admin/mail/outlook/logout`（Outlook のサインインを解除する）

トークンのファイル（`data/microsoft-oauth.json`）を削除します。応答 200: MailSettings。操作の記録「Outlook のサインインを解除」。

#### API-41 PUT `/api/admin/mail/smtp`（SMTP の設定を保存する）

| 項目 | 型 | 省略したとき | チェック |
| --- | --- | --- | --- |
| host | 文字列 | 空 | 255文字まで |
| port | 整数 | 587 | 1〜65535 |
| security | 文字列 | `starttls` | `starttls` / `ssl` / `none` |
| username | 文字列 | 空 | 255文字まで |
| password | 文字列 / null | null | 255文字まで。**null なら今のパスワードのまま** |
| from_address | 文字列 | 空 | 254文字まで。空、またはメールの形式 |
| from_name | 文字列 | 空 | 100文字まで |

応答 200: MailSettings。操作の記録「メールの送信設定を変更」（「{host}:{port}」）。

#### API-42 PUT `/api/admin/mail/notifications`（新着通知・自動返信の設定を保存する）

| 項目 | 型 | チェック |
| --- | --- | --- |
| admin_notify | 真偽 | 新着通知を送るか |
| admin_to | 文字列の配列 | 5個まで。空は除き、それぞれメールの形式。空なら事業者情報のメールに送る |
| auto_reply | 真偽 | 自動返信を送るか |
| auto_reply_subject | 文字列 | 1〜200文字 |
| auto_reply_body | 文字列 | 1〜10000文字 |
| site_url | 文字列 | 1〜300文字。末尾の `/` を除いて、`http://` か `https://` で始まる URL |

応答 200: MailSettings。操作の記録「通知・自動返信の設定を変更」。

#### API-43 POST `/api/admin/mail/test`（テストメールを送る）

本文: `{"to": メールアドレス}`

送信履歴に登録して（種類 `test`、件名「【{屋号}】テストメール」、本文「管理画面からのテストメールです。このメールが届いていれば、送信設定は正しく動いています。」）、その場で送ります。送れなければ 400（理由）。応答 200: `{"ok": true}`。操作の記録「テストメールを送信」（宛先）。

#### API-44 GET `/api/admin/mail/outbox`（送信履歴）

`?page=` のページ分け（新しい順）。items は OutboxMail です（本文は返しません）。

#### API-45 POST `/api/admin/mail/outbox/{id}/retry`（送れなかったメールを送り直す）

| 条件 | 応答 |
| --- | --- |
| 記録がない | 404「見つかりません。」 |
| 送信済み | 400「このメールは送信済みです。」 |
| 送れなかった | 400（理由）。状態と理由を更新する |
| 送れた | 200 `{"ok": true}`。操作の記録「メールを送り直し」（「送信履歴 #{id}」） |

#### API-46 DELETE `/api/admin/mail/outbox/{id}`（送信履歴の記録を削除する）

| 条件 | 応答 |
| --- | --- |
| 記録がない | 404「見つかりません。」 |
| 送信中（`pending`） | 400「送信中のメールは削除できません。少し待ってから、もう一度お試しください。」 |
| そのほか | 200 `{"ok": true}`。操作の記録「送信履歴のメールを削除」（「#{id} {宛先}「{件名}」」） |

### 4.10 返信テンプレート

| ID | 処理 | 本文 | 応答 | エラー |
| --- | --- | --- | --- | --- |
| API-47 | 一覧（ID の順） | − | 200 Template の配列 | |
| API-48 | 追加 | `name` 1〜60・`subject` 1〜200・`body` 1〜20000 | 201 Template | 422 |
| API-49 | 変更 | 同上 | 200 Template | 404「テンプレートが見つかりません。」、422 |
| API-50 | 削除 | − | 200 `{"ok": true}` | 404「テンプレートが見つかりません。」 |

追加・変更・削除は、操作の記録「返信テンプレートを追加 / 変更 / 削除」（名前）。

### 4.11 迷惑送信（ブロックリスト）

| ID | 処理 | 本文 | 応答 | エラー |
| --- | --- | --- | --- | --- |
| API-51 | 一覧（新しい順） | − | 200 Block の配列 | |
| API-52 | 追加 | `pattern` 3〜254文字・`note` 200文字まで | 201 Block | 422（下の表） |
| API-53 | 解除 | − | 200 `{"ok": true}` | 404「見つかりません。」 |

`pattern` は小文字にしてからチェックします。

| 形 | チェック | エラー文（項目 `pattern`） |
| --- | --- | --- |
| `@` で始まる（ドメイン） | `@{文字}.{文字}`（空白・`@` を含まない） | ドメインは @example.com のように入力してください。 |
| それ以外（メールアドレス） | メールの形式 | メールアドレスの形式が正しくありません。 |
| すでに同じものがある | | すでにブロックしています。 |

追加・解除は、操作の記録「ブロックに追加 / ブロックを解除」（パターン）。

### 4.12 見積書

#### 本文（API-55・API-57 共通）

| 項目 | 型 | 必須 | チェック |
| --- | --- | --- | --- |
| number | 文字列 | − | 半角の英数字とハイフン（-）で1〜30文字（違えば「半角の英数字とハイフン（-）で、30文字以内で入力してください。」）。ほかの見積書と重なれば 422 `{"number": "この番号はすでに使われています。"}`。空なら作成時は採番し、変更時は今の番号のまま |
| customer_name | 文字列 | ○ | 1〜100文字 |
| title | 文字列 | ○ | 1〜120文字 |
| issue_date / valid_until | 日付 | ○ | 有効期限は発行日以降（違えば `body`「有効期限は発行日以降の日付にしてください。」） |
| honorific | 文字列 | − | `様` / `御中`（省略時 `様`） |
| delivery / payment_terms | 文字列 | − | 200文字まで |
| notes | 文字列 | − | 2000文字まで |
| tax_rate | 整数 | − | 0〜100（省略時 10） |
| status | 文字列 | − | `draft` / `sent` / `accepted` / `rejected`（省略時 `draft`） |
| inquiry_id | 整数 / null | − | 指定したお問い合わせがあること（なければ 422 `{"inquiry_id": "関連するお問い合わせが見つかりません。"}`） |
| items | 配列 | ○ | 1〜50行。各行 `description` 1〜200・`quantity` 0より大きく100000以下・`unit` 10文字まで（省略時「式」）・`unit_price` 0〜100,000,000 の整数 |

#### API-54 GET `/api/admin/estimates`（見積書の一覧）

| パラメータ | 内容 |
| --- | --- |
| q | お客さま名・件名（大文字と小文字を区別しない）・見積番号に含まれる文字 |
| status | 状態（正しくなければ 400「状態の指定が正しくありません。」） |
| page / per_page | 1.6 のとおり（`per_page` は1〜100・省略時20） |

並び順は発行日の新しい順（同じ日は ID の大きい順）。items は Estimate（`items` なし）です。

**API-70 GET `/api/admin/estimates.csv`（見積書の CSV）**: パラメータ `q`・`status` は API-54 と同じ（ページ分けなし・明細つき）。応答 200: `Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="estimates_YYYYMMDD_HHMMSS.csv"`（日時は日本時間）。中身は [06](06_処理設計.md) 10章。操作の記録「見積書を CSV で出力」（{n} 件）。

#### API-55 POST `/api/admin/estimates`（見積書を作成する）

見積番号が空なら採番して保存します（[06](06_処理設計.md) 13章）。応答 201: Estimate（`items` つき）。操作の記録「見積書を作成」（「{番号} {お客さま名} 様 {合計}円」）。お問い合わせにひもづけたときは、そのお問い合わせに記録「見積書 {番号} を作成（{合計}円）」を追加します。

#### API-56 GET `/api/admin/estimates/{id}`（見積書の詳細）

応答 200: Estimate（`items` と `payments` つき）。見つからないときは 404「見積書が見つかりません。」

#### API-57 PUT `/api/admin/estimates/{id}`（見積書を変える）

見積番号は `number` を入れたときだけ変えます（空なら今のまま）。明細はすべて入れ替えます。応答 200: API-56 と同じ。操作の記録「見積書を変更」（「{番号}（{状態}） {合計}円」。番号を変えたときは番号のあとに「（番号 {前の番号} から変更）」）。

#### API-58 DELETE `/api/admin/estimates/{id}`（見積書を削除する）

明細も削除します。入金の記録は残し、見積書とのひもづけだけを外します。応答 200 `{"ok": true}`。操作の記録「見積書を削除」。

### 4.13 入金・領収書

#### 本文（API-60・API-62 共通）

| 項目 | 型 | 必須 | チェック |
| --- | --- | --- | --- |
| receipt_number | 文字列 | − | 半角の英数字とハイフン（-）で1〜30文字（違えば「半角の英数字とハイフン（-）で、30文字以内で入力してください。」）。ほかの領収書と重なれば 422 `{"receipt_number": "この番号はすでに使われています。"}`。空なら作成時は採番し、変更時は今の番号のまま |
| customer_name | 文字列 | ○ | 1〜100文字 |
| description | 文字列 | ○ | 1〜200文字（但し書き） |
| amount | 整数 | ○ | 1〜1,000,000,000 |
| method | 文字列 | ○ | `cash` / `card` / `bank`（違えば「選択肢から選んでください。」） |
| paid_on | 日付 | ○ | |
| note | 文字列 | − | 1000文字まで |
| estimate_id | 整数 / null | − | 指定した見積書があること（なければ 422 `{"estimate_id": "見積書が見つかりません。"}`） |

#### API-59 GET `/api/admin/payments`（入金の一覧）

| パラメータ | 内容 |
| --- | --- |
| q | お客さま名・但し書き（大文字と小文字を区別しない）・領収書番号に含まれる文字 |
| page | 1.6 のとおり |

並び順は入金日の新しい順。応答はページ分けの形に `total_amount`（**検索条件に合う入金すべての合計**。ページに関係なく計算）を加えたものです。

**API-71 GET `/api/admin/payments.csv`（入金の CSV）**: パラメータ `q` は API-59 と同じ（ページ分けなし）。応答 200: `Content-Type: text/csv; charset=utf-8`、`Content-Disposition: attachment; filename="payments_YYYYMMDD_HHMMSS.csv"`（日時は日本時間）。中身は [06](06_処理設計.md) 10章。操作の記録「入金の記録を CSV で出力」（{n} 件）。

**API-72 GET `/api/admin/next-numbers`（次に付く番号）**: 応答 200 `{"estimate": "2026-1111-002-1530", "receipt": "2026-1111-002-1530"}`。いま作ったら自動で付く見積番号・領収書番号です（[06](06_処理設計.md) 13章）。見積書の作成画面（A-06）と入金の記録（A-08）の入力欄の初期値に使います。番号は取っておかないので、保存までにほかの記録が作られると、保存時に重なりの 422 になることがあります。

#### API-60 POST `/api/admin/payments`（入金を記録する）

領収書番号が空なら採番して保存します（[06](06_処理設計.md) 14章）。応答 201: Payment。操作の記録「入金を記録」（「{番号} {お客さま名} 様 {金額}円」）。

#### API-61 GET `/api/admin/payments/{id}`（入金の詳細）

応答 200: Payment。見つからないときは 404「入金の記録が見つかりません。」

#### API-62 PUT `/api/admin/payments/{id}`（入金の記録を変える）

領収書番号は `receipt_number` を入れたときだけ変えます（空なら今のまま）。応答 200: Payment。操作の記録「入金の記録を変更」（番号を変えたときは「（番号 {前の番号} から変更）」つき）。

#### API-63 DELETE `/api/admin/payments/{id}`（入金の記録を削除する）

応答 200 `{"ok": true}`。操作の記録「入金の記録を削除」。

### 4.14 おまかせ管理プラン

#### 本文（API-65・API-67 共通）

| 項目 | 型 | 必須 | チェック |
| --- | --- | --- | --- |
| customer_name | 文字列 | ○ | 1〜100文字 |
| email | 文字列 | − | 254文字まで。空、またはメールの形式 |
| site_name | 文字列 | ○ | 1〜100文字 |
| site_url | 文字列 | − | 300文字まで。空、または `http://`・`https://` で始まる URL |
| monthly_fee | 整数 | ○ | 0〜10,000,000 |
| start_date | 日付 | ○ | |
| cancel_requested_on | 日付 / null | − | |
| end_date | 日付 / null | − | 開始日以降（違えば `body`「終了日は開始日以降の日付にしてください。」） |
| note | 文字列 | − | 1000文字まで |
| inquiry_id | 整数 / null | − | 指定したお問い合わせがあること |

#### API-64 GET `/api/admin/contracts`（おまかせ管理プランの一覧）

| パラメータ | 内容 |
| --- | --- |
| status | `active` / `cancel_requested` / `ended`（正しくなければ 400「状態の指定が正しくありません。」） |
| q | お客さま名・サイト名（大文字と小文字を区別しない）に含まれる文字 |

ページ分けはしません。並び順は開始日の新しい順。

応答 200: `{"items": Contract の配列, "monthly_revenue": 終了していない・開始済みの契約の月額の合計, "counts": {"active": n, "cancel_requested": n, "ended": n}}`（`monthly_revenue` と `counts` は絞り込みに関係なく全体で計算）

#### API-65 POST `/api/admin/contracts`（おまかせ管理プランを登録する）

応答 201: Contract。操作の記録「おまかせ管理プランを登録」（「{お客さま名} 様 {サイト名} 月額{金額}円」）。お問い合わせにひもづけたときは、そのお問い合わせに記録「おまかせ管理プラン「{サイト名}」を登録」を追加します。

#### API-66 GET `/api/admin/contracts/{id}`・API-67 PUT（詳細・変更）・API-69 DELETE（削除）

見つからないときは 404「おまかせ管理プランが見つかりません。」。変更・削除は操作の記録「おまかせ管理プランを変更 / おまかせ管理プランを削除」。

#### API-68 POST `/api/admin/contracts/{id}/cancel`（解約の申し出を登録する）

本文: `{"requested_on"?: 日付}`（省略時は今日・日本時間）

申し出日を保存し、終了日を**申し出日の翌月末**にします（[06](06_処理設計.md) 15章）。応答 200: Contract。操作の記録「おまかせ管理プランの解約申し出を登録」（「{お客さま名} 様 {サイト名}（{終了日} で終了）」）。
