// サイトの表示内容の型と初期値です。
// 事業者情報・料金・よくある質問などは、管理画面の「サイト内容」から変更できます。
// 初期値は shared/site_defaults.json（バックエンドと共通）にあります。
import defaults from '../../../shared/site_defaults.json'

export const BRAND = {
  brand: 'Katachi',
  tagline: 'ホームページ制作',
} as const

export type Business = {
  business_name: string
  owner: string
  address: string
  phone: string
  email: string
  hours: string
  business_form: string
  line_url: string
}

export type PriceRow = { name: string; price: string }
export type Prices = { rows: PriceRow[]; notes: string[] }
export type FaqItem = { q: string; a: string }
export type WorkItem = { image: string; alt: string; badge: string; title: string; text: string }
export type Testimonial = { name: string; text: string; date: string; published: boolean }

export type SiteContent = {
  business: Business
  prices: Prices
  faq: FaqItem[]
  works: WorkItem[]
  other_works: string[]
  testimonials: Testimonial[]
}

export type SiteData = {
  theme: { primary_color: string }
  content: SiteContent
}

export const DEFAULT_PRIMARY = defaults.theme.primary_color

export const DEFAULT_CONTENT: SiteContent = {
  business: defaults.business,
  prices: defaults.prices,
  faq: defaults.faq,
  works: defaults.works,
  other_works: defaults.other_works,
  testimonials: defaults.testimonials as Testimonial[],
}
