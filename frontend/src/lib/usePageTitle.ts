import { useEffect } from 'react'
import { HOME_TITLE } from '../content/home'
import { useSite } from './SiteContext'

/** ブラウザのタブ名を変えます。title を省くと、トップページ用のタイトル（HOME_TITLE）になります。 */
export function usePageTitle(title?: string) {
  const name = useSite().content.business.business_name
  useEffect(() => {
    document.title = title ? `${title} | ${name}` : HOME_TITLE
  }, [title, name])
}
