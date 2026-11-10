import { useState, type FormEvent, type ReactNode } from 'react'
import { MdAdd, MdArrowBack, MdBlock, MdDelete, MdSend } from 'react-icons/md'
import { Link, useNavigate, useParams } from 'react-router'
import { api, type InquiryDetail } from '../../api/client'
import { Card, Empty, Notice, Pill, useAction, useLoader } from '../../components/admin/ui'
import { formatDateTime, formatJpDate, yen } from '../../lib/format'
import {
  CONTRACT_STATUSES,
  ESTIMATE_STATUSES,
  INITIAL_PAYMENTS,
  MAIL_KINDS,
  MAIL_STATUSES,
  MONTHLY_PAYMENTS,
  STATUSES,
  TOPICS,
  labelOf,
} from '../../lib/options'
import { useSite } from '../../lib/SiteContext'
import { usePageTitle } from '../../lib/usePageTitle'
import { StatusBadge } from './StatusBadge'

const NOTE_LABELS = { note: 'メモ', email: 'メール', system: '記録' } as const

function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

export function AdminInquiryDetailPage() {
  const { id = '' } = useParams()
  usePageTitle(`お問い合わせ #${id}`)
  const navigate = useNavigate()
  const business = useSite().content.business
  const { data: item, setData: setItem, error } = useLoader(() => api.getInquiry(id), [id])
  const { data: templates } = useLoader(() => api.templates(), [])
  const { data: mailSettings } = useLoader(() => api.mailSettings(), [])
  const action = useAction()
  const reply = useAction()
  const noteAction = useAction()

  const [note, setNote] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  if (!item) {
    return (
      <>
        <BackLink />
        {error ? <Notice kind="error">{error}</Notice> : <Empty>読み込み中…</Empty>}
      </>
    )
  }

  const update = (changes: { status?: string; is_spam?: boolean }, message: string) =>
    action.run(async () => setItem(await api.updateInquiry(item.id, changes)), message)

  const block = async (pattern: string) => {
    if (!window.confirm(`「${pattern}」からの送信をブロックし、このお問い合わせを迷惑送信にします。よろしいですか？`)) return
    await action.run(async () => {
      await api.addBlock(pattern, `#${item.id} ${item.name} 様のお問い合わせから`).catch((err) => {
        // すでにブロック済みなら、そのまま迷惑送信にします
        if (!(err as { errors?: Record<string, string> }).errors?.pattern) throw err
      })
      setItem(await api.updateInquiry(item.id, { is_spam: true }))
    }, `「${pattern}」をブロックしました。`)
  }

  const remove = async () => {
    if (!window.confirm(`${item.name} 様のお問い合わせを削除します。メモや送信履歴も消え、元に戻せません。よろしいですか？`)) return
    const done = await action.run(() => api.deleteInquiry(item.id))
    if (done) navigate('/admin/inquiries', { replace: true })
  }

  const addNote = async (event: FormEvent) => {
    event.preventDefault()
    const created = await noteAction.run(() => api.addNote(item.id, note))
    if (created) {
      setNote('')
      setItem({ ...item, notes: [created, ...item.notes] })
    }
  }

  const deleteNote = async (noteId: number) => {
    if (!window.confirm('このメモを削除しますか？')) return
    const done = await noteAction.run(() => api.deleteNote(item.id, noteId))
    if (done) setItem({ ...item, notes: item.notes.filter((n) => n.id !== noteId) })
  }

  const applyTemplate = (templateId: string) => {
    const template = templates?.find((t) => String(t.id) === templateId)
    if (!template) return
    const values = {
      name: item.name,
      business_name: business.business_name,
      owner: business.owner,
      business_email: business.email,
      business_phone: business.phone,
      hours: business.hours,
    }
    setSubject(fillTemplate(template.subject, values))
    setBody(fillTemplate(template.body, values))
  }

  const sendReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!window.confirm(`${item.email} にメールを送信します。よろしいですか？`)) return
    const updated = await reply.run(() => api.reply(item.id, subject, body), 'メールを送信しました。')
    if (updated) {
      setItem(updated)
      setSubject('')
      setBody('')
    }
  }

  const domain = `@${item.email.split('@')[1] ?? ''}`
  const rows: [string, ReactNode][] = [
    ['受付日時', formatDateTime(item.created_at)],
    ['ご相談内容', item.topics.map((t) => labelOf(TOPICS, t)).join('、')],
    ['お名前', item.name],
    ['メールアドレス', <a href={`mailto:${item.email}`}>{item.email}</a>],
    ['電話番号', <a href={`tel:${item.phone}`}>{item.phone}</a>],
    ['お住まい', item.prefecture],
    ['ご年齢', item.age ?? '未入力'],
    ['初期費用のお支払い方法', labelOf(INITIAL_PAYMENTS, item.initial_payment)],
    ['月額(おまかせ管理プラン)のお支払い方法', labelOf(MONTHLY_PAYMENTS, item.monthly_payment)],
    ['最終更新', formatDateTime(item.updated_at)],
  ]

  return (
    <>
      <BackLink />
      <div className="admin-page-header">
        <h1 className="admin-title">
          {item.name} 様
          <StatusBadge status={item.status} />
          {item.is_spam && <Pill tone="spam">迷惑送信</Pill>}
        </h1>
        <div className="admin-page-header__actions">
          {item.is_spam ? (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => update({ is_spam: false }, '迷惑送信から戻しました。')} disabled={action.busy}>
              迷惑送信から戻す
            </button>
          ) : (
            <>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => update({ is_spam: true }, '迷惑送信にしました。')} disabled={action.busy}>
                迷惑送信にする
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => block(item.email)} disabled={action.busy}>
                <MdBlock aria-hidden="true" />
                このアドレスをブロック
              </button>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => block(domain)} disabled={action.busy}>
                <MdBlock aria-hidden="true" />
                {domain} をブロック
              </button>
            </>
          )}
          <button type="button" className="btn btn--danger btn--small" onClick={remove} disabled={action.busy}>
            <MdDelete aria-hidden="true" />
            削除
          </button>
        </div>
      </div>
      <Notice kind="success">{action.message}</Notice>
      <Notice kind="error">{action.error}</Notice>

      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card title="お問い合わせの内容" className="admin-detail">
            <dl className="info-table">
              {rows.map(([label, value]) => (
                <div key={label} className="info-table__row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="メールで返信">
            {mailSettings && !mailSettings.ready && (
              <Notice kind="warning">
                {mailSettings.reason} <Link to="/admin/mail">メールの設定へ</Link>
              </Notice>
            )}
            <form onSubmit={sendReply} className="stack">
              <label className="inline-field">
                <span>テンプレート</span>
                <select className="input input--small select" defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">選んで差し込む</option>
                  {templates?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Link to="/admin/mail?tab=templates" className="admin-link">
                  テンプレートを編集
                </Link>
              </label>
              <input className="input" placeholder="件名" aria-label="件名" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              {reply.fieldErrors.subject && <p className="field__error">{reply.fieldErrors.subject}</p>}
              <textarea className="input textarea" rows={10} placeholder="本文" aria-label="本文" value={body} onChange={(e) => setBody(e.target.value)} />
              {reply.fieldErrors.body && <p className="field__error">{reply.fieldErrors.body}</p>}
              <div className="form-actions">
                <span className="field__help">宛先: {item.email}</span>
                <button type="submit" className="btn btn--primary btn--small" disabled={reply.busy || !subject.trim() || !body.trim()}>
                  <MdSend aria-hidden="true" />
                  {reply.busy ? '送信中…' : '送信する'}
                </button>
              </div>
              <Notice kind="success">{reply.message}</Notice>
              <Notice kind="error">{reply.error}</Notice>
            </form>
          </Card>

          <Card title="対応メモ・履歴">
            <form onSubmit={addNote} className="stack">
              <textarea
                className="input textarea"
                rows={3}
                placeholder="例: 10/28 に電話。ご予算は30万円ほど。"
                aria-label="メモ"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={5000}
              />
              <div className="form-actions">
                <span />
                <button type="submit" className="btn btn--outline btn--small" disabled={noteAction.busy || !note.trim()}>
                  <MdAdd aria-hidden="true" />
                  メモを追加
                </button>
              </div>
              <Notice kind="error">{noteAction.error}</Notice>
            </form>
            {item.notes.length === 0 ? (
              <Empty>まだ記録はありません。</Empty>
            ) : (
              <ol className="timeline-list">
                {item.notes.map((n) => (
                  <li key={n.id} className={`timeline-list__item timeline-list__item--${n.kind}`}>
                    <div className="timeline-list__meta">
                      <Pill tone={n.kind === 'note' ? 'info' : n.kind === 'email' ? 'success' : 'neutral'}>{NOTE_LABELS[n.kind]}</Pill>
                      <span>{formatDateTime(n.created_at)}</span>
                      {n.kind === 'note' && (
                        <button type="button" className="link-button" onClick={() => deleteNote(n.id)}>
                          削除
                        </button>
                      )}
                    </div>
                    <p className="timeline-list__body">{n.body}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="detail-grid__side">
          <Card title="対応状況">
            <div className="segmented segmented--stack" role="group" aria-label="対応状況を変更">
              {STATUSES.map((status) => (
                <button
                  key={status.value}
                  type="button"
                  className={`segmented__item${item.status === status.value ? ' segmented__item--active' : ''}`}
                  aria-pressed={item.status === status.value}
                  disabled={action.busy}
                  onClick={() => status.value !== item.status && update({ status: status.value }, `対応状況を「${status.label}」に変更しました。`)}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </Card>

          <Card title="送信したメール">
            {item.mails.length === 0 ? (
              <Empty>まだありません。</Empty>
            ) : (
              <ul className="mail-list">
                {item.mails.map((m) => (
                  <li key={m.id}>
                    <div className="mail-list__head">
                      <Pill tone={m.status === 'sent' ? 'success' : m.status === 'failed' ? 'danger' : 'warning'}>{labelOf(MAIL_STATUSES, m.status)}</Pill>
                      <span>{labelOf(MAIL_KINDS, m.kind)}</span>
                    </div>
                    <p className="mail-list__subject">{m.subject}</p>
                    <p className="mail-list__meta">
                      {m.to_addr}・{formatDateTime(m.created_at)}
                    </p>
                    {m.error && <p className="mail-list__error">{m.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <RelatedCard item={item} />
        </aside>
      </div>
    </>
  )
}

function RelatedCard({ item }: { item: InquiryDetail }) {
  return (
    <Card title="見積書・おまかせ管理プラン">
      <h3 className="side-heading">見積書</h3>
      {item.estimates.length === 0 ? (
        <p className="field__help">まだありません。</p>
      ) : (
        <ul className="related-list">
          {item.estimates.map((e) => (
            <li key={e.id}>
              <Link to={`/admin/estimates/${e.id}`}>{e.number}</Link>
              <span>{e.title}</span>
              <span>{yen(e.total)}</span>
              <Pill tone={e.status}>{labelOf(ESTIMATE_STATUSES, e.status)}</Pill>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/admin/estimates/new?inquiry=${item.id}`} className="btn btn--outline btn--small">
        <MdAdd aria-hidden="true" />
        見積書を作成
      </Link>

      <h3 className="side-heading">おまかせ管理プラン</h3>
      {item.contracts.length === 0 ? (
        <p className="field__help">まだありません。</p>
      ) : (
        <ul className="related-list">
          {item.contracts.map((c) => (
            <li key={c.id}>
              <Link to={`/admin/contracts?edit=${c.id}`}>{c.site_name}</Link>
              <span>月額 {yen(c.monthly_fee)}</span>
              <span>{formatJpDate(c.start_date)}〜</span>
              <Pill tone={c.status}>{labelOf(CONTRACT_STATUSES, c.status)}</Pill>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/admin/contracts?new=1&inquiry=${item.id}`} className="btn btn--outline btn--small">
        <MdAdd aria-hidden="true" />
        おまかせ管理プランを登録
      </Link>
    </Card>
  )
}

function BackLink() {
  return (
    <p className="admin-back">
      <Link to="/admin/inquiries">
        <MdArrowBack aria-hidden="true" />
        一覧へ戻る
      </Link>
    </p>
  )
}
