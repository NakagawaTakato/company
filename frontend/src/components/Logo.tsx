import { Link } from 'react-router'
import { BRAND } from '../lib/site'

// 電球と回路のアイコンです（AIのひらめき）。形を変えるときは、ブラウザのタブのアイコン
// （lib/theme.ts の applyBrowserColor と public/favicon.svg）も同じ形にそろえてください。
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      <rect className="logo-mark__bg" width="44" height="44" rx="10" />
      <g fill="#fff">
        <path d="M22 7C27.8 7 32 11.3 32 16.8C32 20.4 30.2 22.9 28.3 24.8C27.3 25.8 26.8 27 26.8 28.4V29.5H17.2V28.4C17.2 27 16.7 25.8 15.7 24.8C13.8 22.9 12 20.4 12 16.8C12 11.3 16.2 7 22 7Z" />
        <rect x="17.2" y="31" width="9.6" height="2.4" rx="1.2" />
        <rect x="18.6" y="34.6" width="6.8" height="2.2" rx="1.1" />
      </g>
      {/* 電球の中の回路は背景と同じ色（テーマ色）にして、くり抜いたように見せます */}
      <path
        className="logo-mark__line"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 27.5V14.2M22 23.5L17.5 19V16.6M22 21L26.5 16.5V15.6"
      />
      <g className="logo-mark__bg">
        <circle cx="22" cy="12.6" r="1.7" />
        <circle cx="17.5" cy="15" r="1.7" />
        <circle cx="26.5" cy="14" r="1.7" />
      </g>
    </svg>
  )
}

type LogoProps = {
  /** stacked: トップページ用（下にサブタイトル）/ inline: 下層ページ用（右にサブタイトル） */
  variant?: 'stacked' | 'inline'
  subtitle?: string
  to?: string
}

export function Logo({ variant = 'inline', subtitle = BRAND.tagline, to = '/' }: LogoProps) {
  return (
    <Link to={to} className={`logo logo--${variant}`} aria-label={`${BRAND.brand} ${subtitle}`}>
      <LogoMark size={variant === 'stacked' ? 36 : 32} />
      <span className="logo__text">
        <span className="logo__brand">{BRAND.brand}</span>
        <span className="logo__sub">{subtitle}</span>
      </span>
    </Link>
  )
}
