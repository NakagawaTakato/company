import { MdCheckCircle } from 'react-icons/md'
import { SubPageLayout } from '../components/SubPageLayout'
import { usePageTitle } from '../lib/usePageTitle'

export function ContactCompletePage() {
  usePageTitle('送信が完了しました')
  return (
    <SubPageLayout width="form">
      <div className="complete-card" role="status">
        <MdCheckCircle className="complete-card__icon" aria-hidden="true" />
        <h1 className="page-title">お問い合わせを受け付けました</h1>
        <p className="page-lead">ご相談・ご質問をお送りいただき、ありがとうございます。内容を確認して、ご連絡します。</p>
      </div>
    </SubPageLayout>
  )
}
