// ログインの期限を見張ります。期限の5分前に予告を出し、期限が来たらボタンを押さなくてもログイン画面へ移します。
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../../api/client'

const WARNING_SECONDS = 5 * 60

export function SessionExpiry() {
  const navigate = useNavigate()
  const [expiresAt, setExpiresAt] = useState<number>()
  const [secondsLeft, setSecondsLeft] = useState<number>()

  useEffect(() => {
    let active = true
    api
      .me()
      // サーバーの期限を確実に過ぎてから移るよう、1秒足します
      .then((me) => active && setExpiresAt(Date.now() + (me.expires_in + 1) * 1000))
      .catch(() => undefined) // 未ログインのときの移動は、それぞれの画面が行います
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (expiresAt === undefined) return
    const check = () => {
      const left = Math.ceil((expiresAt - Date.now()) / 1000)
      if (left <= 0) navigate('/admin/login', { replace: true, state: { expired: true } })
      else setSecondsLeft(left)
    }
    check()
    // スリープ中やタブが裏にある間は遅れるので、画面に戻ったときにもすぐ確かめます
    const timer = window.setInterval(check, 1000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [expiresAt, navigate])

  if (secondsLeft === undefined || secondsLeft > WARNING_SECONDS) return null
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = String(secondsLeft % 60).padStart(2, '0')
  return (
    <div className="session-warning no-print" role="alert">
      <span>まもなく自動でログアウトします。入力中の内容は保存してください。</span>
      <strong aria-hidden="true">
        残り {minutes}:{seconds}
      </strong>
    </div>
  )
}
