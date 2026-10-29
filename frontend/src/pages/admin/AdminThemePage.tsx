import { useEffect, useState } from 'react'
import { MdCheck, MdOpenInNew, MdRestartAlt } from 'react-icons/md'
import { api } from '../../api/client'
import { Card, Empty, Notice, PageHeader, useAction, useLoader } from '../../components/admin/ui'
import { LogoMark } from '../../components/Logo'
import { useSite } from '../../lib/SiteContext'
import { BRAND } from '../../lib/site'
import { MIN_CONTRAST, THEME_PRESETS, contrastWithWhite, darkenUntilReadable, isHexColor, themeVars } from '../../lib/theme'
import { usePageTitle } from '../../lib/usePageTitle'

export function AdminThemePage() {
  usePageTitle('デザイン（色）')
  const site = useSite()
  const { data, setData, error } = useLoader(() => api.theme(), [])
  const action = useAction()
  const [color, setColor] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    if (data) {
      setColor(data.primary_color)
      setText(data.primary_color)
    }
  }, [data])

  if (!data || !color) return error ? <Notice kind="error">{error}</Notice> : <Empty>読み込み中…</Empty>

  const choose = (value: string) => {
    setText(value)
    if (isHexColor(value)) setColor(value.toLowerCase())
  }

  const contrast = contrastWithWhite(color)
  const readable = contrast >= MIN_CONTRAST
  const changed = color !== data.primary_color

  const save = async (value = color) => {
    const result = await action.run(() => api.saveTheme(value), '保存しました。公開サイトに反映されています。')
    if (result) {
      setData(result)
      setColor(result.primary_color)
      setText(result.primary_color)
      site.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="デザイン（色）"
        lead="公開サイトの青い部分（ボタン・見出し・帯・カードの線・ロゴなど）の色を変えられます。管理画面の色は変わりません。"
        actions={
          <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--small">
            <MdOpenInNew aria-hidden="true" />
            公開サイトで確認
          </a>
        }
      />

      <div className="theme-layout">
        <Card title="色を選ぶ">
          <div className="swatches" role="radiogroup" aria-label="おすすめの色">
            {THEME_PRESETS.map((preset) => {
              const selected = preset.color.toLowerCase() === color
              return (
                <button
                  key={preset.color}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`swatch${selected ? ' swatch--selected' : ''}`}
                  onClick={() => choose(preset.color)}
                >
                  <span className="swatch__chip" style={{ background: preset.color }}>
                    {selected && <MdCheck aria-hidden="true" />}
                  </span>
                  <span className="swatch__name">{preset.name}</span>
                </button>
              )
            })}
          </div>

          <div className="color-input">
            <label className="color-input__picker">
              <span>好きな色を選ぶ</span>
              <input type="color" value={color} onChange={(e) => choose(e.target.value)} aria-label="色を選ぶ" />
            </label>
            <label className="color-input__text">
              <span>カラーコード</span>
              <input className="input input--small" value={text} onChange={(e) => choose(e.target.value.trim())} maxLength={7} placeholder="#1558c0" aria-label="カラーコード" />
            </label>
          </div>
          {!isHexColor(text) && <p className="field__error">#1558c0 のような形式で入力してください。</p>}

          <p className={`contrast ${readable ? 'contrast--ok' : 'contrast--ng'}`}>
            白い文字との見やすさ: <strong>{contrast.toFixed(1)}</strong> : 1（{MIN_CONTRAST} 以上が目安）
            {readable ? ' — 読みやすい色です。' : ' — 明るすぎて、ボタンの白い文字が読みにくくなります。'}
          </p>
          {!readable && (
            <button type="button" className="btn btn--outline btn--small" onClick={() => choose(darkenUntilReadable(color))}>
              読みやすい濃さに調整
            </button>
          )}

          <Notice kind="success">{action.message}</Notice>
          <Notice kind="error">{action.fieldErrors.primary_color || action.error}</Notice>
          <div className="form-actions">
            {data.primary_color !== data.default_color ? (
              <button type="button" className="btn btn--ghost btn--small" onClick={() => save(data.default_color)} disabled={action.busy}>
                <MdRestartAlt aria-hidden="true" />
                初期の青に戻す
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="btn btn--primary" onClick={() => save()} disabled={action.busy || !changed || !readable}>
              {action.busy ? '保存中…' : 'この色で保存'}
            </button>
          </div>
        </Card>

        <Card title="見本（公開サイトでの見え方）">
          <div className="public-theme theme-preview" style={themeVars(color)}>
            <div className="theme-preview__brand">
              <LogoMark size={36} />
              <span className="logo__brand">{BRAND.brand}</span>
            </div>
            <p className="hero__eyebrow">WEBSITE PRODUCTION</p>
            <p className="theme-preview__title">
              公開まで、<span className="text-primary">私ひとりが</span>担当します。
            </p>
            <div className="theme-preview__buttons">
              <span className="btn btn--primary btn--small">無料でご相談する</span>
              <span className="btn btn--outline btn--small">経歴を見る</span>
            </div>
            <div className="theme-preview__row">
              <span className="badge" style={{ background: 'var(--c-accent-2)' }}>金賞</span>
              <span className="badge" style={{ background: 'var(--c-accent-5)' }}>カプコン賞</span>
              <span className="chip">React</span>
              <span className="pill">対応時間</span>
            </div>
            <div className="theme-preview__band">
              <p className="theme-preview__band-eyebrow">STRENGTH</p>
              <div className="theme-preview__band-card">ひとりで対応するから、できること</div>
            </div>
            <div className="theme-preview__cards">
              {['var(--c-accent-1)', 'var(--c-accent-2)', 'var(--c-accent-4)', 'var(--c-accent-5)'].map((accent) => (
                <span key={accent} className="theme-preview__card" style={{ borderTopColor: accent }}>
                  <span className="theme-preview__num" style={{ color: accent }}>4</span>
                  年間
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </>
  )
}
