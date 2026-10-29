import { useSite } from '../lib/SiteContext'

/** お問い合わせフォーム内に表示する「個人情報の取扱い」です。 */
export function PrivacyPolicy() {
  const business = useSite().content.business
  return (
    <div className="policy">
      <h3>個人情報の取扱い</h3>
      <p>
        {business.business_name}(以下「当方」)は、お問い合わせフォームでお預かりする個人情報を、次のとおり取り扱います。
      </p>

      <h4>1. 取得する情報</h4>
      <ul>
        <li>お名前、メールアドレス、電話番号</li>
        <li>お住まい(地域)</li>
        <li>ご年齢(任意)</li>
        <li>ご相談内容(Python(React/FastAPI)の選択など)</li>
        <li>お支払い方法の選択。カード番号などは取得しません</li>
      </ul>

      <h4>2. 利用目的</h4>
      <ul>
        <li>ご相談・ご質問へのご返信</li>
        <li>お見積り、ご契約、制作・保守に関するご連絡</li>
      </ul>

      <h4>3. 第三者への提供</h4>
      <p>法令にもとづく場合を除き、ご本人の同意なく第三者へ提供しません。</p>

      <h4>4. 管理と削除</h4>
      <p>お預かりした情報は、漏えいや紛失がないよう適切に管理し、不要になった情報は削除します。</p>

      <h4>5. 開示・訂正・削除のご依頼</h4>
      <p>ご本人からのご依頼があれば、ご本人であることを確認のうえ、開示・訂正・削除に対応します。</p>

      <h4>6. お問い合わせ窓口</h4>
      <p>
        {business.business_name}　{business.owner}
        <br />
        メール: {business.email}
        <br />
        対応時間: {business.hours}
      </p>
    </div>
  )
}
