import { useEffect } from 'react'
import { useSite } from './SiteContext'

export function usePageTitle(title?: string) {
  const name = useSite().content.business.business_name
  useEffect(() => {
    document.title = title ? `${title} | ${name}` : name
  }, [title, name])
}
