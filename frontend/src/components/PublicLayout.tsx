import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { useSite } from '../lib/SiteContext'
import { applyBrowserColor, themeVars } from '../lib/theme'

/** 公開サイトの画面だけに、管理画面で選んだテーマ色を反映します（管理画面は青のまま）。 */
export function PublicLayout() {
  const color = useSite().theme.primary_color
  useEffect(() => applyBrowserColor(color), [color])
  return (
    <div className="public-theme" style={themeVars(color)}>
      <Outlet />
    </div>
  )
}
