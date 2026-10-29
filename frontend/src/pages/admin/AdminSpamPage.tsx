import { useState, type FormEvent } from 'react'
import { MdAdd, MdArrowForward, MdDelete } from 'react-icons/md'
import { Link } from 'react-router'
import { api, type Block } from '../../api/client'
import { Card, Empty, Field, Notice, PageHeader, useAction, useLoader } from '../../components/admin/ui'
import { formatDateTime } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'

export function AdminSpamPage() {
  usePageTitle('迷惑送信')
  const { data, error, reload } = useLoader(() => api.blocklist(), [])
  const action = useAction()
  const [pattern, setPattern] = useState('')
  const [note, setNote] = useState('')

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (await action.run(() => api.addBlock(pattern.trim(), note.trim()), `「${pattern.trim()}」をブロックしました。`)) {
      setPattern('')
      setNote('')
      reload()
    }
  }

  const remove = async (block: Block) => {
    if (!window.confirm(`「${block.pattern}」のブロックを解除しますか？`)) return
    if (await action.run(() => api.deleteBlock(block.id), 'ブロックを解除しました。')) reload()
  }

  return (
    <>
      <PageHeader
        title="迷惑送信"
        lead="ブロックしたメールアドレス・ドメインからのお問い合わせは「迷惑送信」として保存され、通知メールや自動返信は送られません。"
        actions={
          <Link to="/admin/inquiries?spam=1" className="btn btn--outline btn--small">
            迷惑送信の一覧を見る
            <MdArrowForward aria-hidden="true" />
          </Link>
        }
      />
      <Notice kind="info">
        フォームには、人には見えない入力欄（ボット対策）も入っています。機械的な送信の多くは、ここに登録しなくても保存されません。
      </Notice>

      <Card title="ブロックを追加">
        <form onSubmit={add} noValidate>
          <div className="form-grid">
            <Field label="メールアドレス、または @ドメイン" htmlFor="pattern" required error={action.fieldErrors.pattern} hint="例: spam@example.com / @example.com（そのドメインのすべてのアドレス）">
              <input id="pattern" className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} maxLength={254} />
            </Field>
            <Field label="メモ（任意）" htmlFor="block-note" error={action.fieldErrors.note}>
              <input id="block-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            </Field>
          </div>
          <Notice kind="success">{action.message}</Notice>
          <Notice kind="error">{action.error}</Notice>
          <div className="form-actions">
            <span />
            <button type="submit" className="btn btn--primary btn--small" disabled={action.busy || !pattern.trim()}>
              <MdAdd aria-hidden="true" />
              ブロックする
            </button>
          </div>
        </form>
      </Card>

      <Card title="ブロック中のアドレス・ドメイン">
        <Notice kind="error">{error}</Notice>
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : data.length === 0 ? (
          <Empty>ブロックしているものはありません。</Empty>
        ) : (
          <table className="admin-table admin-table--static admin-table--compact">
            <thead>
              <tr>
                <th scope="col">アドレス・ドメイン</th>
                <th scope="col">メモ</th>
                <th scope="col">登録日時</th>
                <th scope="col">
                  <span className="visually-hidden">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id}>
                  <td data-label="アドレス・ドメイン">{b.pattern}</td>
                  <td data-label="メモ">{b.note || '―'}</td>
                  <td data-label="登録日時">{formatDateTime(b.created_at)}</td>
                  <td className="row-actions">
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => remove(b)}>
                      <MdDelete aria-hidden="true" />
                      解除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
