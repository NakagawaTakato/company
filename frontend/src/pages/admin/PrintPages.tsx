// 見積書・領収書の印刷用ページ（ブラウザの印刷で「PDF に保存」を選ぶと PDF になります）。
import { useEffect, useState, type ReactNode } from 'react'
import { MdPrint } from 'react-icons/md'
import { useNavigate, useParams } from 'react-router'
import { ApiError, api, type EstimateDetail, type Payment } from '../../api/client'
import { formatJpDate, todayJst, yen } from '../../lib/format'
import { PAYMENT_METHODS, labelOf } from '../../lib/options'
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

function PrintShell({ title, error, note, children }: { title: string; error: string; note?: ReactNode; children?: ReactNode }) {
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
      {children && <article className="paper">{children}</article>}
    </div>
  )
}

function Issuer() {
  const b = useSite().content.business
  return (
    <div className="paper__issuer">
      <p className="paper__issuer-name">{b.business_name}</p>
      <p>{b.owner}</p>
      <p>{b.address}</p>
      <p>TEL {b.phone}</p>
      <p>{b.email}</p>
    </div>
  )
}

export function EstimatePrintPage() {
  const { id = '' } = useParams()
  const { data: e, error } = usePrintData<EstimateDetail>(() => api.getEstimate(id), id)
  usePageTitle(e ? `御見積書 ${e.number}` : '御見積書')

  return (
    <PrintShell title={e ? `見積書 ${e.number}` : '見積書'} error={error}>
      {e && (
        <>
          <header className="paper__head">
            <h1 className="paper__title">御見積書</h1>
            <dl className="paper__meta">
              <div>
                <dt>見積番号</dt>
                <dd>{e.number}</dd>
              </div>
              <div>
                <dt>発行日</dt>
                <dd>{formatJpDate(e.issue_date)}</dd>
              </div>
            </dl>
          </header>
          <div className="paper__parties">
            <div>
              <p className="paper__to">{e.customer_name} 様</p>
              <p>下記のとおりお見積り申し上げます。</p>
              <dl className="paper__terms">
                <div>
                  <dt>件名</dt>
                  <dd>{e.title}</dd>
                </div>
                <div>
                  <dt>有効期限</dt>
                  <dd>{formatJpDate(e.valid_until)}</dd>
                </div>
                {e.delivery && (
                  <div>
                    <dt>納期</dt>
                    <dd>{e.delivery}</dd>
                  </div>
                )}
                {e.payment_terms && (
                  <div>
                    <dt>お支払い条件</dt>
                    <dd>{e.payment_terms}</dd>
                  </div>
                )}
              </dl>
            </div>
            <Issuer />
          </div>
          <p className="paper__amount">
            <span>御見積金額</span>
            <strong>{yen(e.total)}</strong>
            <span>（税込）</span>
          </p>
          <table className="paper__table">
            <thead>
              <tr>
                <th scope="col">内容</th>
                <th scope="col" className="num">数量</th>
                <th scope="col">単位</th>
                <th scope="col" className="num">単価</th>
                <th scope="col" className="num">金額</th>
              </tr>
            </thead>
            <tbody>
              {e.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.description}</td>
                  <td className="num">{item.quantity}</td>
                  <td>{item.unit}</td>
                  <td className="num">{yen(item.unit_price)}</td>
                  <td className="num">{yen(item.amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={4}>小計</th>
                <td className="num">{yen(e.subtotal)}</td>
              </tr>
              <tr>
                <th scope="row" colSpan={4}>消費税（{e.tax_rate}%）</th>
                <td className="num">{yen(e.tax)}</td>
              </tr>
              <tr className="paper__total">
                <th scope="row" colSpan={4}>合計（税込）</th>
                <td className="num">{yen(e.total)}</td>
              </tr>
            </tfoot>
          </table>
          {e.notes && (
            <section className="paper__notes">
              <h2>備考</h2>
              <p>{e.notes}</p>
            </section>
          )}
        </>
      )}
    </PrintShell>
  )
}

export function ReceiptPrintPage() {
  const { id = '' } = useParams()
  const { data: p, error } = usePrintData<Payment>(() => api.getPayment(id), id)
  usePageTitle(p ? `領収書 ${p.receipt_number}` : '領収書')
  const needsStamp = p && p.method === 'cash' && p.amount >= 50000

  return (
    <PrintShell
      title={p ? `領収書 ${p.receipt_number}` : '領収書'}
      error={error}
      note={needsStamp ? '※ 5万円以上の現金の領収書には、収入印紙が必要です。印刷して印紙を貼り、割印をしてお渡しください。（この注意書きは印刷されません）' : undefined}
    >
      {p && (
        <>
          <header className="paper__head">
            <h1 className="paper__title">領収書</h1>
            <dl className="paper__meta">
              <div>
                <dt>No.</dt>
                <dd>{p.receipt_number}</dd>
              </div>
              <div>
                <dt>発行日</dt>
                <dd>{formatJpDate(todayJst())}</dd>
              </div>
            </dl>
          </header>
          <p className="paper__to paper__to--receipt">{p.customer_name} 様</p>
          <p className="paper__amount paper__amount--receipt">
            <strong>{yen(p.amount)}</strong>
            <span>（税込）</span>
          </p>
          <dl className="paper__terms paper__terms--receipt">
            <div>
              <dt>但し</dt>
              <dd>{p.description}</dd>
            </div>
            <div>
              <dt>お支払い日</dt>
              <dd>{formatJpDate(p.paid_on)}</dd>
            </div>
            <div>
              <dt>お支払い方法</dt>
              <dd>{labelOf(PAYMENT_METHODS, p.method)}</dd>
            </div>
            {p.estimate && (
              <div>
                <dt>見積番号</dt>
                <dd>{p.estimate.number}</dd>
              </div>
            )}
          </dl>
          <p className="paper__received">上記の金額を、正に領収いたしました。</p>
          <div className="paper__parties paper__parties--end">
            <div />
            <Issuer />
          </div>
        </>
      )}
    </PrintShell>
  )
}
