import { useState, type FormEvent } from 'react'
import { api } from '../../api/client'
import { Card, Field, Notice, PageHeader, useAction } from '../../components/admin/ui'
import { usePageTitle } from '../../lib/usePageTitle'
import { useAdmin } from './AdminLayout'

export function AdminAccountPage() {
  usePageTitle('アカウント')
  const { email } = useAdmin()
  const action = useAction()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mismatch, setMismatch] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (next !== confirm) {
      setMismatch('確認用のパスワードが一致しません。')
      return
    }
    setMismatch('')
    const done = await action.run(() => api.changePassword(current, next), 'パスワードを変更しました。ほかの端末のログインは解除されました。')
    if (done) {
      setCurrent('')
      setNext('')
      setConfirm('')
    }
  }

  return (
    <>
      <PageHeader title="アカウント" />
      <Card title="ログイン中の管理者">
        <p>{email}</p>
        <p className="field__help">メールアドレスは、プロジェクトフォルダの .env の ADMIN_EMAIL で変更できます（変更後はバックエンドを再起動してください）。</p>
      </Card>
      <Card title="パスワードの変更">
        <form onSubmit={submit} noValidate className="narrow-form">
          <Field label="今のパスワード" htmlFor="current" required error={action.fieldErrors.current_password}>
            <input id="current" type="password" className="input" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="新しいパスワード（8文字以上）" htmlFor="new" required error={action.fieldErrors.new_password}>
            <input id="new" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} maxLength={128} />
          </Field>
          <Field label="新しいパスワード（確認）" htmlFor="confirm" required error={mismatch}>
            <input id="confirm" type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} maxLength={128} />
          </Field>
          <Notice kind="success">{action.message}</Notice>
          <Notice kind="error">{action.error && !Object.keys(action.fieldErrors).length ? action.error : action.fieldErrors.body}</Notice>
          <div className="form-actions">
            <span />
            <button type="submit" className="btn btn--primary btn--small" disabled={action.busy || !current || !next || !confirm}>
              {action.busy ? '変更中…' : '変更する'}
            </button>
          </div>
        </form>
        <Notice kind="info">
          パスワードを忘れたときは、.env の ADMIN_PASSWORD を新しい値に書き換えてバックエンドを再起動すると、その値でログインできるようになります。
        </Notice>
      </Card>
    </>
  )
}
