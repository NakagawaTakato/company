import { Link } from 'react-router'
import { BRAND } from '../lib/site'

// AI Nova のアイコン（チップと歯車）です。画像は public/logo-mark.png で、
// ブラウザのタブのアイコン（index.html と lib/theme.ts の applyBrowserColor）も同じ画像を使います。
export function LogoMark({ size = 44 }: { size?: number }) {
  return <img className="logo-mark" src="/logo-mark.png" width={size} height={size} alt="" aria-hidden="true" />
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
