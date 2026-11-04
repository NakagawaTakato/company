import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import {
  MdAccessTime,
  MdCheckCircle,
  MdEmojiEvents,
  MdFormatQuote,
  MdLiveHelp,
  MdMail,
  MdMailOutline,
  MdPlace,
  MdRadioButtonChecked,
  MdSms,
} from 'react-icons/md'
import { assetUrl } from '../api/client'
import { Logo } from '../components/Logo'
import { SectionHeading } from '../components/SectionHeading'
import {
  CAREER,
  FLOW,
  HEADER_CTA,
  NAV,
  PROMISES,
  SERVICE_AREA,
  SERVICES,
  SKILLS,
  STATS,
  STRENGTHS,
  type Feature,
} from '../content/home'
import { useSite } from '../lib/SiteContext'
import { useActiveSection } from '../lib/useActiveSection'
import { usePageTitle } from '../lib/usePageTitle'

const accentStyle = (accent?: string) => (accent ? ({ '--accent': accent } as CSSProperties) : undefined)

// 制作実績のバッジは、1つ目・2つ目…で色を交互にします（テーマ色に連動）
const BADGE_COLORS = ['var(--c-accent-2)', 'var(--c-accent-5)']

// 今見ているエリアを調べる対象です。「ご相談」エリアはメニューにありませんが、
// そこまで来たら「よくある質問」の強調を外したいので、最後に加えています。
const SECTION_IDS = [...NAV.map((item) => item.href.slice(1)), HEADER_CTA.href.slice(1)]

function FeatureCard({ item }: { item: Feature }) {
  const Icon = item.icon
  return (
    <article className="feature-card" style={accentStyle(item.accent)}>
      <span className="icon-circle icon-circle--lg" aria-hidden="true">
        <Icon />
      </span>
      <h3 className="feature-card__title">{item.title}</h3>
      <p className="feature-card__text">{item.text}</p>
    </article>
  )
}

export function HomePage() {
  usePageTitle()
  const { business, prices, faq, works, other_works: otherWorks, testimonials } = useSite().content
  const publishedVoices = testimonials.filter((t) => t.published)
  const activeSection = useActiveSection(SECTION_IDS)

  return (
    <div className="home">
      {/* ヘッダー（ロゴと「ご相談はこちら」ボタン）。画面上部に固定します */}
      <header className="home-header">
        <div className="home-header__inner">
          <Logo variant="stacked" />
          <a className="btn btn--primary home-header__cta" href={HEADER_CTA.href}>
            <MdMailOutline aria-hidden="true" />
            {HEADER_CTA.label}
          </a>
        </div>
      </header>

      {/* ページ内メニュー。PCはヘッダーの真ん中に重ねて1行、タブレットはヘッダーの下に1行、スマホは4列×2段 */}
      <nav className="home-nav" aria-label="ページ内メニュー">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            aria-current={activeSection === item.href.slice(1) ? 'location' : undefined}
          >
            {item.label.split(' ').map((phrase) => (
              <span key={phrase} className="home-nav__phrase">
                {phrase}
              </span>
            ))}
          </a>
        ))}
      </nav>

      <main>
        {/* ファーストビュー */}
        <section className="container hero-wrap">
          <div className="hero">
            <div className="hero__body">
              <p className="hero__eyebrow">WEBSITE PRODUCTION</p>
              <h1 className="hero__title">
                最初のご相談から
                <br />
                公開まで、<span className="text-primary">私ひとりが</span>
                <br />
                <span className="text-primary">責任をもって</span>担当します。
              </h1>
              <p className="hero__lead">
                個人事業主さま・飲食店やサロンなどの店舗・中小企業さまのホームページを制作しています。スマホで見やすく、お問い合わせやご予約につながるページを、わかりやすい言葉でご提案します。予約フォームや問い合わせの管理など、動きのある機能もご相談ください。
              </p>
              <div className="hero__actions">
                <a className="btn btn--primary" href="#contact">
                  無料でご相談する
                </a>
                <a className="btn btn--outline" href="#profile">
                  経歴を見る
                </a>
              </div>
              <ul className="hero__checks">
                <li>
                  <MdCheckCircle aria-hidden="true" />
                  ご相談・お見積りは無料
                </li>
                <li>
                  <MdCheckCircle aria-hidden="true" />
                  見積書の金額以外は請求しません
                </li>
              </ul>
            </div>

            <aside className="profile-card" aria-label="制作者のプロフィール">
              <h2 className="profile-card__title">ホームページ制作者</h2>
              <p className="profile-card__role">フリーランス</p>
              <p className="profile-card__text">
                IT専門学校で4年間(ロボット制作で金賞、卒業制作でカプコン賞)、Webスクールで半年間学び、IT開発会社で1年間、Web開発の実務を経験しました。
              </p>
              <ul className="profile-card__awards">
                <li>
                  <span className="badge" style={{ background: 'var(--c-accent-2)' }}>
                    金賞
                  </span>
                  ロボット制作
                </li>
                <li>
                  <span className="badge" style={{ background: 'var(--c-accent-5)' }}>
                    カプコン賞
                  </span>
                  卒業制作 ARゲーム
                </li>
              </ul>
              <ul className="chips">
                {SKILLS.map((skill) => (
                  <li key={skill} className="chip">
                    {skill}
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          <ul className="stats">
            {STATS.map((stat) => (
              <li key={stat.label} className="stat" style={accentStyle(stat.accent)}>
                <p className="stat__value">
                  {stat.value}
                  <span className="stat__unit">{stat.unit}</span>
                </p>
                <p className="stat__label">{stat.label}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* 特長 */}
        <section id="strength" className="section section--blue">
          <div className="container">
            <SectionHeading eyebrow="STRENGTH" title="ひとりで対応するから、できること" inverse />
            <div className="grid grid--3">
              {STRENGTHS.map((item) => {
                const Icon = item.icon
                return (
                  <article key={item.title} className="strength-card">
                    <span className="icon-circle icon-circle--lg icon-circle--white" aria-hidden="true">
                      <Icon />
                    </span>
                    <h3 className="strength-card__title">{item.title}</h3>
                    <p className="strength-card__text">{item.text}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* 対応内容 */}
        <section id="service" className="section">
          <div className="container">
            <SectionHeading eyebrow="SERVICE" title="こんな方のホームページをつくります" />
            <div className="grid grid--3">
              {SERVICES.map((item) => (
                <FeatureCard key={item.title} item={item} />
              ))}
            </div>
          </div>
        </section>

        {/* 経歴 */}
        <section id="profile" className="section">
          <div className="container">
            <SectionHeading eyebrow="PROFILE" title="経歴" />
            <ol className="timeline">
              {CAREER.map((item) => {
                const Icon = item.icon
                return (
                  <li
                    key={item.title}
                    className={`timeline__item${item.current ? ' timeline__item--current' : ''}`}
                    style={accentStyle(item.accent)}
                  >
                    <span className="timeline__dot" aria-hidden="true" />
                    <article className="timeline__card">
                      {Icon && (
                        <span className="icon-circle icon-circle--md timeline__icon" aria-hidden="true">
                          <Icon />
                        </span>
                      )}
                      <span className="pill">{item.period}</span>
                      <h3 className="timeline__title">{item.title}</h3>
                      {item.rows?.map((row) => (
                        <p key={row.label} className="timeline__row">
                          <span className="tag">{row.label}</span>
                          {row.text}
                        </p>
                      ))}
                      {item.text && <p className="timeline__row">{item.text}</p>}
                    </article>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* 制作実績 */}
        <section id="works" className="section">
          <div className="container">
            <SectionHeading eyebrow="WORKS" title="制作実績" icon={MdEmojiEvents} />
            {works.length > 0 && (
              <div className="grid grid--2">
                {works.map((work, index) => (
                  <article key={`${work.title}-${index}`} className="work-card">
                    <div className="work-card__image">
                      <img src={assetUrl(work.image)} alt={work.alt} loading="lazy" />
                    </div>
                    {work.badge && (
                      <span className="badge" style={{ background: BADGE_COLORS[index % BADGE_COLORS.length] }}>
                        {work.badge}
                      </span>
                    )}
                    <h3 className="work-card__title">{work.title}</h3>
                    {work.text && <p className="work-card__text">{work.text}</p>}
                  </article>
                ))}
              </div>
            )}

            {otherWorks.length > 0 && (
              <>
                <h3 className="sub-heading">そのほかの制作物</h3>
                <ul className="chips">
                  {otherWorks.map((work) => (
                    <li key={work} className="chip">
                      {work}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {publishedVoices.length > 0 ? (
              <>
                <h3 className="sub-heading">お客さまの声</h3>
                <p className="voices-lead">ご本人の許可をいただいたものだけを掲載しています。</p>
                <div className="grid grid--2 voices">
                  {publishedVoices.map((voice, index) => (
                    <figure key={`${voice.name}-${index}`} className="voice-card">
                      <MdFormatQuote className="voice-card__mark" aria-hidden="true" />
                      <blockquote className="voice-card__text">{voice.text}</blockquote>
                      <figcaption className="voice-card__name">
                        {voice.name}
                        {voice.date && <span className="voice-card__date">{voice.date}</span>}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </>
            ) : (
              <p className="note-box">
                <strong>お客さまの声は、実際にいただいたものだけを載せます。</strong>
                ご本人の許可をいただいてから掲載します。納品実績が増えるまでは、この欄は準備中として、まずはご相談をお待ちしています。
              </p>
            )}
          </div>
        </section>

        {/* 料金 */}
        <section id="price" className="section">
          <div className="container">
            <SectionHeading eyebrow="PRICE" title="料金の目安" icon={MdRadioButtonChecked} />
            <div className="price-table">
              <p className="price-table__caption">制作内容ごとの、1ページの相場です。</p>
              <table>
                <thead>
                  <tr>
                    <th scope="col">制作内容</th>
                    <th scope="col">1ページの相場</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.rows.map((row, index) => (
                    <tr key={`${row.name}-${index}`}>
                      <th scope="row">{row.name}</th>
                      <td>{row.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {prices.notes.map((note) => (
              <p key={note} className="section-note">
                {note}
              </p>
            ))}
          </div>
        </section>

        {/* 安心のお約束 */}
        <section id="trust" className="section">
          <div className="container">
            <SectionHeading
              eyebrow="TRUST"
              title="安心してご依頼いただくための、お約束"
              lead="お金が関わることだからこそ、先に決めておく・正直に伝える、を大切にしています。"
            />
            <div className="grid grid--3">
              {PROMISES.map((item) => (
                <FeatureCard key={item.title} item={item} />
              ))}
            </div>
            <p className="trust-link">
              <Link to="/tokushoho">事業者情報(特定商取引法に基づく表記)・キャンセルと返金について →</Link>
            </p>
          </div>
        </section>

        {/* 制作の流れ */}
        <section id="flow" className="section">
          <div className="container">
            <SectionHeading eyebrow="FLOW" title="制作の流れ" />
            <ol className="grid grid--4 flow">
              {FLOW.map((step, index) => {
                const Icon = step.icon
                return (
                  <li key={step.title} className="flow-card" style={accentStyle(step.accent)}>
                    <span className="icon-circle icon-circle--md flow-card__icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="step-pill">STEP {index + 1}</span>
                    <h3 className="flow-card__title">{step.title}</h3>
                    <p className="flow-card__text">{step.text}</p>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* よくある質問 */}
        {faq.length > 0 && (
          <section id="faq" className="section">
            <div className="container">
              <SectionHeading eyebrow="FAQ" title="よくある質問" icon={MdLiveHelp} />
              <div className="faq">
                {faq.map((item, index) => (
                  <details key={`${item.q}-${index}`} className="faq__item">
                    <summary>{item.q}</summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ご相談 */}
        <section id="contact" className="section section--contact">
          <div className="container">
            <SectionHeading eyebrow="CONTACT" title="まずはお気軽にご相談ください" center />
            <div className="contact-cards">
              <article className="contact-card" style={accentStyle('var(--c-primary)')}>
                <span className="icon-circle icon-circle--lg" aria-hidden="true">
                  <MdMail />
                </span>
                <h3 className="contact-card__title">フォームでご相談</h3>
                <p className="contact-card__text">お名前や連絡先を入力して送れます。</p>
                <Link className="btn btn--primary" to="/contact">
                  お問い合わせフォーム
                </Link>
              </article>
              <article className="contact-card contact-card--line" style={accentStyle('#06c755')}>
                <span className="icon-circle icon-circle--lg icon-circle--line" aria-hidden="true">
                  <MdSms />
                </span>
                <h3 className="contact-card__title">LINEでご相談</h3>
                <p className="contact-card__text">気軽にメッセージを送れます。</p>
                <Link className="btn btn--line" to="/line">
                  LINEでご相談する
                </Link>
              </article>
            </div>
            <p className="hours">
              <span className="icon-circle icon-circle--md" aria-hidden="true">
                <MdAccessTime />
              </span>
              <span className="pill">対応時間</span>
              <strong>{business.hours}</strong>
              <span className="hours__suffix">など</span>
            </p>
            <p className="hours hours--area">
              <span className="icon-circle icon-circle--md" aria-hidden="true">
                <MdPlace />
              </span>
              <span className="pill">対応エリア</span>
              <strong>{SERVICE_AREA.main}</strong>
              <span className="hours__suffix">（{SERVICE_AREA.note}）</span>
            </p>
            <p className="contact-note">ご相談の内容によっては、お受けできない場合もあります。あらかじめご了承ください。</p>
          </div>
        </section>
      </main>

      <footer className="container site-footer">
        <nav className="site-footer__links" aria-label="サイト情報">
          <Link to="/tokushoho">事業者情報・お取引について</Link>
          <Link to="/contact#privacy">個人情報の取扱い</Link>
        </nav>
        <p className="site-footer__copy">
          © {new Date().getFullYear()} {business.business_name}
        </p>
      </footer>
    </div>
  )
}
