import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { PrivacyPolicy } from '../components/PrivacyPolicy'
import { SubPageLayout } from '../components/SubPageLayout'
import { ApiError, api } from '../api/client'
import { INITIAL_PAYMENTS, MONTHLY_PAYMENTS, PREFECTURES, TOPICS } from '../lib/options'
import { usePageTitle } from '../lib/usePageTitle'

type FormState = {
  topics: string[]
  name: string
  email: string
  phone: string
  prefecture: string
  age: string
  initial_payment: string
  monthly_payment: string
  website: string
}

type Errors = Partial<Record<keyof FormState | 'agreed', string>>

const INITIAL_FORM: FormState = {
  topics: [],
  name: '',
  email: '',
  phone: '',
  prefecture: '',
  age: '',
  initial_payment: '',
  monthly_payment: '',
  website: '',
}

// エラー時にカーソルを移す順番と、その入力欄の id
const FIELD_ORDER: [keyof Errors, string][] = [
  ['topics', 'topics-0'],
  ['name', 'name'],
  ['email', 'email'],
  ['phone', 'phone'],
  ['prefecture', 'prefecture'],
  ['age', 'age'],
  ['initial_payment', 'initial_payment-0'],
  ['monthly_payment', 'monthly_payment-0'],
  ['agreed', 'agreed'],
]

function toHalfwidth(value: string): string {
  return value.replace(/[！-～　]/g, (ch) =>
    ch === '　' ? ' ' : String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
}

// バックエンドと同じルールで先にチェックします（最終的なチェックはバックエンドで行います）
function validate(form: FormState, agreed: boolean): Errors {
  const errors: Errors = {}
  if (form.topics.length === 0) errors.topics = 'ご相談内容を選択してください。'

  const name = form.name.trim()
  if (!name) errors.name = 'お名前を入力してください。'
  else if (name.length > 100) errors.name = 'お名前は100文字以内で入力してください。'

  const email = toHalfwidth(form.email).trim()
  if (!email) errors.email = 'メールアドレスを入力してください。'
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'メールアドレスの形式が正しくありません。'

  const phone = toHalfwidth(form.phone.trim()).replace(/[\s\-‐-―−ーｰ()]/g, '')
  if (!form.phone.trim()) errors.phone = '電話番号を入力してください。'
  else if (!/^0\d{9,10}$/.test(phone)) errors.phone = '電話番号の形式が正しくありません（例:09012345678）。'

  if (!form.prefecture) errors.prefecture = 'お住まいを選択してください。'

  const age = toHalfwidth(form.age).trim()
  if (age) {
    if (!/^\d+$/.test(age)) errors.age = 'ご年齢は数字で入力してください。'
    else if (Number(age) < 1 || Number(age) > 120) errors.age = 'ご年齢は1〜120の範囲で入力してください。'
  }

  if (!form.initial_payment) errors.initial_payment = '初期費用のお支払い方法を選択してください。'
  if (!form.monthly_payment) errors.monthly_payment = '月額(おまかせ管理プラン)のお支払い方法を選択してください。'
  if (!agreed) errors.agreed = '「個人情報の取扱い」への同意が必要です。'
  return errors
}

function Badge({ required }: { required?: boolean }) {
  return required ? <span className="badge-req">必須</span> : <span className="badge-opt">任意</span>
}

type FieldProps = {
  id: string
  label: ReactNode
  required?: boolean
  error?: string
  help?: ReactNode
  /** ラジオボタン・チェックボックスのまとまりは fieldset で囲みます */
  group?: boolean
  children: ReactNode
}

function Field({ id, label, required, error, help, group, children }: FieldProps) {
  const heading = (
    <>
      {label}
      <Badge required={required} />
    </>
  )
  const body = (
    <>
      {children}
      {help && (
        <p className="field__help" id={`${id}-help`}>
          {help}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </>
  )
  if (group) {
    return (
      <fieldset className={`field${error ? ' field--error' : ''}`} aria-describedby={error ? `${id}-error` : undefined}>
        <legend className="field__label">{heading}</legend>
        {body}
      </fieldset>
    )
  }
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {heading}
      </label>
      {body}
    </div>
  )
}

export function ContactPage() {
  usePageTitle('お問い合わせフォーム')
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<Errors>({})
  const [agreed, setAgreed] = useState(false)
  const [canAgree, setCanAgree] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const policyRef = useRef<HTMLDivElement>(null)

  // 枠内を最後までスクロールしたら「同意する」を押せるようにします
  const checkPolicyScrolled = () => {
    const box = policyRef.current
    if (box && box.scrollTop + box.clientHeight >= box.scrollHeight - 8) setCanAgree(true)
  }
  useEffect(checkPolicyScrolled, [])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const toggleTopic = (value: string, checked: boolean) => {
    update('topics', checked ? [...form.topics, value] : form.topics.filter((t) => t !== value))
  }

  const focusFirstError = (found: Errors) => {
    const first = FIELD_ORDER.find(([key]) => found[key])
    if (first) document.getElementById(first[1])?.focus()
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    setFormError('')
    const found = validate(form, agreed)
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setFormError('入力内容をご確認ください。')
      focusFirstError(found)
      return
    }
    setSubmitting(true)
    try {
      await api.submitContact({ ...form, agreed })
      navigate('/contact/complete', { replace: true })
    } catch (error) {
      const err = error instanceof ApiError ? error : new ApiError(0, '送信に失敗しました。')
      setFormError(err.message)
      if (err.status === 422) {
        setErrors(err.errors as Errors)
        focusFirstError(err.errors as Errors)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const describedBy = (id: string, extra?: string) =>
    [errors[id as keyof Errors] ? `${id}-error` : '', extra ?? ''].filter(Boolean).join(' ') || undefined

  return (
    <SubPageLayout width="form">
      <h1 className="page-title">お問い合わせフォーム</h1>
      <p className="page-lead">
        ご相談や、ご質問をお送りください。「必須」の項目は必ずご入力ください。内容を確認して、ご連絡します。
      </p>

      <form className="form-card" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p className="form-alert" role="alert">
            {formError}
          </p>
        )}

        <Field id="topics" label="ご相談内容" required error={errors.topics} group>
          <div className="choices">
            {TOPICS.map((topic, index) => (
              <label key={topic.value} className="choice">
                <input
                  type="checkbox"
                  id={`topics-${index}`}
                  checked={form.topics.includes(topic.value)}
                  onChange={(e) => toggleTopic(topic.value, e.target.checked)}
                />
                <span>{topic.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field id="name" label="お名前" required error={errors.name}>
          <input
            id="name"
            className="input"
            type="text"
            autoComplete="name"
            maxLength={100}
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            aria-invalid={!!errors.name}
            aria-describedby={describedBy('name')}
          />
        </Field>

        <Field id="email" label="メールアドレス" required error={errors.email}>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            aria-invalid={!!errors.email}
            aria-describedby={describedBy('email')}
          />
        </Field>

        <Field id="phone" label="電話番号" required error={errors.phone} help="ハイフンはあってもなくても大丈夫です。">
          <input
            id="phone"
            className="input"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="例:09012345678"
            maxLength={20}
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            aria-invalid={!!errors.phone}
            aria-describedby={describedBy('phone', 'phone-help')}
          />
        </Field>

        <Field id="prefecture" label="お住まい" required error={errors.prefecture}>
          <select
            id="prefecture"
            className="input select"
            autoComplete="address-level1"
            value={form.prefecture}
            onChange={(e) => update('prefecture', e.target.value)}
            aria-invalid={!!errors.prefecture}
            aria-describedby={describedBy('prefecture')}
          >
            <option value="">選択</option>
            {PREFECTURES.map((pref) => (
              <option key={pref} value={pref}>
                {pref}
              </option>
            ))}
          </select>
        </Field>

        <Field id="age" label="ご年齢" error={errors.age}>
          <input
            id="age"
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="例:30"
            maxLength={3}
            value={form.age}
            onChange={(e) => update('age', e.target.value)}
            aria-invalid={!!errors.age}
            aria-describedby={describedBy('age')}
          />
        </Field>

        <Field id="initial_payment" label="初期費用のお支払い方法" required error={errors.initial_payment} group>
          <div className="choices">
            {INITIAL_PAYMENTS.map((option, index) => (
              <label key={option.value} className="choice">
                <input
                  type="radio"
                  name="initial_payment"
                  id={`initial_payment-${index}`}
                  value={option.value}
                  checked={form.initial_payment === option.value}
                  onChange={() => update('initial_payment', option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <Field
          id="monthly_payment"
          label="月額5,000円(税込・おまかせ管理プラン)のお支払い方法"
          required
          error={errors.monthly_payment}
          group
          help="おまかせ管理プランをご希望の方は、「クレジットカードの自動決済」をお選びください。ご不要の方は、「おまかせ管理プランなし」をお選びください。カード番号などは、このフォームには入力しないでください。決済の手続きは、あらためてご案内します。"
        >
          <div className="choices">
            {MONTHLY_PAYMENTS.map((option, index) => (
              <label key={option.value} className="choice">
                <input
                  type="radio"
                  name="monthly_payment"
                  id={`monthly_payment-${index}`}
                  value={option.value}
                  checked={form.monthly_payment === option.value}
                  onChange={() => update('monthly_payment', option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </Field>

        <section className={`field${errors.agreed ? ' field--error' : ''}`} id="privacy" aria-labelledby="privacy-title">
          <p className="field__label" id="privacy-title">
            「個人情報の取扱い」への同意
            <Badge required />
          </p>
          <p className="field__help">下の枠内を最後までお読みのうえ、「同意する」にチェックを入れてください。</p>
          <div
            className="policy-box"
            ref={policyRef}
            onScroll={checkPolicyScrolled}
            tabIndex={0}
            role="region"
            aria-label="個人情報の取扱い（全文）"
          >
            <PrivacyPolicy />
          </div>
          <p className="policy-hint">
            {canAgree ? '最後までお読みいただき、ありがとうございます。' : '最後までスクロールすると、チェックできます。'}
          </p>

          <div className={`agree-box${canAgree ? '' : ' agree-box--disabled'}`}>
            <label className="agree-box__label">
              <input
                type="checkbox"
                id="agreed"
                checked={agreed}
                disabled={!canAgree}
                onChange={(e) => {
                  setAgreed(e.target.checked)
                  setErrors((prev) => ({ ...prev, agreed: undefined }))
                }}
                aria-describedby={errors.agreed ? 'agreed-error' : undefined}
              />
              <span>同意する</span>
            </label>
            <p>現在、日本国内にお住まいで、日本語でやり取りができる方からのご依頼をお受けしています。</p>
            <p>反社会的勢力に当てはまる方や、法令・公序良俗に反するご依頼は、お受けしていません。</p>
            <p>
              事業者情報やキャンセルについては<Link to="/tokushoho">こちら</Link>です。
            </p>
          </div>
          {errors.agreed && (
            <p className="field__error" id="agreed-error">
              {errors.agreed}
            </p>
          )}
        </section>

        {/* 迷惑送信対策: 人には見えない入力欄です */}
        <div className="visually-hidden" aria-hidden="true">
          <label htmlFor="website">ウェブサイト</label>
          <input
            id="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => update('website', e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn--primary btn--submit" disabled={!agreed || submitting}>
          {submitting ? '送信しています…' : 'お問い合わせ送信'}
        </button>
        <p className="field__help">「同意する」にチェックを入れると、送信できます。</p>
      </form>
    </SubPageLayout>
  )
}
