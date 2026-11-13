// 公開サイトのテーマ色（管理画面の「デザイン」で選んだ1色）から、青系の濃淡をまとめて作ります。
// 初期の青を選んだときは、元のデザインの色をそのまま使います。
import type { CSSProperties } from 'react'
import { DEFAULT_PRIMARY } from './site'

const CACHE_KEY = 'bt-theme-color'
const HEX_RE = /^#[0-9a-f]{6}$/i
export const MIN_CONTRAST = 4.5

type Rgb = [number, number, number]

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

/** amount の割合だけ target（白・黒）に近づけます */
function mix(hex: string, target: Rgb, amount: number): string {
  const rgb = toRgb(hex)
  return toHex(rgb.map((v, i) => v + (target[i] - v) * amount) as Rgb)
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value)
}

/** 白との明るさの差（WCAG のコントラスト比）。4.5 以上なら白い文字が読みやすい */
export function contrastWithWhite(hex: string): number {
  const channel = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = toRgb(hex)
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return 1.05 / (luminance + 0.05)
}

/** 白い文字が読める濃さになるまで暗くします */
export function darkenUntilReadable(hex: string): string {
  let color = hex
  for (let i = 0; i < 40 && contrastWithWhite(color) < MIN_CONTRAST; i++) color = mix(color, BLACK, 0.06)
  return color
}

/** テーマ色から CSS 変数を作ります（初期の青のときは空 = 元の色のまま） */
export function themeVars(color: string): CSSProperties {
  if (!isHexColor(color) || color.toLowerCase() === DEFAULT_PRIMARY.toLowerCase()) return {}
  const p = color.toLowerCase()
  const [r, g, b] = toRgb(p)
  const tint = (amount: number) => mix(p, WHITE, amount)
  return {
    '--c-primary': p,
    '--c-primary-dark': mix(p, BLACK, 0.2),
    '--c-primary-rgb': `${r}, ${g}, ${b}`,
    '--shadow-card': `0 12px 32px rgba(${r}, ${g}, ${b}, 0.08)`,
    '--c-accent-1': p,
    '--c-accent-2': tint(0.18),
    '--c-accent-3': tint(0.1),
    '--c-accent-4': tint(0.14),
    '--c-accent-5': tint(0.4),
    '--c-accent-6': tint(0.12),
    '--c-blue-2': tint(0.18),
    '--c-blue-3': tint(0.4),
    '--c-sky': tint(0.14),
    '--c-tint': tint(0.84),
    '--c-tint-2': tint(0.92),
    '--c-tint-3': tint(0.88),
    '--c-tint-4': tint(0.9),
    '--c-current': tint(0.91),
    '--c-hero-from': tint(0.88),
    '--c-hero-mid': tint(0.95),
    '--c-band-card': tint(0.08),
    '--c-band-text': tint(0.84),
    '--c-band-eyebrow': tint(0.76),
  } as CSSProperties
}

export function readCachedColor(): string | null {
  try {
    const value = window.localStorage.getItem(CACHE_KEY)
    return value && isHexColor(value) ? value : null
  } catch {
    return null
  }
}

export function cacheColor(color: string): void {
  try {
    window.localStorage.setItem(CACHE_KEY, color)
  } catch {
    // 保存できなくても表示には影響しません
  }
}

/** ブラウザのタブのアイコンとアドレスバーの色を、テーマ色に合わせます */
export function applyBrowserColor(color: string): void {
  const safe = isHexColor(color) ? color : DEFAULT_PRIMARY
  // タブのアイコンはロゴと同じ画像（public/logo-mark.png）です。テーマ色では変わりません
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) icon.href = '/logo-mark.png'
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', safe)
}

export const THEME_PRESETS: { name: string; color: string }[] = [
  { name: 'ブルー（初期）', color: DEFAULT_PRIMARY },
  { name: 'ネイビー', color: '#1e3a8a' },
  { name: 'ティール', color: '#0f766e' },
  { name: 'グリーン', color: '#15803d' },
  { name: 'パープル', color: '#6d28d9' },
  { name: 'ワイン', color: '#9f1239' },
  { name: 'オレンジ', color: '#c2410c' },
  { name: 'ブラウン', color: '#7c4a1e' },
  { name: 'チャコール', color: '#374151' },
]
