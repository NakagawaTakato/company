import { useEffect, useState, type FormEvent } from 'react'
import { MdAdd, MdDelete, MdEdit, MdRefresh, MdSend } from 'react-icons/md'
import { Link, useSearchParams } from 'react-router'
import { api, type DeviceCode, type MailSettings, type Notifications, type OutboxMail, type ReplyTemplate, type SmtpSettings } from '../../api/client'
import { Card, Empty, Field, Notice, PageHeader, Pagination, Pill, Tabs, useAction, useLoader } from '../../components/admin/ui'
import { formatDateTime } from '../../lib/format'
import { MAIL_KINDS, MAIL_STATUSES, labelOf } from '../../lib/options'
import { usePageTitle } from '../../lib/usePageTitle'

type Tab = 'smtp' | 'notify' | 'templates' | 'outbox'

const TABS: { value: Tab; label: string }[] = [
  { value: 'smtp', label: '送信設定' },
  { value: 'notify', label: '通知・自動返信' },
  { value: 'templates', label: '返信テンプレート' },
  { value: 'outbox', label: '送信履歴' },
]

const PLACEHOLDERS: [string, string][] = [
  ['{name}', 'お客さまのお名前'],
  ['{business_name}', '屋号'],
  ['{owner}', '運営責任者'],
  ['{business_email}', '事業者のメールアドレス'],
  ['{business_phone}', '事業者の電話番号'],
  ['{hours}', '対応時間'],
]

function PlaceholderHelp({ withSummary = false }: { withSummary?: boolean }) {
  const items = withSummary ? [...PLACEHOLDERS, ['{inquiry_summary}', 'お問い合わせの内容（一覧）'] as [string, string]] : PLACEHOLDERS
  return (
    <details className="placeholder-help">
      <summary>差し込みできる項目</summary>
      <ul>
        {items.map(([key, label]) => (
          <li key={key}>
            <code>{key}</code> … {label}
          </li>
        ))}
      </ul>
    </details>
  )
}

export function AdminMailPage() {
  usePageTitle('メール')
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'smtp') as Tab
  const { data, setData, error } = useLoader(() => api.mailSettings(), [])

  return (
    <>
      <PageHeader title="メール" lead="お問い合わせの新着通知・お客さまへの自動返信・管理画面からの返信に使うメールの設定です。" />
      {data && !data.ready && tab !== 'smtp' && (
        <Notice kind="warning">まだメールを送信できないため、「未送信」として記録されます。（{data.reason}）</Notice>
      )}
      <Tabs tabs={TABS} value={tab} onChange={(value) => setParams({ tab: value })} label="メールの設定" />
      <Notice kind="error">{error}</Notice>
      {!data ? (
        <Empty>読み込み中…</Empty>
      ) : (
        <>
          {tab === 'smtp' && <SendSettings settings={data} onSaved={setData} />}
          {tab === 'notify' && <NotifyForm settings={data} onSaved={setData} />}
          {tab === 'templates' && <TemplatesPanel />}
          {tab === 'outbox' && <OutboxPanel />}
        </>
      )}
    </>
  )
}

function SendSettings({ settings, onSaved }: { settings: MailSettings; onSaved: (s: MailSettings) => void }) {
  const action = useAction()
  const test = useAction()
  const [testTo, setTestTo] = useState(settings.business_email)

  const changeMethod = async (method: 'outlook' | 'smtp') => {
    const result = await action.run(() => api.setMailMethod(method), method === 'outlook' ? 'Outlook で送るように切り替えました。' : 'SMTP で送るように切り替えました。')
    if (result) onSaved(result)
  }

  return (
    <>
      <Card title="送信方法">
        <div className="method-options" role="radiogroup" aria-label="送信方法">
          <label className={`method-option${settings.method === 'outlook' ? ' method-option--active' : ''}`}>
            <input type="radio" name="method" checked={settings.method === 'outlook'} onChange={() => changeMethod('outlook')} disabled={action.busy} />
            <span>
              <strong>Outlook（Microsoft Graph）</strong>
              <span className="field__help">元のサイトと同じ方法です。Azure に登録したアプリで、Outlook のアカウントから送ります。</span>
            </span>
          </label>
          <label className={`method-option${settings.method === 'smtp' ? ' method-option--active' : ''}`}>
            <input type="radio" name="method" checked={settings.method === 'smtp'} onChange={() => changeMethod('smtp')} disabled={action.busy} />
            <span>
              <strong>SMTP</strong>
              <span className="field__help">レンタルサーバーや Gmail などのメールサーバーを使って送ります。</span>
            </span>
          </label>
        </div>
        <p className="status-line">
          状態: {settings.ready ? <Pill tone="success">送信できます</Pill> : <Pill tone="warning">まだ送信できません</Pill>}
          {!settings.ready && <span className="field__help"> {settings.reason}</span>}
        </p>
        <Notice kind="success">{action.message}</Notice>
        <Notice kind="error">{action.error}</Notice>
      </Card>

      <div className="two-columns">
        {settings.method === 'outlook' ? <OutlookPanel settings={settings} onSaved={onSaved} /> : <SmtpForm settings={settings} onSaved={onSaved} />}
        <div>
          <Card title="テスト送信">
            <p className="field__help">今の送信方法で、テストメールを送ります。</p>
            <div className="inline-field">
              <input className="input input--small" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="テストメールの宛先" />
              <button type="button" className="btn btn--outline btn--small" onClick={() => test.run(() => api.testMail(testTo), `${testTo} に送信しました。届いているか確認してください。`)} disabled={test.busy || !settings.ready}>
                <MdSend aria-hidden="true" />
                {test.busy ? '送信中…' : '送信'}
              </button>
            </div>
            <Notice kind="success">{test.message}</Notice>
            <Notice kind="error">{test.fieldErrors.to || test.error}</Notice>
          </Card>
          {settings.method === 'smtp' && (
            <Card title="Gmail を使う場合の入力例">
              <ul className="help-list">
                <li>サーバー名: smtp.gmail.com</li>
                <li>接続方式: STARTTLS（ポート 587）</li>
                <li>ユーザー名・送信元: Gmail のアドレス</li>
                <li>パスワード: Google アカウントで作成した「アプリ パスワード」（2段階認証が必要です）</li>
              </ul>
              <p className="field__help">レンタルサーバーのメールを使う場合は、サーバー会社の案内にある「送信（SMTP）サーバー」の情報を入力してください。</p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function OutlookPanel({ settings, onSaved }: { settings: MailSettings; onSaved: (s: MailSettings) => void }) {
  const action = useAction()
  const [device, setDevice] = useState<DeviceCode | null>(null)
  const [copied, setCopied] = useState(false)
  const outlook = settings.outlook

  // ブラウザでのサインインが終わるまで、決まった間隔で確認します
  useEffect(() => {
    if (!device) return
    let active = true
    let wait = Math.max(device.interval, 2) * 1000
    let timer = 0
    const check = async () => {
      try {
        const result = await api.outlookPoll(device.flow_id)
        if (!active) return
        if (result.status === 'ok' && result.settings) {
          setDevice(null)
          onSaved(result.settings)
          action.setMessage('サインインしました。お問い合わせメールを Outlook から送れます。')
          return
        }
        if (result.status === 'slow_down') wait += 5000
        timer = window.setTimeout(check, wait)
      } catch (err) {
        if (!active) return
        setDevice(null)
        action.setError(err instanceof Error ? err.message : 'サインインできませんでした。')
      }
    }
    timer = window.setTimeout(check, wait)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device])

  const start = async () => {
    setCopied(false)
    const result = await action.run(() => api.outlookDeviceCode())
    if (result) setDevice(result)
  }

  const signOut = async () => {
    if (!window.confirm('Outlook のサインインを解除します。解除すると、もう一度サインインするまでメールは送られません。よろしいですか？')) return
    const result = await action.run(() => api.outlookLogout(), 'サインインを解除しました。')
    if (result) onSaved(result)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(device?.user_code ?? '')
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Card title="Outlook（Microsoft）のサインイン">
      {!outlook.configured ? (
        <Notice kind="warning">
          .env の MICROSOFT_CLIENT_ID（Azure に登録したアプリのクライアント ID）が設定されていません。設定してから、バックエンドを再起動してください。
        </Notice>
      ) : outlook.signed_in ? (
        <>
          <p className="status-line">
            <Pill tone="success">サインイン済み</Pill> 送信元: <strong>{outlook.from_address}</strong>
          </p>
          <p className="field__help">お問い合わせの新着通知・自動返信・管理画面からの返信は、この Outlook アカウントから送られます。</p>
          <div className="form-actions">
            <span />
            <button type="button" className="btn btn--ghost btn--small" onClick={signOut} disabled={action.busy}>
              サインインを解除
            </button>
          </div>
        </>
      ) : device ? (
        <div className="device-login">
          <ol>
            <li>
              次のページを開きます:{' '}
              <a href={device.verification_uri} target="_blank" rel="noopener noreferrer">
                {device.verification_uri}
              </a>
            </li>
            <li>
              次のコードを入力します:
              <span className="device-login__code">{device.user_code}</span>
              <button type="button" className="btn btn--ghost btn--small" onClick={copy}>
                {copied ? 'コピーしました' : 'コピー'}
              </button>
            </li>
            <li>
              メールを送る Outlook アカウント（<strong>{outlook.from_address}</strong>）でサインインし、アクセスを許可します。
            </li>
          </ol>
          <p className="device-login__waiting" role="status">
            サインインが終わるのを待っています…（この画面は開いたままにしてください。コードの有効期限は {Math.round(device.expires_in / 60)} 分です）
          </p>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setDevice(null)}>
            やめる
          </button>
        </div>
      ) : (
        <>
          <p className="status-line">
            <Pill tone="warning">未サインイン</Pill>
          </p>
          <p className="field__help">
            最初の1回だけ、メールを送る Outlook アカウント（{outlook.from_address}）でサインインしてください。以降は自動で送られます。
          </p>
          <div className="form-actions">
            <span />
            <button type="button" className="btn btn--primary btn--small" onClick={start} disabled={action.busy}>
              {action.busy ? '準備中…' : 'Outlook にサインイン'}
            </button>
          </div>
        </>
      )}
      <Notice kind="success">{action.message}</Notice>
      <Notice kind="error">{action.error}</Notice>
    </Card>
  )
}

function SmtpForm({ settings, onSaved }: { settings: MailSettings; onSaved: (s: MailSettings) => void }) {
  const action = useAction()
  const [form, setForm] = useState<Omit<SmtpSettings, 'password_set' | 'ready'>>(() => ({
    host: settings.smtp.host,
    port: settings.smtp.port,
    security: settings.smtp.security,
    username: settings.smtp.username,
    from_address: settings.smtp.from_address,
    from_name: settings.smtp.from_name,
  }))
  const [password, setPassword] = useState('')
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }))
  const errors = action.fieldErrors

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const result = await action.run(() => api.saveSmtp({ ...form, password: password || null }), '保存しました。')
    if (result) {
      onSaved(result)
      setPassword('')
    }
  }

  const changeSecurity = (security: SmtpSettings['security']) => {
    setForm((f) => ({ ...f, security, port: security === 'ssl' ? 465 : security === 'starttls' ? 587 : f.port }))
  }

  return (
    <Card title="送信用メールサーバー（SMTP）">
      <form onSubmit={save} noValidate>
        <div className="form-grid">
          <Field label="サーバー名" htmlFor="smtp-host" error={errors.host} hint="例: smtp.gmail.com">
            <input id="smtp-host" className="input" value={form.host} onChange={(e) => set('host', e.target.value)} maxLength={255} />
          </Field>
          <Field label="接続方式" htmlFor="smtp-security" error={errors.security}>
            <select id="smtp-security" className="input select" value={form.security} onChange={(e) => changeSecurity(e.target.value as SmtpSettings['security'])}>
              <option value="starttls">STARTTLS（ポート 587）</option>
              <option value="ssl">SSL/TLS（ポート 465）</option>
              <option value="none">暗号化なし（おすすめしません）</option>
            </select>
          </Field>
          <Field label="ポート" htmlFor="smtp-port" error={errors.port}>
            <input id="smtp-port" type="number" className="input" value={form.port} onChange={(e) => set('port', Number(e.target.value))} />
          </Field>
          <Field label="ユーザー名" htmlFor="smtp-user" error={errors.username} hint="多くの場合、メールアドレスです。">
            <input id="smtp-user" className="input" value={form.username} onChange={(e) => set('username', e.target.value)} maxLength={255} autoComplete="off" />
          </Field>
          <Field
            label="パスワード"
            htmlFor="smtp-password"
            error={errors.password}
            hint={settings.smtp.password_set ? '設定済みです。変更する場合だけ入力してください。' : 'Gmail の場合は「アプリ パスワード」を使います。'}
          >
            <input id="smtp-password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={255} autoComplete="new-password" placeholder={settings.smtp.password_set ? '••••••••（変更しない）' : ''} />
          </Field>
          <Field label="送信元メールアドレス" htmlFor="smtp-from" error={errors.from_address}>
            <input id="smtp-from" type="email" className="input" value={form.from_address} onChange={(e) => set('from_address', e.target.value)} maxLength={254} />
          </Field>
          <Field label="差出人名" htmlFor="smtp-from-name" error={errors.from_name}>
            <input id="smtp-from-name" className="input" value={form.from_name} onChange={(e) => set('from_name', e.target.value)} maxLength={100} />
          </Field>
        </div>
        <Notice kind="success">{action.message}</Notice>
        <Notice kind="error">{action.error}</Notice>
        <div className="form-actions">
          <span />
          <button type="submit" className="btn btn--primary btn--small" disabled={action.busy}>
            {action.busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </form>
    </Card>
  )
}

function NotifyForm({ settings, onSaved }: { settings: MailSettings; onSaved: (s: MailSettings) => void }) {
  const action = useAction()
  const [form, setForm] = useState<Notifications>(settings.notifications)
  const [recipients, setRecipients] = useState(settings.notifications.admin_to.join('\n'))
  const set = <K extends keyof Notifications>(key: K, value: Notifications[K]) => setForm((f) => ({ ...f, [key]: value }))
  const errors = action.fieldErrors
  const adminToError = Object.entries(errors).find(([k]) => k.startsWith('admin_to'))?.[1]

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const result = await action.run(
      () => api.saveNotifications({ ...form, admin_to: recipients.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) }),
      '保存しました。',
    )
    if (result) onSaved(result)
  }

  return (
    <form onSubmit={save} noValidate>
      <Card title="新着通知（管理者あて）">
        <label className="check">
          <input type="checkbox" checked={form.admin_notify} onChange={(e) => set('admin_notify', e.target.checked)} />
          お問い合わせが届いたら、メールで知らせる
        </label>
        <Field label="通知の送り先（1行に1つ・5件まで）" htmlFor="admin-to" error={adminToError} hint={`空欄のときは事業者情報のメールアドレス（${settings.business_email}）に送ります。`}>
          <textarea id="admin-to" className="input textarea" rows={2} value={recipients} onChange={(e) => setRecipients(e.target.value)} />
        </Field>
        <Field label="サイトの URL（通知メールの管理画面リンクに使います）" htmlFor="site-url" error={errors.site_url} hint="公開したら、公開サイトの URL に変えてください。">
          <input id="site-url" className="input" value={form.site_url} onChange={(e) => set('site_url', e.target.value)} maxLength={300} />
        </Field>
      </Card>

      <Card title="自動返信（お客さまあて）">
        <label className="check">
          <input type="checkbox" checked={form.auto_reply} onChange={(e) => set('auto_reply', e.target.checked)} />
          お問い合わせを受け付けたことを、お客さまにメールで知らせる
        </label>
        <Field label="件名" htmlFor="auto-subject" error={errors.auto_reply_subject}>
          <input id="auto-subject" className="input" value={form.auto_reply_subject} onChange={(e) => set('auto_reply_subject', e.target.value)} maxLength={200} />
        </Field>
        <Field label="本文" htmlFor="auto-body" error={errors.auto_reply_body}>
          <textarea id="auto-body" className="input textarea" rows={14} value={form.auto_reply_body} onChange={(e) => set('auto_reply_body', e.target.value)} maxLength={10000} />
        </Field>
        <PlaceholderHelp withSummary />
        <Notice kind="success">{action.message}</Notice>
        <Notice kind="error">{action.error}</Notice>
        <div className="form-actions">
          <span />
          <button type="submit" className="btn btn--primary btn--small" disabled={action.busy}>
            {action.busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </Card>
    </form>
  )
}

function TemplatesPanel() {
  const { data, error, reload } = useLoader(() => api.templates(), [])
  const action = useAction()
  const [editing, setEditing] = useState<ReplyTemplate | 'new' | null>(null)
  const [form, setForm] = useState({ name: '', subject: '', body: '' })

  useEffect(() => {
    if (editing && editing !== 'new') setForm({ name: editing.name, subject: editing.subject, body: editing.body })
    if (editing === 'new') setForm({ name: '', subject: '【{business_name}】', body: '{name} 様\n\n{business_name}の{owner}です。\n\n' })
  }, [editing])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const result = await action.run(
      () => (editing && editing !== 'new' ? api.updateTemplate(editing.id, form) : api.createTemplate(form)),
      '保存しました。',
    )
    if (result) {
      setEditing(null)
      reload()
    }
  }

  const remove = async (t: ReplyTemplate) => {
    if (!window.confirm(`テンプレート「${t.name}」を削除しますか？`)) return
    if (await action.run(() => api.deleteTemplate(t.id), '削除しました。')) reload()
  }

  const errors = action.fieldErrors
  return (
    <>
      <Notice kind="success">{action.message}</Notice>
      {!editing && <Notice kind="error">{action.error || error}</Notice>}
      {editing ? (
        <Card title={editing === 'new' ? 'テンプレートを追加' : `テンプレートを編集（${editing.name}）`}>
          <form onSubmit={save} noValidate>
            <Field label="テンプレート名" htmlFor="tpl-name" required error={errors.name}>
              <input id="tpl-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} />
            </Field>
            <Field label="件名" htmlFor="tpl-subject" required error={errors.subject}>
              <input id="tpl-subject" className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={200} />
            </Field>
            <Field label="本文" htmlFor="tpl-body" required error={errors.body}>
              <textarea id="tpl-body" className="input textarea" rows={12} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={20000} />
            </Field>
            <PlaceholderHelp />
            <Notice kind="error">{action.error}</Notice>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setEditing(null)}>
                キャンセル
              </button>
              <button type="submit" className="btn btn--primary btn--small" disabled={action.busy}>
                {action.busy ? '保存中…' : '保存する'}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <Card
          title="返信テンプレート"
          actions={
            <button type="button" className="btn btn--primary btn--small" onClick={() => setEditing('new')}>
              <MdAdd aria-hidden="true" />
              追加
            </button>
          }
        >
          <p className="field__help">お問い合わせの詳細画面で返信するときに、選んで差し込めます。</p>
          {!data ? (
            <Empty>読み込み中…</Empty>
          ) : data.length === 0 ? (
            <Empty>テンプレートはまだありません。</Empty>
          ) : (
            <ul className="template-list">
              {data.map((t) => (
                <li key={t.id}>
                  <div>
                    <p className="template-list__name">{t.name}</p>
                    <p className="template-list__subject">件名: {t.subject}</p>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="icon-button" aria-label={`${t.name}を編集`} onClick={() => setEditing(t)}>
                      <MdEdit />
                    </button>
                    <button type="button" className="icon-button" aria-label={`${t.name}を削除`} onClick={() => remove(t)}>
                      <MdDelete />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}

function OutboxPanel() {
  const [page, setPage] = useState(1)
  const { data, error, reload } = useLoader(() => api.outbox(page), [page])
  const action = useAction()

  const retry = async (id: number) => {
    if (await action.run(() => api.retryMail(id), '送信しました。')) reload()
  }

  const remove = async (m: OutboxMail) => {
    const note = m.status === 'sent' ? '送ったメールが取り消されるわけではありません。' : '削除すると、送り直せなくなります。'
    if (!window.confirm(`${m.to_addr} あてのメール「${m.subject}」の記録を削除します。${note}よろしいですか？`)) return
    if (!(await action.run(() => api.deleteMail(m.id), '削除しました。'))) return
    // ページに残っていた最後の1件を消したときは、前のページに戻ります
    if (data && data.items.length === 1 && page > 1) setPage(page - 1)
    else reload()
  }

  return (
    <>
      <Notice kind="success">{action.message}</Notice>
      <Notice kind="error">{action.error || error}</Notice>
      <div className="admin-card">
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : data.items.length === 0 ? (
          <Empty>送信したメールはまだありません。</Empty>
        ) : (
          <table className="admin-table admin-table--static">
            <thead>
              <tr>
                <th scope="col">日時</th>
                <th scope="col">種類</th>
                <th scope="col">宛先</th>
                <th scope="col">件名</th>
                <th scope="col">状態</th>
                <th scope="col">
                  <span className="visually-hidden">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.id}>
                  <td data-label="日時">{formatDateTime(m.created_at)}</td>
                  <td data-label="種類">
                    {labelOf(MAIL_KINDS, m.kind)}
                    {m.inquiry_id && (
                      <Link to={`/admin/inquiries/${m.inquiry_id}`} className="cell-sub">
                        {m.inquiry_name ? `${m.inquiry_name} 様` : `#${m.inquiry_id}`}
                      </Link>
                    )}
                  </td>
                  <td data-label="宛先">{m.to_addr}</td>
                  <td data-label="件名">
                    {m.subject}
                    {m.error && <span className="cell-sub cell-sub--error">{m.error}</span>}
                  </td>
                  <td data-label="状態">
                    <Pill tone={m.status === 'sent' ? 'success' : m.status === 'failed' ? 'danger' : 'warning'}>{labelOf(MAIL_STATUSES, m.status)}</Pill>
                  </td>
                  <td className="row-actions">
                    {(m.status === 'failed' || m.status === 'skipped') && (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => retry(m.id)} disabled={action.busy}>
                        <MdRefresh aria-hidden="true" />
                        送り直す
                      </button>
                    )}
                    {m.status !== 'pending' && (
                      <button type="button" className="btn btn--ghost btn--small" onClick={() => remove(m)} disabled={action.busy}>
                        <MdDelete aria-hidden="true" />
                        削除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {data && (
        <div className="list-footer">
          <span>全 {data.total} 件</span>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </div>
      )}
    </>
  )
}
