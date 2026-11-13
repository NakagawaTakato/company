import { useEffect } from 'react'
import { useLocation } from 'react-router'

// リロード前のスクロール位置を、ページ（パス）ごとに覚えておく場所です
const storageKey = (pathname: string) => `scroll:${pathname}`

function readSaved(pathname: string): number | null {
  try {
    const value = sessionStorage.getItem(storageKey(pathname))
    return value === null ? null : Number(value)
  } catch {
    return null
  }
}

function isReload(): boolean {
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return entry?.type === 'reload'
}

// リロードで開いたページのパスです。別のページへ移動したら null にします。
// （開発中の StrictMode で effect が2回動いても、同じように位置を戻せるよう、ここで1回だけ調べます）
let reloadedPath: string | null = isReload() ? window.location.pathname : null

// URL から # を消します（リロードしたときに、その場所へ飛ばないようにするため）
function clearHash() {
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', pathname + search)
}

/**
 * ページ移動時は先頭へ、#付きのリンクで来たときはその位置へスクロールします。
 * リロードしたときは、リロード前に見ていた位置のまま表示します。
 */
export function ScrollManager() {
  const { pathname, hash } = useLocation()

  // スクロール位置はこの部品で決めるので、ブラウザの自動復元は止めます
  useEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  // ページを離れる（リロードを含む）直前に、今の位置を覚えておきます
  useEffect(() => {
    const save = () => {
      try {
        sessionStorage.setItem(storageKey(window.location.pathname), String(window.scrollY))
      } catch {
        // 保存できない環境では、リロード時に先頭から表示されるだけです
      }
    }
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [])

  useEffect(() => {
    if (reloadedPath !== pathname) reloadedPath = null
    if (reloadedPath) {
      const saved = readSaved(pathname)
      if (saved !== null) {
        if (hash) clearHash()
        const restore = () => window.scrollTo({ top: saved, behavior: 'instant' })
        restore()
        // 画像などの読み込みが終わったあとにブラウザが動かすことがあるので、念のためもう一度戻します
        if (document.readyState !== 'complete') window.addEventListener('load', restore, { once: true })
        return () => window.removeEventListener('load', restore)
      }
    }

    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (target) {
        target.scrollIntoView()
        clearHash()
        return
      }
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, hash])

  return null
}
