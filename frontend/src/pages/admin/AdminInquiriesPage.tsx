import { useEffect, useState, type FormEvent } from 'react'
import { MdDownload, MdSearch } from 'react-icons/md'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api, type InquiryFilter } from '../../api/client'
import { Empty, Notice, PageHeader, Pagination, useAction, useLoader } from '../../components/admin/ui'
import { formatDateTime } from '../../lib/format'
import { SORTS, STATUSES } from '../../lib/options'
import { usePageTitle } from '../../lib/usePageTitle'
import { StatusBadge } from './StatusBadge'

const TABS = [{ value: '', label: 'すべて' }, ...STATUSES, { value: 'spam', label: '迷惑送信' }]

export function AdminInquiriesPage() {
  usePageTitle('お問い合わせ一覧')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const spam = params.get('spam') === '1'
  const filter: InquiryFilter = {
    status: spam ? undefined : params.get('status') ?? undefined,
    q: params.get('q') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    sort: params.get('sort') ?? undefined,
    spam,
    page: Number(params.get('page') ?? 1) || 1,
  }
  const filterKey = params.toString()
  const { data, error } = useLoader(() => api.listInquiries(filter), [filterKey])
  const csv = useAction()

  const [keyword, setKeyword] = useState(filter.q ?? '')
  const [from, setFrom] = useState(filter.from ?? '')
  const [to, setTo] = useState(filter.to ?? '')
  useEffect(() => {
    setKeyword(params.get('q') ?? '')
    setFrom(params.get('from') ?? '')
    setTo(params.get('to') ?? '')
  }, [params])

  const update = (changes: Record<string, string | undefined>, keepPage = false) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!keepPage) next.delete('page')
    setParams(next)
  }

  const selectTab = (value: string) => {
    if (value === 'spam') update({ spam: '1', status: undefined })
    else update({ spam: undefined, status: value || undefined })
  }

  const handleSearch = (event: FormEvent) => {
    event.preventDefault()
    update({ q: keyword.trim() || undefined, from: from || undefined, to: to || undefined })
  }

  const activeTab = spam ? 'spam' : filter.status ?? ''
  const hasFilter = Boolean(filter.q || filter.from || filter.to)
  const items = data?.items ?? []

  return (
    <>
      <PageHeader
        title="お問い合わせ一覧"
        actions={
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={() => csv.run(() => api.downloadCsv(filter))}
            disabled={csv.busy}
          >
            <MdDownload aria-hidden="true" />
            {csv.busy ? '作成中…' : 'CSVダウンロード'}
          </button>
        }
      />

      <div className="tabs admin-tabs" role="tablist" aria-label="対応状況で絞り込み">
        {TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            className={`tab${activeTab === tab.value ? ' tab--active' : ''}${tab.value === 'spam' ? ' tab--muted' : ''}`}
            onClick={() => selectTab(tab.value)}
          >
            {tab.label}
            <span className="tab__count">{data?.counts[tab.value || 'all'] ?? 0}</span>
          </button>
        ))}
      </div>

      <form className="filter-bar" onSubmit={handleSearch} role="search">
        <input
          className="input input--small filter-bar__keyword"
          type="search"
          placeholder="お名前・メール・電話番号"
          aria-label="お名前・メール・電話番号で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <label className="filter-bar__date">
          <span>受付日</span>
          <input className="input input--small" type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="受付日（から）" />
          <span>〜</span>
          <input className="input input--small" type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="受付日（まで）" />
        </label>
        <button type="submit" className="btn btn--primary btn--small">
          <MdSearch aria-hidden="true" />
          検索
        </button>
        {hasFilter && (
          <button type="button" className="btn btn--ghost btn--small" onClick={() => update({ q: undefined, from: undefined, to: undefined })}>
            条件をクリア
          </button>
        )}
        <label className="filter-bar__sort">
          <span>並び順</span>
          <select className="input input--small select" value={filter.sort ?? 'newest'} onChange={(e) => update({ sort: e.target.value === 'newest' ? undefined : e.target.value }, true)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </form>

      <Notice kind="error">{error || csv.error}</Notice>

      <div className="admin-card">
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : items.length === 0 ? (
          <Empty>{hasFilter || activeTab ? '条件に合うお問い合わせはありません。' : 'お問い合わせはまだありません。'}</Empty>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">受付日時</th>
                <th scope="col">お名前</th>
                <th scope="col">メールアドレス</th>
                <th scope="col">電話番号</th>
                <th scope="col">お住まい</th>
                <th scope="col">対応状況</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => navigate(`/admin/inquiries/${item.id}`)}>
                  <td data-label="受付日時">{formatDateTime(item.created_at)}</td>
                  <td data-label="お名前">
                    <Link to={`/admin/inquiries/${item.id}`} onClick={(e) => e.stopPropagation()}>
                      {item.name}
                    </Link>
                  </td>
                  <td data-label="メールアドレス">{item.email}</td>
                  <td data-label="電話番号">{item.phone}</td>
                  <td data-label="お住まい">{item.prefecture}</td>
                  <td data-label="対応状況">
                    <StatusBadge status={item.status} />
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
          <Pagination page={data.page} pages={data.pages} onChange={(page) => update({ page: String(page) }, true)} />
        </div>
      )}
    </>
  )
}
