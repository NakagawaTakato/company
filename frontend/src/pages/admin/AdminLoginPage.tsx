import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ApiError, api } from '../../api/client'
import { usePageTitle } from '../../lib/usePageTitle'
import { AdminHeader } from './AdminLayout'

export function AdminLoginPage() {
  usePageTitle('管理者ログイン')
  const navigate = useNavigate()
  const location = useLocation()
  const expired = (location.state as { expired?: boolean } | null)?.expired
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(expired ? 'ログインの有効期限が切れました。もう一度ログインしてください。' : '')
  const [submitting, setSubmitting] = useState(false)

  // すでにログインしている場合は一覧へ
  useEffect(() => {
    api
      .me()
      .then(() => navigate('/admin', { replace: true }))
      .catch(() => undefined)
  }, [navigate])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await api.login(email, password)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ログインに失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="admin">
      <AdminHeader narrow />
      <main className="admin-login">
        <h1 className="admin-login__title">管理者ログイン</h1>
        <form className="form-card admin-login__card" onSubmit={handleSubmit} noValidate>
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
          <div className="field">
            <label className="field__label" htmlFor="admin-email">
              メールアドレス
            </label>
            <input
              id="admin-email"
              className="input"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="admin-password">
              パスワード
            </label>
            <input
              id="admin-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      </main>
    </div>
  )
}
