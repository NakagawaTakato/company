import { useEffect, useState, type FormEvent } from 'react'
import { MdAdd, MdDelete, MdEdit, MdEventBusy } from 'react-icons/md'
import { Link, useSearchParams } from 'react-router'
import { api, type Contract, type ContractInput } from '../../api/client'
import { Card, Empty, Field, Notice, PageHeader, Pill, useAction, useLoader } from '../../components/admin/ui'
import { formatJpDate, todayJst, yen } from '../../lib/format'
import { CONTRACT_STATUSES, labelOf } from '../../lib/options'
import { usePageTitle } from '../../lib/usePageTitle'

const blank = (inquiryId: number | null = null, name = '', email = ''): ContractInput => ({
  customer_name: name,
  email,
  site_name: '',
  site_url: '',
  monthly_fee: 5000,
  start_date: todayJst(),
  cancel_requested_on: null,
  end_date: null,
  note: '',
  inquiry_id: inquiryId,
})

export function AdminContractsPage() {
  usePageTitle('おまかせ管理プラン')
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState('')
  const { data, error, reload } = useLoader(() => api.contracts({ status }), [status])
  const action = useAction()
  const [editing, setEditing] = useState<Contract | 'new' | null>(null)
  const [form, setForm] = useState<ContractInput>(blank)

  // お問い合わせの詳細から来たとき（?new=1&inquiry=ID）・編集リンクから来たとき（?edit=ID）
  const inquiryParam = params.get('inquiry')
  const editParam = params.get('edit')
  const { data: inquiry } = useLoader(() => (inquiryParam ? api.getInquiry(inquiryParam) : Promise.resolve(null)), [inquiryParam])
  useEffect(() => {
    if (params.get('new') && inquiry !== undefined) {
      setForm(blank(inquiry?.id ?? null, inquiry?.name ?? '', inquiry?.email ?? ''))
      setEditing('new')
    }
  }, [params, inquiry])
  useEffect(() => {
    if (!editParam || !data) return
    const target = data.items.find((c) => String(c.id) === editParam)
    if (target) startEdit(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, data])

  const startEdit = (c: Contract) => {
    const { customer_name, email, site_name, site_url, monthly_fee, start_date, cancel_requested_on, end_date, note, inquiry_id } = c
    setForm({ customer_name, email, site_name, site_url, monthly_fee, start_date, cancel_requested_on, end_date, note, inquiry_id })
    setEditing(c)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const close = () => {
    setEditing(null)
    setParams(new URLSearchParams())
  }

  const set = <K extends keyof ContractInput>(key: K, value: ContractInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const payload = { ...form, cancel_requested_on: form.cancel_requested_on || null, end_date: form.end_date || null }
    const saved = await action.run(
      () => (editing && editing !== 'new' ? api.updateContract(editing.id, payload) : api.createContract(payload)),
      editing === 'new' ? 'おまかせ管理プランを登録しました。' : '保存しました。',
    )
    if (saved) {
      close()
      reload()
    }
  }

  const requestCancel = async (c: Contract) => {
    const day = window.prompt(
      `${c.customer_name} 様「${c.site_name}」の解約の申し出日を入力してください（例: ${todayJst()}）。\n終了日は申し出日の翌月末になります。`,
      todayJst(),
    )
    if (!day) return
    if (await action.run(() => api.cancelContract(c.id, day.trim()), '解約の申し出を登録しました。')) reload()
  }

  const remove = async (c: Contract) => {
    if (!window.confirm(`${c.customer_name} 様「${c.site_name}」のおまかせ管理プランを削除します。よろしいですか？`)) return
    if (await action.run(() => api.deleteContract(c.id), '削除しました。')) reload()
  }

  const errors = action.fieldErrors
  const counts = data?.counts ?? {}

  return (
    <>
      <PageHeader
        title="おまかせ管理プラン"
        lead="おまかせ管理プラン（月額）の契約を管理します。解約のお申し出は前月末までなので、申し出日の翌月末で終了します。"
        actions={
          !editing && (
            <button type="button" className="btn btn--primary btn--small" onClick={() => { setForm(blank()); setEditing('new') }}>
              <MdAdd aria-hidden="true" />
              おまかせ管理プランを登録
            </button>
          )
        }
      />
      <Notice kind="success">{action.message}</Notice>
      {!editing && <Notice kind="error">{action.error || error}</Notice>}

      {data && (
        <div className="tiles tiles--compact">
          <div className="tile">
            <span className="tile__label">契約中</span>
            <span className="tile__value">{counts.active ?? 0} 件</span>
          </div>
          <div className="tile">
            <span className="tile__label">解約予定</span>
            <span className="tile__value">{counts.cancel_requested ?? 0} 件</span>
          </div>
          <div className="tile">
            <span className="tile__label">月額の合計（開始済み・終了前）</span>
            <span className="tile__value">{yen(data.monthly_revenue)}</span>
          </div>
        </div>
      )}

      {editing && (
        <Card title={editing === 'new' ? 'おまかせ管理プランを登録' : `おまかせ管理プランを編集（${editing.site_name}）`}>
          <form onSubmit={save} noValidate>
            {form.inquiry_id && (
              <p className="field__help">
                関連するお問い合わせ: <Link to={`/admin/inquiries/${form.inquiry_id}`}>#{form.inquiry_id}</Link>
              </p>
            )}
            <div className="form-grid">
              <Field label="お客さま名（様は不要）" htmlFor="customer_name" required error={errors.customer_name}>
                <input id="customer_name" className="input" value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} maxLength={100} />
              </Field>
              <Field label="メールアドレス" htmlFor="email" error={errors.email}>
                <input id="email" type="email" className="input" value={form.email} onChange={(e) => set('email', e.target.value)} maxLength={254} />
              </Field>
              <Field label="サイト名" htmlFor="site_name" required error={errors.site_name}>
                <input id="site_name" className="input" value={form.site_name} onChange={(e) => set('site_name', e.target.value)} maxLength={100} />
              </Field>
              <Field label="サイトの URL" htmlFor="site_url" error={errors.site_url}>
                <input id="site_url" className="input" placeholder="https://" value={form.site_url} onChange={(e) => set('site_url', e.target.value)} maxLength={300} />
              </Field>
              <Field label="月額（円・税込）" htmlFor="monthly_fee" required error={errors.monthly_fee}>
                <input id="monthly_fee" type="number" min={0} step={500} className="input" value={form.monthly_fee} onChange={(e) => set('monthly_fee', Number(e.target.value))} />
              </Field>
              <Field label="開始日" htmlFor="start_date" required error={errors.start_date}>
                <input id="start_date" type="date" className="input" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
              </Field>
              <Field label="解約の申し出日" htmlFor="cancel_requested_on" error={errors.cancel_requested_on} hint="解約の申し出があったときに入力します。">
                <input id="cancel_requested_on" type="date" className="input" value={form.cancel_requested_on ?? ''} onChange={(e) => set('cancel_requested_on', e.target.value || null)} />
              </Field>
              <Field label="終了日" htmlFor="end_date" error={errors.end_date} hint="通常は申し出日の翌月末です。">
                <input id="end_date" type="date" className="input" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} />
              </Field>
            </div>
            <Field label="メモ" htmlFor="note" error={errors.note}>
              <textarea id="note" className="input textarea" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} maxLength={1000} />
            </Field>
            {errors.body && <p className="field__error">{errors.body}</p>}
            <Notice kind="error">{action.error}</Notice>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={close}>
                キャンセル
              </button>
              <button type="submit" className="btn btn--primary btn--small" disabled={action.busy}>
                {action.busy ? '保存中…' : editing === 'new' ? '登録する' : '保存する'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="tabs admin-tabs" role="tablist" aria-label="状態で絞り込み">
        {[{ value: '', label: 'すべて' }, ...CONTRACT_STATUSES].map((tab) => (
          <button key={tab.value || 'all'} type="button" role="tab" aria-selected={status === tab.value} className={`tab${status === tab.value ? ' tab--active' : ''}`} onClick={() => setStatus(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="admin-card">
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : data.items.length === 0 ? (
          <Empty>おまかせ管理プランはまだありません。</Empty>
        ) : (
          <table className="admin-table admin-table--static">
            <thead>
              <tr>
                <th scope="col">お客さま</th>
                <th scope="col">サイト</th>
                <th scope="col" className="num">月額</th>
                <th scope="col">開始日</th>
                <th scope="col">終了日</th>
                <th scope="col">状態</th>
                <th scope="col">
                  <span className="visually-hidden">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id}>
                  <td data-label="お客さま">
                    {c.customer_name} 様
                    {c.email && <span className="cell-sub">{c.email}</span>}
                  </td>
                  <td data-label="サイト">
                    {c.site_url ? (
                      <a href={c.site_url} target="_blank" rel="noopener noreferrer">
                        {c.site_name}
                      </a>
                    ) : (
                      c.site_name
                    )}
                  </td>
                  <td data-label="月額" className="num">{yen(c.monthly_fee)}</td>
                  <td data-label="開始日">{formatJpDate(c.start_date)}</td>
                  <td data-label="終了日">{c.end_date ? formatJpDate(c.end_date) : '―'}</td>
                  <td data-label="状態">
                    <Pill tone={c.status}>{labelOf(CONTRACT_STATUSES, c.status)}</Pill>
                  </td>
                  <td className="row-actions">
                    {c.status === 'active' && (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => requestCancel(c)}>
                        <MdEventBusy aria-hidden="true" />
                        解約の申し出
                      </button>
                    )}
                    <button type="button" className="icon-button" aria-label="編集" onClick={() => startEdit(c)}>
                      <MdEdit />
                    </button>
                    <button type="button" className="icon-button" aria-label="削除" onClick={() => remove(c)}>
                      <MdDelete />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
