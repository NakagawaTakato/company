import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../../api/client'
import { Empty, Notice, PageHeader, Pagination, Pill, Tabs, useLoader } from '../../components/admin/ui'
import { formatDateTime } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'

type Tab = 'audit' | 'login'

export function AdminLogsPage() {
  usePageTitle('履歴')
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'login' ? 'login' : 'audit'
  return (
    <>
      <PageHeader title="履歴" lead="管理画面での操作と、ログインの記録です。身に覚えのないログインがないか、ときどき確認してください。" />
      <Tabs
        tabs={[
          { value: 'audit', label: '操作の記録' },
          { value: 'login', label: 'ログイン履歴' },
        ]}
        value={tab}
        onChange={(value) => setParams({ tab: value })}
        label="履歴の種類"
      />
      {tab === 'audit' ? <AuditTable /> : <LoginTable />}
    </>
  )
}

function AuditTable() {
  const [page, setPage] = useState(1)
  const { data, error } = useLoader(() => api.auditLogs(page), [page])
  return (
    <>
      <Notice kind="error">{error}</Notice>
      <div className="admin-card">
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : data.items.length === 0 ? (
          <Empty>まだ記録はありません。</Empty>
        ) : (
          <table className="admin-table admin-table--static">
            <thead>
              <tr>
                <th scope="col">日時</th>
                <th scope="col">操作</th>
                <th scope="col">内容</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td data-label="日時">{formatDateTime(r.created_at)}</td>
                  <td data-label="操作">{r.action}</td>
                  <td data-label="内容">{r.detail || '―'}</td>
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

function LoginTable() {
  const [page, setPage] = useState(1)
  const { data, error } = useLoader(() => api.loginHistory(page), [page])
  return (
    <>
      <Notice kind="error">{error}</Notice>
      <div className="admin-card">
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : data.items.length === 0 ? (
          <Empty>まだ記録はありません。</Empty>
        ) : (
          <table className="admin-table admin-table--static">
            <thead>
              <tr>
                <th scope="col">日時</th>
                <th scope="col">結果</th>
                <th scope="col">メールアドレス</th>
                <th scope="col">接続元（IP）</th>
                <th scope="col">ブラウザ</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td data-label="日時">{formatDateTime(r.created_at)}</td>
                  <td data-label="結果">{r.success ? <Pill tone="success">成功</Pill> : <Pill tone="danger">失敗</Pill>}</td>
                  <td data-label="メールアドレス">{r.email}</td>
                  <td data-label="接続元（IP）">{r.ip}</td>
                  <td data-label="ブラウザ" className="cell-ua">{r.user_agent}</td>
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
