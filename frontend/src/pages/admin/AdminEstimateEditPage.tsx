import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { MdAdd, MdArrowBack, MdArrowDownward, MdArrowUpward, MdDelete, MdPayments, MdPrint } from 'react-icons/md'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { api, type EstimateDetail, type EstimateInput, type EstimateItem } from '../../api/client'
import { Card, Empty, Field, Notice, PageHeader, useAction, useLoader } from '../../components/admin/ui'
import { addDays, formatJpDate, todayJst, yen } from '../../lib/format'
import { ESTIMATE_STATUSES, PAYMENT_METHODS, labelOf } from '../../lib/options'
import { usePageTitle } from '../../lib/usePageTitle'

const EMPTY_ITEM: EstimateItem = { description: '', quantity: 1, unit: '式', unit_price: 0 }

function newEstimate(inquiryId: number | null, customer = ''): EstimateInput {
  const today = todayJst()
  return {
    customer_name: customer,
    title: 'ホームページ制作',
    issue_date: today,
    valid_until: addDays(today, 30),
    delivery: '',
    payment_terms: 'ご契約時に50%、納品時に50%',
    notes: '',
    tax_rate: 10,
    status: 'draft',
    inquiry_id: inquiryId,
    items: [{ ...EMPTY_ITEM }],
  }
}

/** 画面上の計算（保存時にはサーバーでも同じ計算をします） */
function calcTotals(items: EstimateItem[], taxRate: number) {
  const subtotal = items.reduce((sum, i) => sum + Math.round((Number(i.quantity) || 0) * (Number(i.unit_price) || 0)), 0)
  const tax = Math.floor((subtotal * (Number(taxRate) || 0)) / 100)
  return { subtotal, tax, total: subtotal + tax }
}

export function AdminEstimateEditPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  usePageTitle(isNew ? '見積書を作成' : '見積書')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inquiryParam = params.get('inquiry')
  const action = useAction()

  const { data: loaded, setData: setLoaded, error } = useLoader<EstimateDetail | null>(
    () => (isNew ? Promise.resolve(null) : api.getEstimate(id)),
    [id],
  )
  const { data: inquiry } = useLoader(
    () => (isNew && inquiryParam ? api.getInquiry(inquiryParam) : Promise.resolve(null)),
    [inquiryParam, isNew],
  )
  const [form, setForm] = useState<EstimateInput>(() => newEstimate(inquiryParam ? Number(inquiryParam) : null))

  useEffect(() => {
    if (loaded) {
      const { items, ...rest } = loaded
      setForm({
        customer_name: rest.customer_name,
        title: rest.title,
        issue_date: rest.issue_date,
        valid_until: rest.valid_until,
        delivery: rest.delivery,
        payment_terms: rest.payment_terms,
        notes: rest.notes,
        tax_rate: rest.tax_rate,
        status: rest.status,
        inquiry_id: rest.inquiry_id,
        items: items.map(({ description, quantity, unit, unit_price }) => ({ description, quantity, unit, unit_price })),
      })
    }
  }, [loaded])

  useEffect(() => {
    if (inquiry && !form.customer_name) setForm((f) => ({ ...f, customer_name: inquiry.name }))
  }, [inquiry, form.customer_name])

  const totals = useMemo(() => calcTotals(form.items, form.tax_rate), [form.items, form.tax_rate])
  const errors = action.fieldErrors

  const set = <K extends keyof EstimateInput>(key: K, value: EstimateInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setItem = (index: number, changes: Partial<EstimateItem>) =>
    set('items', form.items.map((item, i) => (i === index ? { ...item, ...changes } : item)))
  const moveItem = (index: number, delta: number) => {
    const items = [...form.items]
    const [moved] = items.splice(index, 1)
    items.splice(index + delta, 0, moved)
    set('items', items)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const payload = { ...form, tax_rate: Number(form.tax_rate) }
    if (isNew) {
      const created = await action.run(() => api.createEstimate(payload), '見積書を作成しました。印刷・PDF から保存できます。')
      if (created) navigate(`/admin/estimates/${created.id}`, { replace: true })
    } else {
      const updated = await action.run(() => api.updateEstimate(loaded!.id, payload), '保存しました。')
      if (updated) setLoaded(updated)
    }
  }

  const remove = async () => {
    if (!loaded || !window.confirm(`見積書 ${loaded.number} を削除します。よろしいですか？`)) return
    const done = await action.run(() => api.deleteEstimate(loaded.id))
    if (done) navigate('/admin/estimates', { replace: true })
  }

  if (!isNew && !loaded) return error ? <Notice kind="error">{error}</Notice> : <Empty>読み込み中…</Empty>

  return (
    <>
      <p className="admin-back">
        <Link to="/admin/estimates">
          <MdArrowBack aria-hidden="true" />
          見積書の一覧へ戻る
        </Link>
      </p>
      <PageHeader
        title={isNew ? '見積書を作成' : `見積書 ${loaded!.number}`}
        actions={
          !isNew && (
            <>
              <a href={`/admin/estimates/${loaded!.id}/print`} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--small">
                <MdPrint aria-hidden="true" />
                印刷・PDF
              </a>
              <Link to={`/admin/payments?new=1&estimate=${loaded!.id}`} className="btn btn--outline btn--small">
                <MdPayments aria-hidden="true" />
                入金を記録
              </Link>
              <button type="button" className="btn btn--danger btn--small" onClick={remove} disabled={action.busy}>
                <MdDelete aria-hidden="true" />
                削除
              </button>
            </>
          )
        }
      />
      {form.inquiry_id && (
        <p className="field__help">
          関連するお問い合わせ: <Link to={`/admin/inquiries/${form.inquiry_id}`}>#{form.inquiry_id}{inquiry ? ` ${inquiry.name} 様` : ''}</Link>
        </p>
      )}

      <form onSubmit={save} noValidate>
        <Card title="基本情報">
          <div className="form-grid">
            <Field label="お客さま名（様は不要）" htmlFor="customer_name" required error={errors.customer_name}>
              <input id="customer_name" className="input" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} maxLength={100} />
            </Field>
            <Field label="件名" htmlFor="title" required error={errors.title}>
              <input id="title" className="input" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} />
            </Field>
            <Field label="発行日" htmlFor="issue_date" required error={errors.issue_date}>
              <input id="issue_date" type="date" className="input" value={form.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
            </Field>
            <Field label="有効期限" htmlFor="valid_until" required error={errors.valid_until}>
              <input id="valid_until" type="date" className="input" value={form.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
            </Field>
            <Field label="納期" htmlFor="delivery" error={errors.delivery} hint="例: ご契約から1か月">
              <input id="delivery" className="input" value={form.delivery} onChange={(e) => set('delivery', e.target.value)} maxLength={200} />
            </Field>
            <Field label="お支払い条件" htmlFor="payment_terms" error={errors.payment_terms}>
              <input id="payment_terms" className="input" value={form.payment_terms} onChange={(e) => set('payment_terms', e.target.value)} maxLength={200} />
            </Field>
            <Field label="状態" htmlFor="status">
              <select id="status" className="input select" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {ESTIMATE_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="消費税率（%）" htmlFor="tax_rate" error={errors.tax_rate}>
              <input id="tax_rate" type="number" min={0} max={100} className="input" value={form.tax_rate} onChange={(e) => set('tax_rate', Number(e.target.value))} />
            </Field>
          </div>
        </Card>

        <Card title="明細">
          {errors.items && <p className="field__error">{errors.items}</p>}
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th scope="col">内容</th>
                  <th scope="col">数量</th>
                  <th scope="col">単位</th>
                  <th scope="col">単価（円・税抜）</th>
                  <th scope="col" className="num">金額</th>
                  <th scope="col">
                    <span className="visually-hidden">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, index) => {
                  const rowError = (key: string) => errors[`items.${index}.${key}`]
                  return (
                    <tr key={index}>
                      <td data-label="内容">
                        <input className={`input input--small${rowError('description') ? ' input--error' : ''}`} value={item.description} placeholder="例: トップページのデザイン" aria-label={`${index + 1}行目の内容`} onChange={(e) => setItem(index, { description: e.target.value })} maxLength={200} />
                        {rowError('description') && <p className="field__error">{rowError('description')}</p>}
                      </td>
                      <td data-label="数量">
                        <input className={`input input--small${rowError('quantity') ? ' input--error' : ''}`} type="number" min={0} step="0.5" value={item.quantity} aria-label={`${index + 1}行目の数量`} onChange={(e) => setItem(index, { quantity: e.target.value === '' ? 0 : Number(e.target.value) })} />
                        {rowError('quantity') && <p className="field__error">{rowError('quantity')}</p>}
                      </td>
                      <td data-label="単位">
                        <input className="input input--small" value={item.unit} aria-label={`${index + 1}行目の単位`} onChange={(e) => setItem(index, { unit: e.target.value })} maxLength={10} />
                      </td>
                      <td data-label="単価">
                        <input className={`input input--small${rowError('unit_price') ? ' input--error' : ''}`} type="number" min={0} step={1000} value={item.unit_price} aria-label={`${index + 1}行目の単価`} onChange={(e) => setItem(index, { unit_price: e.target.value === '' ? 0 : Number(e.target.value) })} />
                        {rowError('unit_price') && <p className="field__error">{rowError('unit_price')}</p>}
                      </td>
                      <td data-label="金額" className="num">{yen(Math.round((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)))}</td>
                      <td className="items-table__ops">
                        <button type="button" className="icon-button" aria-label="上へ" disabled={index === 0} onClick={() => moveItem(index, -1)}>
                          <MdArrowUpward />
                        </button>
                        <button type="button" className="icon-button" aria-label="下へ" disabled={index === form.items.length - 1} onClick={() => moveItem(index, 1)}>
                          <MdArrowDownward />
                        </button>
                        <button type="button" className="icon-button" aria-label="この行を削除" disabled={form.items.length === 1} onClick={() => set('items', form.items.filter((_, i) => i !== index))}>
                          <MdDelete />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => set('items', [...form.items, { ...EMPTY_ITEM }])} disabled={form.items.length >= 50}>
            <MdAdd aria-hidden="true" />
            行を追加
          </button>
          <dl className="totals">
            <div>
              <dt>小計（税抜）</dt>
              <dd>{yen(totals.subtotal)}</dd>
            </div>
            <div>
              <dt>消費税（{form.tax_rate}%）</dt>
              <dd>{yen(totals.tax)}</dd>
            </div>
            <div className="totals__grand">
              <dt>合計（税込）</dt>
              <dd>{yen(totals.total)}</dd>
            </div>
          </dl>
        </Card>

        <Card title="備考">
          <Field label="備考（見積書に印刷されます）" htmlFor="notes" error={errors.notes}>
            <textarea id="notes" className="input textarea" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} placeholder="例: ドメイン・サーバー代は別途実費となります。" />
          </Field>
        </Card>

        <Notice kind="success">{action.message}</Notice>
        <Notice kind="error">{action.error}</Notice>
        <div className="form-actions form-actions--sticky">
          <span className="field__help">合計 {yen(totals.total)}（税込）</span>
          <button type="submit" className="btn btn--primary" disabled={action.busy}>
            {action.busy ? '保存中…' : isNew ? '作成する' : '保存する'}
          </button>
        </div>
      </form>

      {!isNew && loaded && (
        <Card title="この見積書の入金">
          {loaded.payments.length === 0 ? (
            <Empty>まだ入金はありません。</Empty>
          ) : (
            <table className="admin-table admin-table--compact">
              <thead>
                <tr>
                  <th scope="col">入金日</th>
                  <th scope="col">内容</th>
                  <th scope="col">方法</th>
                  <th scope="col" className="num">金額</th>
                  <th scope="col">領収書</th>
                </tr>
              </thead>
              <tbody>
                {loaded.payments.map((p) => (
                  <tr key={p.id}>
                    <td data-label="入金日">{formatJpDate(p.paid_on)}</td>
                    <td data-label="内容">{p.description}</td>
                    <td data-label="方法">{labelOf(PAYMENT_METHODS, p.method)}</td>
                    <td data-label="金額" className="num">{yen(p.amount)}</td>
                    <td data-label="領収書">
                      <a href={`/admin/payments/${p.id}/receipt`} target="_blank" rel="noopener noreferrer">
                        {p.receipt_number}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <dl className="totals">
            <div>
              <dt>入金済み</dt>
              <dd>{yen(loaded.paid)}</dd>
            </div>
            <div className="totals__grand">
              <dt>残額</dt>
              <dd>{yen(loaded.balance)}</dd>
            </div>
          </dl>
        </Card>
      )}
    </>
  )
}
