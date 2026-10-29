// 公開サイトの表示内容（テーマ色・事業者情報・料金など）を API から読み込み、各画面に配ります。
// 読み込めないときは初期値で表示します。
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { DEFAULT_CONTENT, DEFAULT_PRIMARY, type SiteData } from './site'
import { cacheColor, readCachedColor } from './theme'

type SiteContextValue = SiteData & { reload: () => void }

const SiteContext = createContext<SiteContextValue>({
  theme: { primary_color: DEFAULT_PRIMARY },
  content: DEFAULT_CONTENT,
  reload: () => undefined,
})

export function SiteProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData>(() => ({
    theme: { primary_color: readCachedColor() ?? DEFAULT_PRIMARY },
    content: DEFAULT_CONTENT,
  }))
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let active = true
    api
      .site()
      .then((result) => {
        if (!active) return
        setData({
          theme: result.theme,
          content: { ...DEFAULT_CONTENT, ...result.content },
        })
        cacheColor(result.theme.primary_color)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [version])

  const value = useMemo(() => ({ ...data, reload }), [data, reload])
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite(): SiteContextValue {
  return useContext(SiteContext)
}
