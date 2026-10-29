import { useCallback, useEffect, useState } from 'react'
import type { IconType } from 'react-icons'
import {
  MdArticle,
  MdBlock,
  MdBuild,
  MdDashboard,
  MdHistory,
  MdInbox,
  MdLogout,
  MdMail,
  MdManageAccounts,
  MdOpenInNew,
  MdPalette,
  MdPayments,
  MdRequestQuote,
  MdStorage,
} from 'react-icons/md'
import { NavLink, Outlet, useNavigate, useOutletContext } from 'react-router'
import { ApiError, api } from '../../api/client'
import { Logo } from '../../components/Logo'
import { DEFAULT_PRIMARY } from '../../lib/site'
import { applyBrowserColor } from '../../lib/theme'

const NAV: { to: string; label: string; icon: IconType; end?: boolean }[] = [
  { to: '/admin', label: 'ダッシュボード', icon: MdDashboard, end: true },
  { to: '/admin/inquiries', label: 'お問い合わせ', icon: MdInbox },
  { to: '/admin/estimates', label: '見積書', icon: MdRequestQuote },
  { to: '/admin/payments', label: '入金・領収書', icon: MdPayments },
  { to: '/admin/contracts', label: '保守契約', icon: MdBuild },
  { to: '/admin/content', label: 'サイト内容', icon: MdArticle },
  { to: '/admin/theme', label: 'デザイン（色）', icon: MdPalette },
  { to: '/admin/mail', label: 'メール', icon: MdMail },
  { to: '/admin/spam', label: '迷惑送信', icon: MdBlock },
  { to: '/admin/logs', label: '履歴', icon: MdHistory },
  { to: '/admin/data', label: 'データ管理', icon: MdStorage },
  { to: '/admin/account', label: 'アカウント', icon: MdManageAccounts },
]

export function AdminHeader({ email, onLogout, narrow }: { email?: string; onLogout?: () => void; narrow?: boolean }) {
  return (
    <header className="admin-header">
      <div className={narrow ? 'admin-container admin-container--narrow' : 'admin-container admin-container--wide'}>
        <Logo subtitle="管理画面" to={email ? '/admin' : '/admin/login'} />
        {email && (
          <div className="admin-header__user">
            <a className="admin-header__site" href="/" target="_blank" rel="noopener noreferrer">
              <MdOpenInNew aria-hidden="true" />
              サイトを見る
            </a>
            <span className="admin-header__email">{email}</span>
            <button type="button" className="btn btn--ghost btn--small" onClick={onLogout}>
              <MdLogout aria-hidden="true" />
              ログアウト
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

type AdminContext = { handleApiError: (error: unknown) => string; email: string }

/** 管理画面の各ページから使う共通の処理（未ログインならログイン画面へ）。 */
export function useAdmin() {
  return useOutletContext<AdminContext>()
}

export function AdminLayout() {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string>()
  const [loadError, setLoadError] = useState('')

  // 管理画面はテーマ色を変えず、青のままにします
  useEffect(() => applyBrowserColor(DEFAULT_PRIMARY), [])

  const toLogin = useCallback(
    (expired: boolean) => navigate('/admin/login', { replace: true, state: { expired } }),
    [navigate],
  )

  useEffect(() => {
    api
      .me()
      .then((me) => setEmail(me.email))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) toLogin(false)
        else setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      })
  }, [toLogin])

  const handleApiError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        toLogin(true)
        return ''
      }
      return error instanceof Error ? error.message : 'エラーが発生しました。'
    },
    [toLogin],
  )

  const logout = async () => {
    await api.logout().catch(() => undefined)
    toLogin(false)
  }

  return (
    <div className="admin">
      <AdminHeader email={email} onLogout={logout} />
      <div className="admin-container admin-container--wide admin-body">
        <nav className="admin-nav" aria-label="管理画面のメニュー">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className="admin-nav__link">
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
        <main className="admin-main">
          {loadError && (
            <p className="form-alert" role="alert">
              {loadError}
            </p>
          )}
          {email && <Outlet context={{ handleApiError, email } satisfies AdminContext} />}
        </main>
      </div>
    </div>
  )
}
