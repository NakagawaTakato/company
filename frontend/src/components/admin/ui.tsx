// 管理画面の各ページで共通して使う部品です。
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MdChevronLeft, MdChevronRight } from 'react-icons/md'
import { useAdmin } from '../../pages/admin/AdminLayout'

export function PageHeader({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="admin-page-header">
      <div>
        <h1 className="admin-title">{title}</h1>
        {lead && <p className="admin-lead">{lead}</p>}
      </div>
      {actions && <div className="admin-page-header__actions">{actions}</div>}
    </div>
  )
}

export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`admin-card admin-panel ${className}`}>
      {(title || actions) && (
        <div className="admin-panel__head">
          {title && <h2 className="admin-panel__title">{title}</h2>}
          {actions && <div className="admin-panel__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'success' | 'error' | 'warning'; children: ReactNode }) {
  if (!children) return null
  return (
    <p className={`notice notice--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  )
}

export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav className="pagination" aria-label="ページ送り">
      <button type="button" className="btn btn--ghost btn--small" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <MdChevronLeft aria-hidden="true" />
        前へ
      </button>
      <span className="pagination__status">
        {page} / {pages} ページ
      </span>
      <button type="button" className="btn btn--ghost btn--small" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        次へ
        <MdChevronRight aria-hidden="true" />
      </button>
    </nav>
  )
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className = '',
}: {
  label: ReactNode
  htmlFor?: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`field admin-field${error ? ' field--error' : ''} ${className}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required && <span className="badge-req">必須</span>}
      </label>
      {children}
      {hint && <p className="field__help">{hint}</p>}
      {error && <p className="field__error">{error}</p>}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`tab${value === tab.value ? ' tab--active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function Pill({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`status status--${tone}`}>{children}</span>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>
}

/** API からデータを読み込みます（ログイン切れはログイン画面へ移動）。 */
export function useLoader<T>(load: () => Promise<T>, deps: unknown[]) {
  const { handleApiError } = useAdmin()
  const [data, setData] = useState<T>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    let active = true
    setLoading(true)
    loadRef
      .current()
      .then((result) => {
        if (!active) return
        setData(result)
        setError('')
      })
      .catch((err) => active && setError(handleApiError(err)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, handleApiError])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, setData, error, setError, loading, reload }
}

/** 保存ボタンなどの「処理中・結果メッセージ・入力エラー」をまとめて扱います。 */
export function useAction() {
  const { handleApiError } = useAdmin()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const run = useCallback(
    async <R,>(action: () => Promise<R>, success?: string): Promise<R | undefined> => {
      setBusy(true)
      setMessage('')
      setError('')
      setFieldErrors({})
      try {
        const result = await action()
        if (success) setMessage(success)
        return result
      } catch (err) {
        setError(handleApiError(err))
        const errors = (err as { errors?: Record<string, string> }).errors
        if (errors) setFieldErrors(errors)
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [handleApiError],
  )

  return { busy, message, error, fieldErrors, run, setMessage, setError }
}
