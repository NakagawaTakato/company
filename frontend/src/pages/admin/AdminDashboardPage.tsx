import { MdArrowForward, MdWarning } from 'react-icons/md'
import { Link } from 'react-router'
import { api } from '../../api/client'
import { MonthlyChart } from '../../components/admin/MonthlyChart'
import { Card, Empty, Notice, PageHeader, useLoader } from '../../components/admin/ui'
import { formatDateTime, yen } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'

function Tile({ label, value, sub, to }: { label: string; value: string; sub?: string; to?: string }) {
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{value}</span>
      {sub && <span className="tile__sub">{sub}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="tile tile--link">
      {body}
    </Link>
  ) : (
    <div className="tile">{body}</div>
  )
}

export function AdminDashboardPage() {
  usePageTitle('ダッシュボード')
  const { data, error } = useLoader(() => api.dashboard(), [])

  if (!data) return error ? <Notice kind="error">{error}</Notice> : <Empty>読み込み中…</Empty>

  const diff = data.this_month - data.last_month
  const diffText = diff === 0 ? '先月と同じ' : `先月より ${diff > 0 ? '+' : ''}${diff} 件`

  return (
    <>
      <PageHeader
        title="ダッシュボード"
        lead={data.previous_login ? `前回のログイン: ${formatDateTime(data.previous_login.created_at)}（${data.previous_login.ip}）` : undefined}
      />

      {data.mail_problems > 0 && (
        <p className="notice notice--warning">
          <MdWarning aria-hidden="true" />
          直近30日で、送れていないメールが {data.mail_problems} 件あります。
          <Link to="/admin/mail">メールの設定と送信履歴を確認する</Link>
        </p>
      )}

      <div className="tiles">
        <Tile label="未対応のお問い合わせ" value={`${data.counts.new ?? 0} 件`} sub="一覧で確認する" to="/admin/inquiries?status=new" />
        <Tile label="今月のお問い合わせ" value={`${data.this_month} 件`} sub={diffText} />
        <Tile
          label="おまかせ管理プラン（契約中）"
          value={`${data.contracts_active} 件`}
          sub={`月額の合計 ${yen(data.monthly_revenue)}${data.contracts_ending ? `・解約予定 ${data.contracts_ending} 件` : ''}`}
          to="/admin/contracts"
        />
        <Tile label="今月の入金" value={yen(data.payments_this_month)} to="/admin/payments" />
        <Tile label="未入金（承諾済みの見積書）" value={yen(data.outstanding)} to="/admin/estimates?status=accepted" />
        <Tile label="作成中・送付済みの見積書" value={`${data.estimates_open} 件`} to="/admin/estimates" />
      </div>

      <Card title="月ごとのお問い合わせ件数（直近12か月）">
        <MonthlyChart data={data.monthly} />
      </Card>

      <Card
        title="未対応のお問い合わせ（新しい順）"
        actions={
          <Link to="/admin/inquiries?status=new" className="admin-link">
            すべて見る
            <MdArrowForward aria-hidden="true" />
          </Link>
        }
      >
        {data.recent_new.length === 0 ? (
          <Empty>未対応のお問い合わせはありません。</Empty>
        ) : (
          <ul className="recent-list">
            {data.recent_new.map((item) => (
              <li key={item.id}>
                <Link to={`/admin/inquiries/${item.id}`}>
                  <span className="recent-list__date">{formatDateTime(item.created_at)}</span>
                  <span className="recent-list__name">{item.name} 様</span>
                  <span className="recent-list__meta">{item.prefecture}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
