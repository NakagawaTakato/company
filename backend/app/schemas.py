"""API の入出力の型（Pydantic）。/api/docs の説明ページにも使われます。

- お問い合わせフォームの入力チェック（日本語のエラー文）は inquiries.validate_contact() で行います。
- 管理画面の入力はここの型でチェックし、エラー文は main.py で日本語に変換して返します。
"""

from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator

from .inquiries import EMAIL_RE
from .uploads import NAME_RE

HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
URL_RE = re.compile(r"^https?://[^\s<>\"']+$")
MIN_CONTRAST = 4.5


class Model(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


def _email(value: str) -> str:
    if not EMAIL_RE.match(value) or len(value) > 254:
        raise ValueError("メールアドレスの形式が正しくありません。")
    return value


def _optional_email(value: str) -> str:
    return _email(value) if value else value


def _url(value: str, https_only: bool = False) -> str:
    if not URL_RE.match(value) or (https_only and not value.startswith("https://")):
        raise ValueError("https:// で始まる URL を入力してください。" if https_only else "http:// または https:// で始まる URL を入力してください。")
    return value


EmailText = Annotated[str, AfterValidator(_email)]
OptionalEmailText = Annotated[str, AfterValidator(_optional_email)]
HttpUrlText = Annotated[str, AfterValidator(lambda v: _url(v.rstrip("/")))]
HttpsUrlText = Annotated[str, AfterValidator(lambda v: _url(v, https_only=True))]
OptionalUrlText = Annotated[str, AfterValidator(lambda v: _url(v) if v else v)]


DOC_NUMBER_RE = re.compile(r"[A-Za-z0-9-]{1,30}")


def _doc_number(value: str) -> str:
    if value and not DOC_NUMBER_RE.fullmatch(value):
        raise ValueError("半角の英数字とハイフン（-）で、30文字以内で入力してください。")
    return value


# 見積番号・領収書番号（空なら自動で付けます）
DocNumberText = Annotated[str, AfterValidator(_doc_number)]


def contrast_with_white(hex_color: str) -> float:
    def channel(c: int) -> float:
        v = c / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    return 1.05 / (luminance + 0.05)


# ------------------------------------------------------------------ 共通

class ErrorResponse(BaseModel):
    message: str = Field(examples=["入力内容をご確認ください。"])
    errors: dict[str, str] | None = Field(default=None, examples=[{"name": "お名前を入力してください。"}])


class OkResponse(BaseModel):
    ok: bool = True


class HealthResponse(BaseModel):
    status: str = Field(examples=["ok"])
    backend: str = Field(examples=["fastapi"])


# ------------------------------------------------------------------ お問い合わせ（公開）

class ContactRequest(BaseModel):
    topics: list[str] = Field(description="ご相談内容", examples=[["python_react_fastapi"]])
    name: str = Field(description="お名前", examples=["山田 太郎"])
    email: str = Field(description="メールアドレス", examples=["taro@example.com"])
    phone: str = Field(description="電話番号（ハイフンあり・なし、全角も可）", examples=["090-1234-5678"])
    prefecture: str = Field(description="お住まい（都道府県）", examples=["兵庫県"])
    age: str = Field(default="", description="ご年齢（任意）", examples=["30"])
    initial_payment: str = Field(description="初期費用のお支払い方法", examples=["cash"])
    monthly_payment: str = Field(description="月額(おまかせ管理プラン)のお支払い方法", examples=["none"])
    agreed: bool = Field(description="「個人情報の取扱い」への同意", examples=[True])
    website: str = Field(default="", description="迷惑送信対策の隠し欄（通常は空）")


def json_body(model: type[BaseModel]) -> dict[str, Any]:
    """入力チェックは自前で行う API に、説明ページ用のリクエスト形式だけを付けます。"""
    return {
        "requestBody": {
            "required": True,
            "content": {"application/json": {"schema": model.model_json_schema()}},
        }
    }


# ------------------------------------------------------------------ 管理画面: ログイン・アカウント

class LoginRequest(BaseModel):
    email: str = Field(examples=["admin@example.com"])
    password: str


class AdminResponse(BaseModel):
    email: str


class PasswordChange(Model):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def different(self) -> "PasswordChange":
        if self.current_password == self.new_password:
            raise ValueError("新しいパスワードは、今のパスワードと別のものにしてください。")
        return self


# ------------------------------------------------------------------ 管理画面: お問い合わせ

class InquiryUpdate(Model):
    status: str | None = None
    is_spam: bool | None = None


class NoteCreate(Model):
    body: str = Field(min_length=1, max_length=5000)


class ReplyRequest(Model):
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)


# ------------------------------------------------------------------ 管理画面: デザイン（テーマ色）

class ThemeUpdate(Model):
    primary_color: str

    @field_validator("primary_color")
    @classmethod
    def check_color(cls, value: str) -> str:
        if not HEX_RE.match(value):
            raise ValueError("色は #1558c0 のような形式で指定してください。")
        if contrast_with_white(value) < MIN_CONTRAST:
            raise ValueError("この色は明るすぎて、白い文字が読みにくくなります。もう少し濃い色を選んでください。")
        return value.lower()


# ------------------------------------------------------------------ 管理画面: メール

class SmtpUpdate(Model):
    host: str = Field(default="", max_length=255)
    port: int = Field(default=587, ge=1, le=65535)
    security: Literal["starttls", "ssl", "none"] = "starttls"
    username: str = Field(default="", max_length=255)
    password: str | None = Field(default=None, max_length=255, description="null のときは変更しない")
    from_address: OptionalEmailText = Field(default="", max_length=254)
    from_name: str = Field(default="", max_length=100)


class NotificationsUpdate(Model):
    admin_notify: bool
    admin_to: list[str] = Field(default_factory=list, max_length=5)
    auto_reply: bool
    auto_reply_subject: str = Field(min_length=1, max_length=200)
    auto_reply_body: str = Field(min_length=1, max_length=10000)
    site_url: HttpUrlText = Field(min_length=1, max_length=300)

    @field_validator("admin_to")
    @classmethod
    def check_admin_to(cls, value: list[str]) -> list[str]:
        cleaned = [v.strip() for v in value if v.strip()]
        for address in cleaned:
            _email(address)
        return cleaned


class MailMethodUpdate(Model):
    method: Literal["outlook", "smtp"]


class OutlookPoll(Model):
    flow_id: str = Field(min_length=1, max_length=100)


class TestMailRequest(Model):
    to: EmailText


class TemplateIn(Model):
    name: str = Field(min_length=1, max_length=60)
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20000)


class BlockIn(Model):
    pattern: str = Field(min_length=3, max_length=254)
    note: str = Field(default="", max_length=200)

    @field_validator("pattern")
    @classmethod
    def check_pattern(cls, value: str) -> str:
        value = value.lower()
        if value.startswith("@"):
            if not re.match(r"^@[^\s@]+\.[^\s@]+$", value):
                raise ValueError("ドメインは @example.com のように入力してください。")
            return value
        return _email(value)


# ------------------------------------------------------------------ 管理画面: データ管理

class RetentionUpdate(Model):
    enabled: bool
    months: int = Field(ge=1, le=120)
    statuses: list[str] = Field(max_length=10)
    spam_days: int = Field(ge=1, le=3650)


class RetentionRun(Model):
    dry_run: bool = True


# ------------------------------------------------------------------ 管理画面: サイト内容

class BusinessIn(Model):
    business_name: str = Field(min_length=1, max_length=60)
    owner: str = Field(min_length=1, max_length=40)
    address: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=1, max_length=30)
    email: EmailText = Field(min_length=1, max_length=254)
    hours: str = Field(min_length=1, max_length=60)
    business_form: str = Field(min_length=1, max_length=120)
    line_url: HttpsUrlText = Field(min_length=1, max_length=300)
    # インボイスの登録番号（T + 13桁）。空なら見積書に印刷しません。
    invoice_number: str = Field(default="", pattern=r"^(T\d{13})?$")


class PriceRow(Model):
    name: str = Field(min_length=1, max_length=100)
    price: str = Field(min_length=1, max_length=40)


class PricesIn(Model):
    rows: list[PriceRow] = Field(min_length=1, max_length=30)
    notes: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("notes")
    @classmethod
    def check_notes(cls, value: list[str]) -> list[str]:
        cleaned = [v.strip() for v in value if v.strip()]
        if any(len(v) > 300 for v in cleaned):
            raise ValueError("補足の文章は1つあたり300文字以内にしてください。")
        return cleaned


class FaqItem(Model):
    q: str = Field(min_length=1, max_length=200)
    a: str = Field(min_length=1, max_length=2000)


class WorkItem(Model):
    image: str = Field(min_length=1, max_length=200)
    alt: str = Field(default="", max_length=100)
    badge: str = Field(default="", max_length=20)
    title: str = Field(min_length=1, max_length=60)
    text: str = Field(default="", max_length=300)

    @field_validator("image")
    @classmethod
    def check_image(cls, value: str) -> str:
        if value.startswith("/uploads/") and NAME_RE.match(value.removeprefix("/uploads/")):
            return value
        if re.match(r"^/images/[A-Za-z0-9_\-]+\.(png|jpg|jpeg|gif|webp|svg)$", value):
            return value
        raise ValueError("画像をアップロードしてください。")


class OtherWork(Model):
    value: str = Field(min_length=1, max_length=60)


class Testimonial(Model):
    name: str = Field(min_length=1, max_length=60)
    text: str = Field(min_length=1, max_length=1000)
    date: str = Field(default="", max_length=30)
    published: bool = True


# ------------------------------------------------------------------ 管理画面: 見積書・入金・おまかせ管理プラン

class EstimateItemIn(Model):
    description: str = Field(min_length=1, max_length=200)
    quantity: float = Field(gt=0, le=100000)
    unit: str = Field(default="式", max_length=10)
    unit_price: int = Field(ge=0, le=100_000_000)


class EstimateIn(Model):
    number: DocNumberText = ""
    customer_name: str = Field(min_length=1, max_length=100)
    honorific: Literal["様", "御中"] = "様"
    title: str = Field(min_length=1, max_length=120)
    issue_date: date
    valid_until: date
    delivery: str = Field(default="", max_length=200)
    payment_terms: str = Field(default="", max_length=200)
    notes: str = Field(default="", max_length=2000)
    tax_rate: int = Field(default=10, ge=0, le=100)
    status: Literal["draft", "sent", "accepted", "rejected"] = "draft"
    inquiry_id: int | None = None
    items: list[EstimateItemIn] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def check_dates(self) -> "EstimateIn":
        if self.valid_until < self.issue_date:
            raise ValueError("有効期限は発行日以降の日付にしてください。")
        return self


class PaymentIn(Model):
    receipt_number: DocNumberText = ""
    customer_name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=200)
    amount: int = Field(ge=1, le=1_000_000_000)
    method: Literal["cash", "card", "bank"]
    paid_on: date
    note: str = Field(default="", max_length=1000)
    estimate_id: int | None = None


class ContractIn(Model):
    customer_name: str = Field(min_length=1, max_length=100)
    email: OptionalEmailText = Field(default="", max_length=254)
    site_name: str = Field(min_length=1, max_length=100)
    site_url: OptionalUrlText = Field(default="", max_length=300)
    monthly_fee: int = Field(ge=0, le=10_000_000)
    start_date: date
    cancel_requested_on: date | None = None
    end_date: date | None = None
    note: str = Field(default="", max_length=1000)
    inquiry_id: int | None = None

    @model_validator(mode="after")
    def check_dates(self) -> "ContractIn":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("終了日は開始日以降の日付にしてください。")
        return self


class CancelRequest(Model):
    requested_on: date | None = None


# ------------------------------------------------------------------ 説明ページ用

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse, "description": "リクエストの形式が正しくない"},
    422: {"model": ErrorResponse, "description": "入力内容のエラー"},
}

AUTH_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse, "description": "未ログイン"},
}
