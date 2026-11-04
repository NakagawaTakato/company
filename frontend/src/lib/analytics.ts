// Google アナリティクス（GA4）でアクセス数を計測します。
// 測定ID（G- で始まる）は frontend/.env.fastapi の VITE_GA_ID に書きます。空なら何もしません。
// ページの移動は、GA4 の標準機能（拡張計測機能）が自動で計測します。

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

const GA_ID = import.meta.env.VITE_GA_ID ?? ''

/** 測定IDが設定されているか（「個人情報の取扱い」にアクセス解析の説明を出すかどうかにも使います） */
export const analyticsEnabled = GA_ID !== ''

/** 本番用にビルドした公開サイトでだけ計測を始めます。手元での確認と管理画面は計測しません。 */
export function initAnalytics() {
  if (!analyticsEnabled || !import.meta.env.PROD) return
  if (['localhost', '127.0.0.1'].includes(location.hostname) || location.pathname.startsWith('/admin')) return

  window.dataLayer = window.dataLayer || []
  // gtag.js は arguments をそのまま受け取る決まりなので、この書き方にしています
  window.gtag = function gtag() {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', GA_ID)

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.appendChild(script)
}
