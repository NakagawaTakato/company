import { QRCodeSVG } from 'qrcode.react'
import { SubPageLayout } from '../components/SubPageLayout'
import { useSite } from '../lib/SiteContext'
import { usePageTitle } from '../lib/usePageTitle'

export function LinePage() {
  usePageTitle('LINEでご相談')
  const lineUrl = useSite().content.business.line_url
  return (
    <SubPageLayout width="line">
      <h1 className="page-title">
        <span className="text-line">LINE</span>でご相談いただけます
      </h1>
      <p className="page-lead">
        QRコードをスマホのLINEで読み取ると、友だち追加ができます。ホームページ制作のご相談や、ご質問をお気軽にお送りください。
      </p>

      <div className="line-card">
        <h2 className="line-card__title">
          <span className="text-line">LINE</span>で友だち追加
        </h2>
        <p className="line-card__text">スマホのLINEで、このQRコードを読み取ってください。</p>
        <div className="line-card__qr">
          <QRCodeSVG value={lineUrl} size={186} level="M" marginSize={0} title="LINE友だち追加用のQRコード" />
        </div>
        <p className="line-card__text">スマホでご覧の方は、下のボタンからも追加できます。</p>
        <a className="btn btn--line" href={lineUrl} target="_blank" rel="noopener noreferrer">
          LINEを開く
        </a>
      </div>
    </SubPageLayout>
  )
}
