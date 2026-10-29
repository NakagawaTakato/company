import { SubPageLayout } from '../components/SubPageLayout'
import { usePageTitle } from '../lib/usePageTitle'

export function NotFoundPage() {
  usePageTitle('ページが見つかりません')
  return (
    <SubPageLayout width="form">
      <h1 className="page-title">ページが見つかりません</h1>
      <p className="page-lead">お探しのページは、移動または削除された可能性があります。</p>
    </SubPageLayout>
  )
}
