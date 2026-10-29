import { useEffect, useState, type FormEvent } from 'react'
import { MdDeleteSweep, MdDownload } from 'react-icons/md'
import { api, type Retention } from '../../api/client'
import { Card, Empty, Field, Notice, PageHeader, useAction, useLoader } from '../../components/admin/ui'
import { formatDateTime } from '../../lib/format'
import { STATUSES } from '../../lib/options'
import { usePageTitle } from '../../lib/usePageTitle'

type RetentionForm = Omit<Retention, 'targets' | 'last_run'>

export function AdminDataPage() {
  usePageTitle('データ管理')
  const backup = useAction()
  const { data, setData, error } = useLoader(() => api.retention(), [])
  const save = useAction()
  const runner = useAction()
  const [form, setForm] = useState<RetentionForm>()

  useEffect(() => {
    if (data) setForm({ enabled: data.enabled, months: data.months, statuses: data.statuses, spam_days: data.spam_days })
  }, [data])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    const result = await save.run(() => api.saveRetention(form), '保存しました。')
    if (result) setData(result)
  }

  const runNow = async () => {
    const preview = await runner.run(() => api.runRetention(true))
    if (!preview) return
    if (preview.count === 0) {
      runner.setMessage('いま削除の対象になるお問い合わせはありません。')
      return
    }
    if (!window.confirm(`${preview.count} 件のお問い合わせを削除します。元に戻せません。よろしいですか？`)) return
    const done = await runner.run(() => api.runRetention(false), '削除しました。')
    if (done) setData(await api.retention())
  }

  const toggleStatus = (value: string, checked: boolean) =>
    form && setForm({ ...form, statuses: checked ? [...form.statuses, value] : form.statuses.filter((s) => s !== value) })

  return (
    <>
      <PageHeader title="データ管理" lead="バックアップと、古いお問い合わせ（個人情報）の自動削除の設定です。" />

      <Card title="バックアップ">
        <p className="field__help">データベースとアップロードした画像を、1つの zip ファイルにまとめてダウンロードします。定期的に保存しておくと安心です。</p>
        <Notice kind="error">{backup.error}</Notice>
        <button type="button" className="btn btn--outline btn--small" onClick={() => backup.run(() => api.downloadBackup())} disabled={backup.busy}>
          <MdDownload aria-hidden="true" />
          {backup.busy ? '作成中…' : 'バックアップをダウンロード'}
        </button>
      </Card>

      <Card title="個人情報の自動削除">
        <Notice kind="error">{error}</Notice>
        {!form || !data ? (
          <Empty>読み込み中…</Empty>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="field__help">
              個人情報の取扱いに「不要になった情報は削除します」と書いているため、対応が終わったお問い合わせを一定期間のあとに自動で削除できます。有効にすると、1日1回確認して削除します。
            </p>
            <label className="check">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
              自動削除を有効にする
            </label>
            <div className="form-grid">
              <Field label="対応が終わってから、何か月で削除するか" htmlFor="months" error={save.fieldErrors.months}>
                <input id="months" type="number" min={1} max={120} className="input" value={form.months} onChange={(e) => setForm({ ...form, months: Number(e.target.value) })} />
              </Field>
              <Field label="迷惑送信は、何日で削除するか" htmlFor="spam_days" error={save.fieldErrors.spam_days}>
                <input id="spam_days" type="number" min={1} max={3650} className="input" value={form.spam_days} onChange={(e) => setForm({ ...form, spam_days: Number(e.target.value) })} />
              </Field>
            </div>
            <fieldset className="field">
              <legend className="field__label">「対応が終わった」とみなす対応状況</legend>
              <div className="choices">
                {STATUSES.map((s) => (
                  <label key={s.value} className="choice">
                    <input type="checkbox" checked={form.statuses.includes(s.value)} onChange={(e) => toggleStatus(s.value, e.target.checked)} />
                    <span>{s.label}</span>
                  </label>
                ))}
              </div>
              {save.fieldErrors.statuses && <p className="field__error">{save.fieldErrors.statuses}</p>}
            </fieldset>
            <p className="field__help">
              今の設定で削除の対象になる件数: <strong>{data.targets} 件</strong>
              {data.last_run && `（前回の実行: ${formatDateTime(data.last_run.at)}・${data.last_run.deleted} 件削除）`}
            </p>
            <Notice kind="success">{save.message || runner.message}</Notice>
            <Notice kind="error">{save.error || runner.error}</Notice>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--small" onClick={runNow} disabled={runner.busy}>
                <MdDeleteSweep aria-hidden="true" />
                今すぐ削除を実行
              </button>
              <button type="submit" className="btn btn--primary btn--small" disabled={save.busy}>
                {save.busy ? '保存中…' : '保存する'}
              </button>
            </div>
          </form>
        )}
      </Card>
    </>
  )
}
