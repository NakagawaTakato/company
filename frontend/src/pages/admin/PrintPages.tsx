// 見積書・領収書の印刷用ページ（ブラウザの印刷で「PDF に保存」を選ぶと PDF になります）。
import { useEffect, useState, type ReactNode } from 'react'
import { MdPrint } from 'react-icons/md'
import { useNavigate, useParams } from 'react-router'
import { ApiError, api, type EstimateDetail, type Payment } from '../../api/client'
import { formatJpDate, todayJst } from '../../lib/format'
import { useSite } from '../../lib/SiteContext'
import { usePageTitle } from '../../lib/usePageTitle'

function usePrintData<T>(load: () => Promise<T>, key: string) {
  const navigate = useNavigate()
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  useEffect(() => {
    load()
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) navigate('/admin/login', { replace: true, state: { expired: true } })
        else setError(err instanceof Error ? err.message : '読み込みに失敗しました。')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { data, error }
}

function PrintShell({
  title,
  error,
  note,
  paperClass = '',
  children,
}: {
  title: string
  error: string
  note?: ReactNode
  paperClass?: string
  children?: ReactNode
}) {
  return (
    <div className="print-page">
      <div className="print-toolbar no-print">
        <span>{title}</span>
        <span className="print-toolbar__hint">印刷画面で「PDF に保存」を選ぶと PDF になります。</span>
        <button type="button" className="btn btn--primary btn--small" onClick={() => window.print()} disabled={!children}>
          <MdPrint aria-hidden="true" />
          印刷・PDFで保存
        </button>
      </div>
      {note && <p className="print-note no-print">{note}</p>}
      {error && <p className="form-alert no-print">{error}</p>}
      {children && <article className={`paper ${paperClass}`.trim()}>{children}</article>}
    </div>
  )
}

/** 見積書の明細は Excel の「見積書_スタンダード」と同じく 12 行（足りない分は空行）。13 行以上はそのまま続けます。 */
const ESTIMATE_ROWS = 12

const num = (value: number) => value.toLocaleString('ja-JP')

export function EstimatePrintPage() {
  const { id = '' } = useParams()
  const { data: e, error } = usePrintData<EstimateDetail>(() => api.getEstimate(id), id)
  const b = useSite().content.business
  usePageTitle(e ? `御見積書 ${e.number}` : '御見積書')

  const rows = e ? [...e.items, ...Array<null>(Math.max(0, ESTIMATE_ROWS - e.items.length)).fill(null)] : []
  const terms: [string, string][] = e
    ? [
        ['件　名', e.title],
        ['納　期', e.delivery],
        ['支払条件', e.payment_terms],
        ['有効期限', formatJpDate(e.valid_until)],
      ]
    : []

  return (
    <PrintShell title={e ? `見積書 ${e.number}` : '見積書'} error={error} paperClass="paper--quote">
      {e && (
        <div className="qt">
          <h1 className="qt__title">御　見　積　書</h1>
          <p className="qt__to">
            <span className="qt__to-name">{e.customer_name}</span>
            <span className="qt__to-honorific">{e.honorific || '様'}</span>
          </p>
          <dl className="qt__meta">
            <div>
              <dt>見積番号</dt>
              <dd>No. {e.number}</dd>
            </div>
            <div>
              <dt>発行日</dt>
              <dd>{formatJpDate(e.issue_date)}</dd>
            </div>
          </dl>
          <p className="qt__lead">下記の通り御見積申し上げます。</p>
          <dl className="qt__terms">
            {terms.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="qt__issuer">
            <p className="qt__issuer-name">{b.business_name}</p>
            <p>{b.address}</p>
            <p>TEL {b.phone}</p>
            {b.invoice_number && <p>登録番号 {b.invoice_number}</p>}
            <p>担当：{b.owner}</p>
          </div>
          <p className="qt__amount">
            <span>御見積金額（税込）</span>
            <strong>¥{num(e.total)}-</strong>
          </p>
          <table className="qt__table">
            <colgroup>
              <col className="qt__col-no" />
              <col className="qt__col-name" />
              <col className="qt__col-qty" />
              <col className="qt__col-unit" />
              <col className="qt__col-price" />
              <col className="qt__col-amount" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">No.</th>
                <th scope="col">品名・摘要</th>
                <th scope="col">数量</th>
                <th scope="col">単位</th>
                <th scope="col">単価</th>
                <th scope="col">金額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={index}>
                  <td className="qt__c">{index + 1}</td>
                  <td>{item?.description}</td>
                  <td className="qt__r">{item && num(item.quantity)}</td>
                  <td className="qt__c">{item?.unit}</td>
                  <td className="qt__r">{item && num(item.unit_price)}</td>
                  <td className="qt__r">{item && num(item.amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="qt__gap qt__gap--top" />
                <th scope="row" colSpan={2}>小　計</th>
                <td className="qt__r">{num(e.subtotal)}</td>
              </tr>
              <tr>
                <td className="qt__gap" />
                <td className="qt__gap qt__rate-label">消費税率</td>
                <td className="qt__c">{e.tax_rate}%</td>
                <th scope="row" colSpan={2}>消費税</th>
                <td className="qt__r">{num(e.tax)}</td>
              </tr>
              <tr className="qt__total">
                <td colSpan={3} className="qt__gap" />
                <th scope="row" colSpan={2}>合計（税込）</th>
                <td className="qt__r">{num(e.total)}</td>
              </tr>
            </tfoot>
          </table>
          <section className="qt__notes">
            <h2>備考</h2>
            <p>{e.notes}</p>
          </section>
        </div>
      )}
    </PrintShell>
  )
}

export function ReceiptPrintPage() {
  const { id = '' } = useParams()
  const { data: p, error } = usePrintData<Payment>(() => api.getPayment(id), id)
  const b = useSite().content.business
  usePageTitle(p ? `領収書 ${p.receipt_number}` : '領収書')
  const needsStamp = p && p.method === 'cash' && p.amount >= 50000
  // 内訳: 税込の金額から消費税を逆算（1円未満は切り捨て）。税率は見積書から、見積書がなければ 10%
  const rate = p?.estimate?.tax_rate ?? 10
  const tax = p ? Math.floor((p.amount * rate) / (100 + rate)) : 0
  const description = p?.description.replace(/として$/, '') ?? ''

  return (
    <PrintShell
      title={p ? `領収書 ${p.receipt_number}` : '領収書'}
      error={error}
      paperClass="paper--receipt"
      note={needsStamp ? '※ 5万円以上の現金の領収書には、収入印紙が必要です。印刷して印紙を貼り、割印をしてお渡しください。（この注意書きは印刷されません）' : undefined}
    >
      {p && (
        <div className="rc">
          <h1 className="rc__title">領収書</h1>
          <div className="rc__meta">
            <p>
              <span className="rc__accent">No.</span> {p.receipt_number}
            </p>
            <p>{formatJpDate(todayJst())}</p>
          </div>
          <p className="rc__to">
            <span className="rc__to-name">{p.customer_name}</span>
            <span className="rc__accent">様</span>
          </p>
          <p className="rc__amount">
            <span className="rc__amount-label">金額</span>
            <strong>¥{num(p.amount)}-</strong>
          </p>
          <div>
            <p className="rc__tadashi">
              <span className="rc__accent">但し</span>
              <span className="rc__what">{description}</span>
              <span className="rc__accent">として</span>
            </p>
            <p className="rc__received">上記正に領収いたしました</p>
          </div>
          <div className="rc__bottom">
            <div className="rc__stamp">
              <p>
                収入
                <br />
                印紙
                <br />
                <small>（5万円以上）</small>
              </p>
            </div>
            <table className="rc__breakdown">
              <caption>内訳</caption>
              <tbody>
                <tr>
                  <th scope="row">税抜金額</th>
                  <td>¥{num(p.amount - tax)}</td>
                </tr>
                <tr>
                  <th scope="row">消費税額({rate}%)</th>
                  <td>¥{num(tax)}</td>
                </tr>
              </tbody>
            </table>
            <div className="rc__issuer">
              <p className="rc__issuer-name">{b.business_name}</p>
              <p>{b.address}</p>
              <p>TEL {b.phone}</p>
              {b.invoice_number && <p className="rc__reg">登録番号 {b.invoice_number}</p>}
            </div>
          </div>
        </div>
      )}
    </PrintShell>
  )
}
