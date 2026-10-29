import { useEffect, useState, type ReactNode } from 'react'
import { MdAdd, MdArrowDownward, MdArrowUpward, MdDelete, MdOpenInNew, MdRestartAlt, MdUpload } from 'react-icons/md'
import { useSearchParams } from 'react-router'
import { api, assetUrl, type ContentResponse } from '../../api/client'
import { Card, Empty, Field, Notice, PageHeader, Tabs, useAction, useLoader } from '../../components/admin/ui'
import type { Business, FaqItem, Prices, SiteContent, Testimonial, WorkItem } from '../../lib/site'
import { useSite } from '../../lib/SiteContext'
import { usePageTitle } from '../../lib/usePageTitle'

type Section = keyof SiteContent

const SECTIONS: { value: Section; label: string; anchor: string }[] = [
  { value: 'business', label: '事業者情報', anchor: '/tokushoho' },
  { value: 'prices', label: '料金の目安', anchor: '/#price' },
  { value: 'faq', label: 'よくある質問', anchor: '/#faq' },
  { value: 'works', label: '制作実績', anchor: '/#works' },
  { value: 'other_works', label: 'そのほかの制作物', anchor: '/#works' },
  { value: 'testimonials', label: 'お客さまの声', anchor: '/#works' },
]

/** 並べ替え・削除・追加ができるリストの入力欄 */
function ListEditor<T>({
  items,
  onChange,
  create,
  render,
  addLabel,
  max,
}: {
  items: T[]
  onChange: (items: T[]) => void
  create: () => T
  render: (item: T, index: number, update: (changes: Partial<T>) => void) => ReactNode
  addLabel: string
  max: number
}) {
  const move = (index: number, delta: number) => {
    const next = [...items]
    const [moved] = next.splice(index, 1)
    next.splice(index + delta, 0, moved)
    onChange(next)
  }
  return (
    <>
      <ol className="list-editor">
        {items.map((item, index) => (
          <li key={index} className="list-editor__item">
            <div className="list-editor__body">
              {render(item, index, (changes) => onChange(items.map((x, i) => (i === index ? { ...x, ...changes } : x))))}
            </div>
            <div className="list-editor__ops">
              <span className="list-editor__no">{index + 1}</span>
              <button type="button" className="icon-button" aria-label={`${index + 1}件目を上へ`} disabled={index === 0} onClick={() => move(index, -1)}>
                <MdArrowUpward />
              </button>
              <button type="button" className="icon-button" aria-label={`${index + 1}件目を下へ`} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <MdArrowDownward />
              </button>
              <button type="button" className="icon-button" aria-label={`${index + 1}件目を削除`} onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <MdDelete />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn--ghost btn--small" onClick={() => onChange([...items, create()])} disabled={items.length >= max}>
        <MdAdd aria-hidden="true" />
        {addLabel}
      </button>
    </>
  )
}

export function AdminContentPage() {
  usePageTitle('サイト内容')
  const site = useSite()
  const [params, setParams] = useSearchParams()
  const section = (SECTIONS.find((s) => s.value === params.get('tab'))?.value ?? 'business') as Section
  const { data, setData, error } = useLoader(() => api.content(), [])
  const action = useAction()
  const [draft, setDraft] = useState<SiteContent>()

  useEffect(() => {
    if (data) setDraft(data.content)
  }, [data])

  if (!data || !draft) return error ? <Notice kind="error">{error}</Notice> : <Empty>読み込み中…</Empty>

  const changeTab = (value: Section) => {
    setParams({ tab: value })
    action.setMessage('')
    action.setError('')
  }

  const after = (result: ContentResponse | undefined) => {
    if (result) {
      setData(result)
      site.reload() // 公開サイトの表示（この画面の中の情報）も更新します
    }
  }

  const savers: Record<Section, () => Promise<ContentResponse>> = {
    business: () => api.saveBusiness(draft.business),
    prices: () => api.savePrices(draft.prices),
    faq: () => api.saveFaq(draft.faq),
    works: () => api.saveWorks(draft.works),
    other_works: () => api.saveOtherWorks(draft.other_works),
    testimonials: () => api.saveTestimonials(draft.testimonials),
  }

  const save = async () => after(await action.run(savers[section], '保存しました。公開サイトに反映されています。'))

  const reset = async () => {
    if (!window.confirm('この項目を初期値に戻します。よろしいですか？')) return
    after(await action.run(() => api.resetContent(section), '初期値に戻しました。'))
  }

  const set = <K extends Section>(key: K, value: SiteContent[K]) => setDraft({ ...draft, [key]: value })
  const err = (path: string) => action.fieldErrors[path]
  const current = SECTIONS.find((s) => s.value === section)!

  return (
    <>
      <PageHeader
        title="サイト内容"
        lead="公開サイトの文章や情報を変更できます。保存するとすぐに反映されます。"
        actions={
          <a href={current.anchor} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--small">
            <MdOpenInNew aria-hidden="true" />
            公開サイトで確認
          </a>
        }
      />
      <Tabs tabs={SECTIONS} value={section} onChange={changeTab} label="編集する項目" />

      <Card
        title={current.label}
        actions={
          data.customized[section] && (
            <button type="button" className="btn btn--ghost btn--small" onClick={reset} disabled={action.busy}>
              <MdRestartAlt aria-hidden="true" />
              初期値に戻す
            </button>
          )
        }
      >
        {section === 'business' && <BusinessForm value={draft.business} onChange={(v) => set('business', v)} err={err} />}
        {section === 'prices' && <PricesForm value={draft.prices} onChange={(v) => set('prices', v)} err={err} />}
        {section === 'faq' && (
          <ListEditor<FaqItem>
            items={draft.faq}
            onChange={(v) => set('faq', v)}
            create={() => ({ q: '', a: '' })}
            addLabel="質問を追加"
            max={50}
            render={(item, i, update) => (
              <>
                <Field label="質問" error={err(`${i}.q`)}>
                  <input className="input" value={item.q} onChange={(e) => update({ q: e.target.value })} maxLength={200} aria-label={`${i + 1}件目の質問`} />
                </Field>
                <Field label="回答" error={err(`${i}.a`)}>
                  <textarea className="input textarea" rows={3} value={item.a} onChange={(e) => update({ a: e.target.value })} maxLength={2000} aria-label={`${i + 1}件目の回答`} />
                </Field>
              </>
            )}
          />
        )}
        {section === 'works' && <WorksForm value={draft.works} onChange={(v) => set('works', v)} err={err} />}
        {section === 'other_works' && (
          <ListEditor<string>
            items={draft.other_works}
            onChange={(v) => set('other_works', v)}
            create={() => ''}
            addLabel="制作物を追加"
            max={40}
            render={(item, i) => (
              <Field label="制作物" error={err(`${i}.value`)}>
                <input
                  className="input"
                  value={item}
                  onChange={(e) => set('other_works', draft.other_works.map((x, j) => (j === i ? e.target.value : x)))}
                  maxLength={60}
                  placeholder="例: 飲食店の予約システム(Laravel / PHP)"
                  aria-label={`${i + 1}件目の制作物`}
                />
              </Field>
            )}
          />
        )}
        {section === 'testimonials' && (
          <>
            <Notice kind="info">お客さまの声は、ご本人の許可をいただいたものだけを掲載してください。「公開する」にチェックを入れたものだけがサイトに表示されます（0件のときは「準備中」の案内が出ます）。</Notice>
            <ListEditor<Testimonial>
              items={draft.testimonials}
              onChange={(v) => set('testimonials', v)}
              create={() => ({ name: '', text: '', date: '', published: true })}
              addLabel="お客さまの声を追加"
              max={50}
              render={(item, i, update) => (
                <>
                  <div className="form-grid">
                    <Field label="お名前（表示名）" error={err(`${i}.name`)} hint="例: 飲食店経営 A 様">
                      <input className="input" value={item.name} onChange={(e) => update({ name: e.target.value })} maxLength={60} aria-label={`${i + 1}件目のお名前`} />
                    </Field>
                    <Field label="時期（任意）" error={err(`${i}.date`)} hint="例: 2026年10月">
                      <input className="input" value={item.date} onChange={(e) => update({ date: e.target.value })} maxLength={30} aria-label={`${i + 1}件目の時期`} />
                    </Field>
                  </div>
                  <Field label="いただいた声" error={err(`${i}.text`)}>
                    <textarea className="input textarea" rows={3} value={item.text} onChange={(e) => update({ text: e.target.value })} maxLength={1000} aria-label={`${i + 1}件目の内容`} />
                  </Field>
                  <label className="check">
                    <input type="checkbox" checked={item.published} onChange={(e) => update({ published: e.target.checked })} />
                    公開する
                  </label>
                </>
              )}
            />
          </>
        )}

        {err('body') && <p className="field__error">{err('body')}</p>}
        <Notice kind="success">{action.message}</Notice>
        <Notice kind="error">{action.error}</Notice>
        <div className="form-actions">
          <span className="field__help">{data.customized[section] ? '変更済み' : '初期値のまま'}</span>
          <button type="button" className="btn btn--primary" onClick={save} disabled={action.busy}>
            {action.busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </Card>
    </>
  )
}

function BusinessForm({ value, onChange, err }: { value: Business; onChange: (v: Business) => void; err: (p: string) => string | undefined }) {
  const fields: { key: keyof Business; label: string; hint?: string; max: number }[] = [
    { key: 'business_name', label: '屋号', max: 60 },
    { key: 'owner', label: '運営責任者', max: 40 },
    { key: 'address', label: '所在地', max: 100 },
    { key: 'phone', label: '電話番号', max: 30 },
    { key: 'email', label: 'メールアドレス', max: 254, hint: '新着通知の送り先（メール設定で別の宛先を指定しない場合）にも使います。' },
    { key: 'hours', label: '対応時間', max: 60 },
    { key: 'business_form', label: '事業形態', max: 120, hint: '例: 個人事業主(開業届 提出済み・2026年10月1日 開業)' },
    { key: 'line_url', label: 'LINE の友だち追加 URL', max: 300, hint: 'https:// で始まる URL。LINE ページの QR コードもこの URL から作られます。' },
  ]
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`business-${f.key}`} required error={err(f.key)} hint={f.hint}>
          <input id={`business-${f.key}`} className="input" value={value[f.key]} onChange={(e) => onChange({ ...value, [f.key]: e.target.value })} maxLength={f.max} />
        </Field>
      ))}
    </div>
  )
}

function PricesForm({ value, onChange, err }: { value: Prices; onChange: (v: Prices) => void; err: (p: string) => string | undefined }) {
  return (
    <>
      <h3 className="side-heading">料金表（制作内容と1ページの相場）</h3>
      <ListEditor
        items={value.rows}
        onChange={(rows) => onChange({ ...value, rows })}
        create={() => ({ name: '', price: '' })}
        addLabel="行を追加"
        max={30}
        render={(row, i, update) => (
          <div className="form-grid form-grid--wide-first">
            <Field label="制作内容" error={err(`rows.${i}.name`)}>
              <input className="input" value={row.name} onChange={(e) => update({ name: e.target.value })} maxLength={100} aria-label={`${i + 1}行目の制作内容`} />
            </Field>
            <Field label="相場" error={err(`rows.${i}.price`)}>
              <input className="input" value={row.price} onChange={(e) => update({ price: e.target.value })} maxLength={40} placeholder="例: 5〜15万円" aria-label={`${i + 1}行目の相場`} />
            </Field>
          </div>
        )}
      />
      <h3 className="side-heading">表の下の補足（1行ずつ）</h3>
      <Field label="補足" error={err('notes')} hint="1行につき1つの段落になります。空の行は無視されます。">
        <textarea className="input textarea" rows={4} value={value.notes.join('\n')} onChange={(e) => onChange({ ...value, notes: e.target.value.split('\n') })} />
      </Field>
    </>
  )
}

function WorksForm({ value, onChange, err }: { value: WorkItem[]; onChange: (v: WorkItem[]) => void; err: (p: string) => string | undefined }) {
  const upload = useAction()
  const uploadFor = async (index: number, file: File | undefined) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      upload.setError('画像は5MB以下にしてください。')
      return
    }
    const result = await upload.run(() => api.uploadImage(file), '画像をアップロードしました。「保存する」で反映されます。')
    if (result) onChange(value.map((w, i) => (i === index ? { ...w, image: result.url } : w)))
  }
  return (
    <>
      <Notice kind="success">{upload.message}</Notice>
      <Notice kind="error">{upload.error}</Notice>
      <ListEditor<WorkItem>
        items={value}
        onChange={onChange}
        create={() => ({ image: '', alt: '', badge: '', title: '', text: '' })}
        addLabel="制作実績を追加"
        max={20}
        render={(work, i, update) => (
          <div className="work-editor">
            <div className="work-editor__image">
              {work.image ? <img src={assetUrl(work.image)} alt="" /> : <span>画像なし</span>}
              <label className="btn btn--outline btn--small">
                <MdUpload aria-hidden="true" />
                {upload.busy ? 'アップロード中…' : '画像を選ぶ'}
                <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="visually-hidden" onChange={(e) => uploadFor(i, e.target.files?.[0])} />
              </label>
              {err(`${i}.image`) && <p className="field__error">{err(`${i}.image`)}</p>}
            </div>
            <div className="work-editor__fields">
              <div className="form-grid">
                <Field label="タイトル" error={err(`${i}.title`)}>
                  <input className="input" value={work.title} onChange={(e) => update({ title: e.target.value })} maxLength={60} aria-label={`${i + 1}件目のタイトル`} />
                </Field>
                <Field label="バッジ（任意）" error={err(`${i}.badge`)} hint="例: 金賞">
                  <input className="input" value={work.badge} onChange={(e) => update({ badge: e.target.value })} maxLength={20} aria-label={`${i + 1}件目のバッジ`} />
                </Field>
              </div>
              <Field label="説明" error={err(`${i}.text`)}>
                <textarea className="input textarea" rows={2} value={work.text} onChange={(e) => update({ text: e.target.value })} maxLength={300} aria-label={`${i + 1}件目の説明`} />
              </Field>
              <Field label="画像の説明（読み上げ用）" error={err(`${i}.alt`)}>
                <input className="input" value={work.alt} onChange={(e) => update({ alt: e.target.value })} maxLength={100} aria-label={`${i + 1}件目の画像の説明`} />
              </Field>
            </div>
          </div>
        )}
      />
    </>
  )
}
