// 日付・金額の表示をそろえるための関数です（日時は日本時間で表示します）。

const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 2026-10-26T05:00:00Z → 2026/10/26 14:00 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date)
}

/** 2026-10-27 → 2026年10月27日 */
export function formatJpDate(day: string | null | undefined): string {
  if (!day) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : day
}

/** 12345 → 12,345円 */
export function yen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`
}

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(): string {
  return dateFormatter.format(new Date()).replace(/\//g, '-')
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 2026-10 → 10月 / 年が変わる月は 2027年1月 */
export function monthLabel(month: string, withYear = false): string {
  const [y, m] = month.split('-')
  return withYear ? `${y}年${Number(m)}月` : `${Number(m)}月`
}
