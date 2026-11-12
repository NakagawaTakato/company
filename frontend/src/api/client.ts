// API の呼び出しをここにまとめています。
// 接続先は .env.fastapi の VITE_API_BASE_URL（FastAPI: 8000）です。
import type { Business, FaqItem, Prices, SiteContent, SiteData, Testimonial, WorkItem } from '../lib/site'

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost']

function resolveBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  try {
    const url = new URL(raw)
    // ログイン Cookie を使うため、画面と API のホスト名をそろえます
    // （ブラウザは 127.0.0.1 と localhost を別のサイトとして扱うため）
    if (LOOPBACK_HOSTS.includes(url.hostname) && LOOPBACK_HOSTS.includes(window.location.hostname)) {
      url.hostname = window.location.hostname
    }
    return url.toString().replace(/\/+$/, '')
  } catch {
    return raw
  }
}

export const API_BASE_URL = resolveBaseUrl()

/** アップロードした画像（/uploads/...）は API サーバーから、それ以外は画面側から読み込みます */
export function assetUrl(path: string): string {
  return path.startsWith('/uploads/') ? `${API_BASE_URL}${path}` : path
}

export class ApiError extends Error {
  status: number
  errors: Record<string, string>

  constructor(status: number, message: string, errors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

type ErrorBody = { message?: string; errors?: Record<string, string> } | null

const NETWORK_ERROR = '通信に失敗しました。接続を確認して、もう一度お試しください。'

async function send(method: string, path: string, body?: unknown, raw?: Blob): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (raw) headers['Content-Type'] = raw.type || 'application/octet-stream'
  else if (body !== undefined) headers['Content-Type'] = 'application/json'
  try {
    return await fetch(API_BASE_URL + path, {
      method,
      headers,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, NETWORK_ERROR)
  }
}

async function toError(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as ErrorBody
  return new ApiError(res.status, data?.message ?? `エラーが発生しました（${res.status}）。`, data?.errors ?? {})
}

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const res = await send(method, path, body, raw)
  if (!res.ok) throw await toError(res)
  return (await res.json()) as T
}

function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '' && value !== false) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

async function download(path: string, fallbackName: string): Promise<void> {
  const res = await send('GET', path)
  if (!res.ok) throw await toError(res)
  const blob = await res.blob()
  const match = /filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') ?? '')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = match?.[1] ?? fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------- 型

export type Paged<T> = { items: T[]; total: number; page: number; pages: number; per_page: number }

export type ContactPayload = {
  topics: string[]
  name: string
  email: string
  phone: string
  prefecture: string
  age: string
  initial_payment: string
  monthly_payment: string
  agreed: boolean
  website: string // 迷惑送信対策（人には見えない入力欄）
}

export type Inquiry = {
  id: number
  topics: string[]
  name: string
  email: string
  phone: string
  prefecture: string
  age: number | null
  initial_payment: string
  monthly_payment: string
  status: string
  is_spam: boolean
  created_at: string
  updated_at: string
}

export type Note = { id: number; kind: 'note' | 'email' | 'system'; body: string; created_at: string }

export type OutboxMail = {
  id: number
  inquiry_id?: number | null
  inquiry_name?: string | null
  kind: string
  to_addr: string
  subject: string
  status: string
  error: string
  created_at: string
  sent_at: string | null
}

export type InquiryDetail = Inquiry & {
  notes: Note[]
  mails: OutboxMail[]
  estimates: { id: number; number: string; title: string; total: number; status: string; issue_date: string }[]
  contracts: { id: number; site_name: string; monthly_fee: number; status: string; start_date: string }[]
}

export type InquiryList = Paged<Inquiry> & { counts: Record<string, number> }

export type InquiryFilter = {
  status?: string
  q?: string
  from?: string
  to?: string
  spam?: boolean
  sort?: string
  page?: number
}

export type Dashboard = {
  counts: Record<string, number>
  this_month: number
  last_month: number
  monthly: { month: string; count: number }[]
  recent_new: Inquiry[]
  contracts_active: number
  contracts_ending: number
  monthly_revenue: number
  payments_this_month: number
  outstanding: number
  estimates_open: number
  mail_problems: number
  previous_login: { ip: string; created_at: string } | null
}

export type EstimateItem = { description: string; quantity: number; unit: string; unit_price: number; amount?: number }

export type EstimateInput = {
  /** 空なら保存時に自動で付きます */
  number: string
  customer_name: string
  honorific: string
  title: string
  issue_date: string
  valid_until: string
  delivery: string
  payment_terms: string
  notes: string
  tax_rate: number
  status: string
  inquiry_id: number | null
  items: EstimateItem[]
}

export type Estimate = EstimateInput & {
  id: number
  number: string
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
  created_at: string
  updated_at: string
}

export type EstimateDetail = Estimate & { payments: Payment[] }

export type PaymentInput = {
  /** 空なら保存時に自動で付きます */
  receipt_number: string
  customer_name: string
  description: string
  amount: number
  method: string
  paid_on: string
  note: string
  estimate_id: number | null
}

export type Payment = PaymentInput & {
  id: number
  receipt_number: string
  estimate: { id: number; number: string; title: string; tax_rate: number } | null
  created_at: string
}

export type ContractInput = {
  customer_name: string
  email: string
  site_name: string
  site_url: string
  monthly_fee: number
  start_date: string
  cancel_requested_on: string | null
  end_date: string | null
  note: string
  inquiry_id: number | null
}

export type Contract = ContractInput & { id: number; status: string; created_at: string }

export type SmtpSettings = {
  host: string
  port: number
  security: 'starttls' | 'ssl' | 'none'
  username: string
  from_address: string
  from_name: string
  password_set: boolean
  ready: boolean
}

export type Notifications = {
  admin_notify: boolean
  admin_to: string[]
  auto_reply: boolean
  auto_reply_subject: string
  auto_reply_body: string
  site_url: string
}

export type OutlookStatus = { configured: boolean; signed_in: boolean; tenant: string; from_address: string }

export type MailSettings = {
  method: 'outlook' | 'smtp'
  ready: boolean
  reason: string
  smtp: SmtpSettings
  outlook: OutlookStatus
  notifications: Notifications
  business_email: string
}

export type DeviceCode = { flow_id: string; user_code: string; verification_uri: string; expires_in: number; interval: number }

export type ReplyTemplate = { id: number; name: string; subject: string; body: string }

export type Block = { id: number; pattern: string; note: string; created_at: string }

export type Retention = {
  enabled: boolean
  months: number
  statuses: string[]
  spam_days: number
  targets: number
  last_run: { at: string; deleted: number } | null
}

export type LoginRecord = { id: number; email: string; success: number; ip: string; user_agent: string; created_at: string }
export type AuditRecord = { id: number; action: string; detail: string; created_at: string }

export type ContentResponse = { content: SiteContent; customized: Record<keyof SiteContent, boolean> }

// ---------------------------------------------------------------- API

const admin = '/api/admin'

export const api = {
  // 公開サイト
  site: () => request<SiteData>('GET', '/api/site'),
  submitContact: (payload: ContactPayload) => request<{ ok: boolean }>('POST', '/api/contact', payload),

  // ログイン・アカウント
  login: (email: string, password: string) => request<{ email: string }>('POST', `${admin}/login`, { email, password }),
  logout: () => request<{ ok: boolean }>('POST', `${admin}/logout`, {}),
  me: () => request<{ email: string }>('GET', `${admin}/me`),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>('POST', `${admin}/password`, { current_password, new_password }),

  // ダッシュボード・履歴
  dashboard: () => request<Dashboard>('GET', `${admin}/dashboard`),
  loginHistory: (page: number) => request<Paged<LoginRecord>>('GET', `${admin}/login-history${query({ page })}`),
  auditLogs: (page: number) => request<Paged<AuditRecord>>('GET', `${admin}/audit-logs${query({ page })}`),

  // お問い合わせ
  listInquiries: (filter: InquiryFilter) => request<InquiryList>('GET', `${admin}/inquiries${query(filter)}`),
  downloadCsv: (filter: InquiryFilter) => download(`${admin}/inquiries.csv${query({ ...filter, page: undefined })}`, 'inquiries.csv'),
  getInquiry: (id: string | number) => request<InquiryDetail>('GET', `${admin}/inquiries/${encodeURIComponent(id)}`),
  updateInquiry: (id: number, body: { status?: string; is_spam?: boolean }) =>
    request<InquiryDetail>('PATCH', `${admin}/inquiries/${id}`, body),
  deleteInquiry: (id: number) => request<{ ok: boolean }>('DELETE', `${admin}/inquiries/${id}`),
  addNote: (id: number, body: string) => request<Note>('POST', `${admin}/inquiries/${id}/notes`, { body }),
  deleteNote: (id: number, noteId: number) => request<{ ok: boolean }>('DELETE', `${admin}/inquiries/${id}/notes/${noteId}`),
  reply: (id: number, subject: string, body: string) =>
    request<InquiryDetail>('POST', `${admin}/inquiries/${id}/reply`, { subject, body }),

  // 迷惑送信
  blocklist: () => request<Block[]>('GET', `${admin}/blocklist`),
  addBlock: (pattern: string, note = '') => request<Block>('POST', `${admin}/blocklist`, { pattern, note }),
  deleteBlock: (id: number) => request<{ ok: boolean }>('DELETE', `${admin}/blocklist/${id}`),

  // メール
  mailSettings: () => request<MailSettings>('GET', `${admin}/mail/settings`),
  saveSmtp: (body: Omit<SmtpSettings, 'password_set' | 'ready'> & { password: string | null }) =>
    request<MailSettings>('PUT', `${admin}/mail/smtp`, body),
  saveNotifications: (body: Notifications) => request<MailSettings>('PUT', `${admin}/mail/notifications`, body),
  setMailMethod: (method: 'outlook' | 'smtp') => request<MailSettings>('PUT', `${admin}/mail/method`, { method }),
  outlookDeviceCode: () => request<DeviceCode>('POST', `${admin}/mail/outlook/device-code`, {}),
  outlookPoll: (flow_id: string) =>
    request<{ status: 'ok' | 'pending' | 'slow_down'; settings?: MailSettings }>('POST', `${admin}/mail/outlook/poll`, { flow_id }),
  outlookLogout: () => request<MailSettings>('POST', `${admin}/mail/outlook/logout`, {}),
  testMail: (to: string) => request<{ ok: boolean }>('POST', `${admin}/mail/test`, { to }),
  outbox: (page: number) => request<Paged<OutboxMail>>('GET', `${admin}/mail/outbox${query({ page })}`),
  retryMail: (id: number) => request<{ ok: boolean }>('POST', `${admin}/mail/outbox/${id}/retry`, {}),
  deleteMail: (id: number) => request<{ ok: boolean }>('DELETE', `${admin}/mail/outbox/${id}`),
  templates: () => request<ReplyTemplate[]>('GET', `${admin}/templates`),
  createTemplate: (body: Omit<ReplyTemplate, 'id'>) => request<ReplyTemplate>('POST', `${admin}/templates`, body),
  updateTemplate: (id: number, body: Omit<ReplyTemplate, 'id'>) => request<ReplyTemplate>('PUT', `${admin}/templates/${id}`, body),
  deleteTemplate: (id: number) => request<{ ok: boolean }>('DELETE', `${admin}/templates/${id}`),

  // デザイン・サイト内容
  theme: () => request<{ primary_color: string; default_color: string }>('GET', `${admin}/theme`),
  saveTheme: (primary_color: string) =>
    request<{ primary_color: string; default_color: string }>('PUT', `${admin}/theme`, { primary_color }),
  content: () => request<ContentResponse>('GET', `${admin}/content`),
  saveBusiness: (body: Business) => request<ContentResponse>('PUT', `${admin}/content/business`, body),
  savePrices: (body: Prices) => request<ContentResponse>('PUT', `${admin}/content/prices`, body),
  saveFaq: (body: FaqItem[]) => request<ContentResponse>('PUT', `${admin}/content/faq`, body),
  saveWorks: (body: WorkItem[]) => request<ContentResponse>('PUT', `${admin}/content/works`, body),
  saveOtherWorks: (body: string[]) =>
    request<ContentResponse>('PUT', `${admin}/content/other_works`, body.map((value) => ({ value }))),
  saveTestimonials: (body: Testimonial[]) => request<ContentResponse>('PUT', `${admin}/content/testimonials`, body),
  resetContent: (section: keyof SiteContent) => request<ContentResponse>('DELETE', `${admin}/content/${section}`),
  uploadImage: (file: File) => request<{ url: string }>('POST', `${admin}/uploads`, undefined, file),

  // 見積書
  estimates: (filter: { q?: string; status?: string; page?: number; per_page?: number }) =>
    request<Paged<Estimate>>('GET', `${admin}/estimates${query(filter)}`),
  nextNumbers: () => request<{ estimate: string; receipt: string }>('GET', `${admin}/next-numbers`),
  getEstimate: (id: string | number) => request<EstimateDetail>('GET', `${admin}/estimates/${encodeURIComponent(id)}`),
  createEstimate: (body: EstimateInput) => request<Estimate>('POST', `${admin}/estimates`, body),
  updateEstimate: (id: number, body: EstimateInput) => request<EstimateDetail>('PUT', `${admin}/estimates/${id}`, body),
  deleteEstimate: (id: number) => request<{ ok: boolean }>('DELETE', `${admin}/estimates/${id}`),
  downloadEstimatesCsv: (filter: { q?: string; status?: string }) =>
    download(`${admin}/estimates.csv${query(filter)}`, 'estimates.csv'),

  // 入金・領収書
  payments: (filter: { q?: string; page?: number }) =>
    request<Paged<Payment> & { total_amount: number }>('GET', `${admin}/payments${query(filter)}`),
  getPayment: (id: string | number) => request<Payment>('GET', `${admin}/payments/${encodeURIComponent(id)}`),
  createPayment: (body: PaymentInput) => request<Payment>('POST', `${admin}/payments`, body),
  updatePayment: (id: number, body: PaymentInput) => request<Payment>('PUT', `${admin}/payments/${id}`, body),
  deletePayment: (id: number) => request<{ ok: boolean }>('DELETE', `${admin}/payments/${id}`),
  downloadPaymentsCsv: (filter: { q?: string }) => download(`${admin}/payments.csv${query(filter)}`, 'payments.csv'),

  // おまかせ管理プラン
  contracts: (filter: { q?: string; status?: string }) =>
    request<{ items: Contract[]; monthly_revenue: number; counts: Record<string, number> }>(
      'GET',
      `${admin}/contracts${query(filter)}`,
    ),
  createContract: (body: ContractInput) => request<Contract>('POST', `${admin}/contracts`, body),
  updateContract: (id: number, body: ContractInput) => request<Contract>('PUT', `${admin}/contracts/${id}`, body),
  cancelContract: (id: number, requested_on: string) =>
    request<Contract>('POST', `${admin}/contracts/${id}/cancel`, { requested_on }),
  deleteContract: (id: number) => request<{ ok: boolean }>('DELETE', `${admin}/contracts/${id}`),

  // データ管理
  retention: () => request<Retention>('GET', `${admin}/retention`),
  saveRetention: (body: Omit<Retention, 'targets' | 'last_run'>) => request<Retention>('PUT', `${admin}/retention`, body),
  runRetention: (dry_run: boolean) => request<{ count: number }>('POST', `${admin}/retention/run`, { dry_run }),
  downloadBackup: () => download(`${admin}/backup`, 'katachi-backup.zip'),
}
