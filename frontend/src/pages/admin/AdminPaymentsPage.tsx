import { useEffect, useState, type FormEvent } from 'react'
import { MdAdd, MdDelete, MdDownload, MdEdit, MdReceipt, MdSearch } from 'react-icons/md'
import { Link, useSearchParams } from 'react-router'
import { api, type Payment, type PaymentInput } from '../../api/client'
import { Card, Empty, Field, Notice, PageHeader, Pagination, useAction, useLoader } from '../../components/admin/ui'
import { formatJpDate, todayJst, yen } from '../../lib/format'
import { PAYMENT_METHODS, labelOf } from '../../lib/options'
import { usePageTitle } from '../../lib/usePageTitle'

const blank = (): PaymentInput => ({
  receipt_number: '',
  customer_name: '',
  description: 'ホームページ制作費として',
  amount: 0,
  method: 'card',
  paid_on: todayJst(),
  note: '',
  estimate_id: null,
})

export function AdminPaymentsPage() {
  usePageTitle('入金・領収書')
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1) || 1
  const { data, error, reload } = useLoader(() => api.payments({ q, page }), [q, page])
  const { data: estimates } = useLoader(() => api.estimates({ per_page: 100 }), [])
  const action = useAction()
  const csv = useAction()
  const [keyword, setKeyword] = useState(q)
  const [editing, setEditing] = useState<Payment | 'new' | null>(params.get('new') ? 'new' : null)
  const [form, setForm] = useState<PaymentInput>(blank)

  // 見積書の画面から来たとき: その見積書の内容を入れておきます
  const estimateParam = params.get('estimate')
  useEffect(() => {
    if (!estimateParam || !estimates) return
    const estimate = estimates.items.find((e) => String(e.id) === estimateParam)
    if (estimate) {
      setForm((f) => ({
        ...f,
        estimate_id: estimate.id,
        customer_name: estimate.customer_name,
        description: `${estimate.title}費 ${estimate.paid > 0 ? '残金' : '着手金'}として`,
        amount: estimate.paid > 0 ? estimate.balance : Math.floor(estimate.total / 2),
      }))
    }
  }, [estimateParam, estimates])

  // 新しく記録するとき: 次に自動で付く領収書番号を入れておきます（書き換えられます）
  useEffect(() => {
    if (editing !== 'new') return
    api
      .nextNumbers()
      .then((n) => setForm((f) => (f.receipt_number ? f : { ...f, receipt_number: n.receipt })))
      .catch(() => undefined)
  }, [editing])

  const startNew = () => {
    setForm(blank())
    setEditing('new')
  }

  const startEdit = (p: Payment) => {
    const { receipt_number, customer_name, description, amount, method, paid_on, note, estimate_id } = p
    setForm({ receipt_number, customer_name, description, amount, method, paid_on, note, estimate_id })
    setEditing(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const close = () => {
    setEditing(null)
    const next = new URLSearchParams(params)
    next.delete('new')
    next.delete('estimate')
    setParams(next)
  }

  const set = <K extends keyof PaymentInput>(key: K, value: PaymentInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const saved = await action.run(
      () => (editing && editing !== 'new' ? api.updatePayment(editing.id, form) : api.createPayment(form)),
      editing === 'new' ? '入金を記録しました。領収書を印刷できます。' : '保存しました。',
    )
    if (saved) {
      close()
      reload()
    }
  }

  const remove = async (p: Payment) => {
    if (!window.confirm(`${p.receipt_number}（${p.customer_name} 様 ${yen(p.amount)}）の記録を削除します。よろしいですか？`)) return
    if (await action.run(() => api.deletePayment(p.id), '削除しました。')) reload()
  }

  const search = (event: FormEvent) => {
    event.preventDefault()
    const next = new URLSearchParams(params)
    if (keyword.trim()) next.set('q', keyword.trim())
    else next.delete('q')
    next.delete('page')
    setParams(next)
  }

  const errors = action.fieldErrors

  return (
    <>
      <PageHeader
        title="入金・領収書"
        lead="入金を記録すると領収書番号が付き（自分で入力もできます）、領収書を印刷・PDFで保存できます。"
        actions={
          !editing && (
            <>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => csv.run(() => api.downloadPaymentsCsv({ q }))}
                disabled={csv.busy}
              >
                <MdDownload aria-hidden="true" />
                {csv.busy ? '作成中…' : 'CSVダウンロード'}
              </button>
              <button type="button" className="btn btn--primary btn--small" onClick={startNew}>
                <MdAdd aria-hidden="true" />
                入金を記録
              </button>
            </>
          )
        }
      />
      <Notice kind="success">{action.message}</Notice>
      {!editing && <Notice kind="error">{action.error || csv.error}</Notice>}

      {editing && (
        <Card title={editing === 'new' ? '入金を記録' : `入金の記録を編集（${editing.receipt_number}）`}>
          <form onSubmit={save} noValidate>
            <div className="form-grid">
              <Field label="No.（領収書番号）" htmlFor="receipt_number" error={errors.receipt_number} hint="半角の英数字とハイフン（-）で30文字まで。空のまま保存すると自動で付きます。">
                <input id="receipt_number" className="input" value={form.receipt_number} onChange={(e) => set('receipt_number', e.target.value)} maxLength={30} autoComplete="off" />
              </Field>
              <Field label="見積書（任意）" htmlFor="estimate_id" error={errors.estimate_id}>
                <select
                  id="estimate_id"
                  className="input select"
                  value={form.estimate_id ?? ''}
                  onChange={(e) => {
                    const estimate = estimates?.items.find((x) => String(x.id) === e.target.value)
                    setForm((f) => ({ ...f, estimate_id: estimate ? estimate.id : null, customer_name: estimate ? estimate.customer_name : f.customer_name }))
                  }}
                >
                  <option value="">見積書と結びつけない</option>
                  {estimates?.items.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.number} {e.customer_name} 様 {yen(e.total)}（残額 {yen(e.balance)}）
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="お客さま名（様は不要）" htmlFor="customer_name" required error={errors.customer_name}>
                <input id="customer_name" className="input" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} maxLength={100} />
              </Field>
              <Field label="金額（円・税込）" htmlFor="amount" required error={errors.amount}>
                <input id="amount" type="number" min={1} className="input" value={form.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} />
              </Field>
              <Field label="入金日" htmlFor="paid_on" required error={errors.paid_on}>
                <input id="paid_on" type="date" className="input" value={form.paid_on} onChange={(e) => set('paid_on', e.target.value)} />
              </Field>
              <Field label="お支払い方法" htmlFor="method" required error={errors.method}>
                <select id="method" className="input select" value={form.method} onChange={(e) => set('method', e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="但し書き（領収書に印刷されます）" htmlFor="description" required error={errors.description}>
                <input id="description" className="input" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={200} />
              </Field>
            </div>
            <Field label="メモ（領収書には印刷されません）" htmlFor="note" error={errors.note}>
              <textarea id="note" className="input textarea" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />
            </Field>
            {form.method === 'cash' && form.amount >= 50000 && (
              <Notice kind="warning">5万円以上の現金の領収書には、収入印紙が必要です。</Notice>
            )}
            <Notice kind="error">{action.error}</Notice>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={close}>
                キャンセル
              </button>
              <button type="submit" className="btn btn--primary btn--small" disabled={action.busy}>
                {action.busy ? '保存中…' : editing === 'new' ? '記録する' : '保存する'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <form className="filter-bar" onSubmit={search} role="search">
        <input className="input input--small filter-bar__keyword" type="search" placeholder="お客さま名・但し書き・領収書番号" aria-label="検索" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        <button type="submit" className="btn btn--primary btn--small">
          <MdSearch aria-hidden="true" />
          検索
        </button>
      </form>
      <Notice kind="error">{error}</Notice>

      <div className="admin-card">
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : data.items.length === 0 ? (
          <Empty>入金の記録はまだありません。</Empty>
        ) : (
          <table className="admin-table admin-table--static">
            <thead>
              <tr>
                <th scope="col">入金日</th>
                <th scope="col">領収書番号</th>
                <th scope="col">お客さま</th>
                <th scope="col">但し書き</th>
                <th scope="col">方法</th>
                <th scope="col" className="num">金額</th>
                <th scope="col">
                  <span className="visually-hidden">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td data-label="入金日">{formatJpDate(p.paid_on)}</td>
                  <td data-label="領収書番号">{p.receipt_number}</td>
                  <td data-label="お客さま">
                    {p.customer_name} 様
                    {p.estimate && (
                      <>
                        <br />
                        <Link to={`/admin/estimates/${p.estimate.id}`} className="admin-link admin-link--small">
                          {p.estimate.number}
                        </Link>
                      </>
                    )}
                  </td>
                  <td data-label="但し書き">{p.description}</td>
                  <td data-label="方法">{labelOf(PAYMENT_METHODS, p.method)}</td>
                  <td data-label="金額" className="num">{yen(p.amount)}</td>
                  <td className="row-actions">
                    <a href={`/admin/payments/${p.id}/receipt`} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--small">
                      <MdReceipt aria-hidden="true" />
                      領収書
                    </a>
                    <button type="button" className="icon-button" aria-label="編集" onClick={() => startEdit(p)}>
                      <MdEdit />
                    </button>
                    <button type="button" className="icon-button" aria-label="削除" onClick={() => remove(p)}>
                      <MdDelete />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && (
        <div className="list-footer">
          <span>
            全 {data.total} 件・合計 {yen(data.total_amount)}
          </span>
          <Pagination
            page={data.page}
            pages={data.pages}
            onChange={(p) => {
              const next = new URLSearchParams(params)
              next.set('page', String(p))
              setParams(next)
            }}
          />
        </div>
      )}
    </>
  )
}
