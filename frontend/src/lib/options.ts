// フォームの選択肢は shared/contact_options.json で一元管理しています。
// FastAPI のバックエンドも同じファイルを読み込んで入力チェックをします。
import options from '../../../shared/contact_options.json'

export type Option = { value: string; label: string }

export const TOPICS: Option[] = options.topics
export const INITIAL_PAYMENTS: Option[] = options.initial_payments
export const MONTHLY_PAYMENTS: Option[] = options.monthly_payments
export const STATUSES: Option[] = options.statuses
export const PREFECTURES: string[] = options.prefectures

export const ESTIMATE_STATUSES: Option[] = [
  { value: 'draft', label: '下書き' },
  { value: 'sent', label: '送付済み' },
  { value: 'accepted', label: '承諾' },
  { value: 'rejected', label: '不成立' },
]

export const PAYMENT_METHODS: Option[] = [
  { value: 'cash', label: '現金（手渡し）' },
  { value: 'card', label: 'クレジットカード' },
  { value: 'bank', label: '銀行振込' },
]

export const CONTRACT_STATUSES: Option[] = [
  { value: 'active', label: '契約中' },
  { value: 'cancel_requested', label: '解約予定' },
  { value: 'ended', label: '終了' },
]

export const MAIL_KINDS: Option[] = [
  { value: 'admin_notify', label: '新着通知' },
  { value: 'auto_reply', label: '自動返信' },
  { value: 'reply', label: '返信' },
  { value: 'test', label: 'テスト' },
]

export const MAIL_STATUSES: Option[] = [
  { value: 'pending', label: '送信中' },
  { value: 'sent', label: '送信済み' },
  { value: 'failed', label: '失敗' },
  { value: 'skipped', label: '未送信' },
]

export const SORTS: Option[] = [
  { value: 'newest', label: '新しい順' },
  { value: 'oldest', label: '古い順' },
  { value: 'updated', label: '更新が新しい順' },
  { value: 'name', label: '名前順' },
]

export function labelOf(list: Option[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value
}
