import { useState, type FormEvent } from 'react'
import { MdAdd, MdDownload, MdSearch } from 'react-icons/md'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { api } from '../../api/client'
import { Empty, Notice, PageHeader, Pagination, Pill, useAction, useLoader } from '../../components/admin/ui'
import { formatJpDate, yen } from '../../lib/format'
import { ESTIMATE_STATUSES, labelOf } from '../../lib/options'
import { usePageTitle } from '../../lib/usePageTitle'

export function AdminEstimatesPage() {
  usePageTitle('見積書')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const q = params.get('q') ?? ''
  const page = Number(params.get('page') ?? 1) || 1
  const { data, error } = useLoader(() => api.estimates({ status, q, page }), [status, q, page])
  const [keyword, setKeyword] = useState(q)
  const csv = useAction()

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next)
  }

  const search = (event: FormEvent) => {
    event.preventDefault()
    update({ q: keyword.trim() })
  }

  return (
    <>
      <PageHeader
        title="見積書"
        lead="作成した見積書は、印刷画面からそのまま印刷・PDFで保存できます。"
        actions={
          <>
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={() => csv.run(() => api.downloadEstimatesCsv({ status, q }))}
              disabled={csv.busy}
            >
              <MdDownload aria-hidden="true" />
              {csv.busy ? '作成中…' : 'CSVダウンロード'}
            </button>
            <Link to="/admin/estimates/new" className="btn btn--primary btn--small">
              <MdAdd aria-hidden="true" />
              見積書を作成
            </Link>
          </>
        }
      />
      <div className="tabs admin-tabs" role="tablist" aria-label="状態で絞り込み">
        {[{ value: '', label: 'すべて' }, ...ESTIMATE_STATUSES].map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            className={`tab${status === tab.value ? ' tab--active' : ''}`}
            onClick={() => update({ status: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <form className="filter-bar" onSubmit={search} role="search">
        <input
          className="input input--small filter-bar__keyword"
          type="search"
          placeholder="お客さま名・件名・見積番号"
          aria-label="お客さま名・件名・見積番号で検索"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--small">
          <MdSearch aria-hidden="true" />
          検索
        </button>
      </form>
      <Notice kind="error">{error || csv.error}</Notice>

      <div className="admin-card">
        {!data ? (
          <Empty>読み込み中…</Empty>
        ) : data.items.length === 0 ? (
          <Empty>見積書はまだありません。</Empty>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">見積番号</th>
                <th scope="col">発行日</th>
                <th scope="col">お客さま</th>
                <th scope="col">件名</th>
                <th scope="col" className="num">合計（税込）</th>
                <th scope="col" className="num">残額</th>
                <th scope="col">状態</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} onClick={() => navigate(`/admin/estimates/${e.id}`)}>
                  <td data-label="見積番号">
                    <Link to={`/admin/estimates/${e.id}`} onClick={(ev) => ev.stopPropagation()}>
                      {e.number}
                    </Link>
                  </td>
                  <td data-label="発行日">{formatJpDate(e.issue_date)}</td>
                  <td data-label="お客さま">{e.customer_name} 様</td>
                  <td data-label="件名">{e.title}</td>
                  <td data-label="合計（税込）" className="num">{yen(e.total)}</td>
                  <td data-label="残額" className="num">{e.status === 'accepted' ? yen(e.balance) : '―'}</td>
                  <td data-label="状態">
                    <Pill tone={e.status}>{labelOf(ESTIMATE_STATUSES, e.status)}</Pill>
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
          <Pagination page={data.page} pages={data.pages} onChange={(p) => update({ page: String(p) })} />
        </div>
      )}
    </>
  )
}
