// トップページの文言です（管理画面から編集できない部分）。文章を変えるときはここを書き換えてください。
// 料金・よくある質問・制作実績・お客さまの声・事業者情報は、管理画面の「サイト内容」で変更できます。
import type { IconType } from 'react-icons'
import { FaStore } from 'react-icons/fa6'
import {
  MdApartment,
  MdCheckCircle,
  MdCode,
  MdCurrencyYen,
  MdDescription,
  MdEdit,
  MdMail,
  MdPerson,
  MdRocketLaunch,
  MdSchool,
  MdSettings,
  MdSms,
  MdSubtitles,
} from 'react-icons/md'

// トップページのタブ名（検索結果に出るタイトル）です。index.html の <title> と同じ文言にしてください。
export const HOME_TITLE = '大阪・本町のホームページ制作｜Katachi（個人事業主・店舗・中小企業）'

// 対応エリアです（ページ下の「ご相談」欄に出ます）。index.html の説明文にも地名があるので、変えるときはそちらもそろえてください。
export const SERVICE_AREA = { main: '大阪市・尼崎市・西宮市・伊丹市など', note: 'オンラインなら全国' }

// ページ上部のメニューです（押すとページ内の各エリアへ移動します）。
// 半角スペースは、スマホで2行に折り返すときの区切りの位置です（画面には表示されません）。
export type NavItem = { label: string; href: string }

export const NAV: NavItem[] = [
  { label: '特長', href: '#strength' },
  { label: '対応内容', href: '#service' },
  { label: '経歴', href: '#profile' },
  { label: '制作実績', href: '#works' },
  { label: '料金', href: '#price' },
  { label: '安心の お約束', href: '#trust' },
  { label: '制作の 流れ', href: '#flow' },
  { label: 'よくある 質問', href: '#faq' },
]

// ヘッダー右上のボタンです（押すとページ下の「ご相談」エリアへ移動します）
export const HEADER_CTA = { label: 'ご相談はこちら', href: '#contact' }

// プロフィール欄の受賞バッジです。押すと、制作実績の中で badge が同じ賞状カードへ移動します。
export const AWARDS = [
  { badge: '金賞', text: 'ロボット制作', color: 'var(--c-accent-2)' },
  { badge: 'カプコン賞', text: '卒業制作 ARゲーム', color: 'var(--c-accent-5)' },
]

// プロフィール欄のスキルです。押すと、経歴の中で target と同じ id を持つ行（またはカード）へ移動します。
export const SKILLS = [
  { label: 'Python', target: 'skill-python' },
  { label: 'React', target: 'skill-react' },
  { label: 'Laravel / PHP', target: 'skill-php' },
  { label: 'C / C++', target: 'skill-c' },
  { label: 'C# / Unity', target: 'skill-unity' },
]

export const STATS = [
  { value: '4', unit: '年間', label: 'IT専門学校で学習', accent: 'var(--c-accent-1)' },
  { value: '2', unit: '回', label: '受賞(金賞・カプコン賞)', accent: 'var(--c-accent-2)' },
  { value: '1', unit: '年間', label: 'IT開発会社で実務', accent: 'var(--c-accent-3)' },
  { value: '1', unit: '人', label: '最初から最後まで担当', accent: 'var(--c-accent-4)' },
]

export type Feature = { icon: IconType; title: string; text: string; accent?: string }

export const STRENGTHS: Feature[] = [
  {
    icon: MdSms,
    title: '窓口がひとつで早い',
    text: 'ご相談から制作、公開後のご連絡まで、すべて私が担当します。担当者の間で話が伝わらない心配がありません。',
  },
  {
    icon: MdPerson,
    title: '担当が途中で変わらない',
    text: 'お客さまの事業やご要望を、最初から最後まで同じ人間が把握したまま進めます。',
  },
  {
    icon: MdCode,
    title: '開発経験にもとづく提案',
    text: '飲食店の予約システムを制作した経験があり、Reactでの開発も経験しているため、予約や問い合わせ管理などの機能もご相談いただけます。',
  },
]

export const SERVICES: Feature[] = [
  {
    icon: MdPerson,
    title: '個人事業主・フリーランス',
    text: '仕事の内容と人柄が伝わる、名刺がわりの1ページから対応します。',
    accent: 'var(--c-accent-1)',
  },
  {
    icon: FaStore,
    title: '飲食店・サロンなどの店舗',
    text: 'メニュー、料金、アクセス、予約への導線を、スマホで見やすく整えます。',
    accent: 'var(--c-accent-2)',
  },
  {
    icon: MdApartment,
    title: '中小企業',
    text: '会社案内、事業紹介、採用情報など、信頼感のあるコーポレートサイトを制作します。',
    accent: 'var(--c-accent-3)',
  },
  {
    icon: MdSubtitles,
    title: 'ランディングページ',
    text: 'サービスの申込や問い合わせにつなげる、1枚完結のページを制作します。',
    accent: 'var(--c-accent-4)',
  },
  {
    icon: MdSettings,
    title: '機能つきのサイト',
    text: '予約システムや問い合わせフォームなど、動きのある機能を開発します。',
    accent: 'var(--c-accent-5)',
  },
  {
    icon: MdEdit,
    title: '修正・更新のご相談',
    text: '既存サイトの修正や、スマホ対応、表示の改善もご相談ください。',
    accent: 'var(--c-accent-6)',
  },
]

export type CareerItem = {
  period: string
  title: string
  icon?: IconType
  accent: string
  rows?: { label: string; text: string; id?: string }[]
  text?: string
  id?: string
  current?: boolean
}

export const CAREER: CareerItem[] = [
  {
    period: '4年間',
    title: 'IT専門学校',
    icon: MdSchool,
    accent: 'var(--c-accent-4)',
    rows: [
      { label: '1年目', text: 'パソコンの基礎から学び、Excel、Word、PowerPointの使い方を学びました。' },
      { label: '2年目', text: '組込みシステム(C言語)を学び、制作物としてロボットを作成。金賞を受賞しました。' },
      {
        label: '3年目',
        id: 'skill-c',
        text: 'ゲーム制作を学び始め、C++ではクラスの仕組みまで深く学習。C言語でインベーダーゲーム、C++で迷路ゲームを制作しました。',
      },
      {
        label: '4年目',
        id: 'skill-unity',
        text: '卒業制作として、UnityのC#でARを使った格闘ゲーム(ストリートファイター風)を制作。カプコン賞を受賞しました。',
      },
    ],
  },
  {
    period: '半年間',
    title: '就労支援事業所',
    accent: 'var(--c-accent-2)',
    rows: [
      {
        label: '制作',
        text: 'C#を学び、Unityを使って、横スクロールアクションゲーム(スーパーマリオブラザーズ風)を制作しました。通所が自由で体調悪いときはすぐに休み、無理なく週4回で通ってました。',
      },
    ],
  },
  {
    period: '半年間',
    title: 'Webスクール',
    id: 'skill-php',
    icon: MdCode,
    accent: 'var(--c-accent-3)',
    rows: [
      { label: '前半3か月', text: 'PHPの基礎を学び、ターミナルの操作も身につけました。' },
      { label: '後半3か月', text: 'Figmaで制作物のデザインを確認してから、飲食店の予約システムを制作しました。' },
    ],
  },
  {
    period: '1年間',
    title: 'IT開発会社',
    icon: MdApartment,
    accent: 'var(--c-accent-1)',
    rows: [
      {
        label: '前半6か月',
        id: 'skill-python',
        text: 'Pythonを使ってExcelを扱うプログラムを作成し、Excel操作の難しいところまで携わりました。フローチャートを使った設計も経験しました。',
      },
      {
        label: '後半6か月',
        id: 'skill-react',
        text: '役割を分担し、フロントエンド(React)は私が、バックエンド(Python/FastAPI)は東京大学卒業のエンジニアが担当しました。あわせて、詳細設計書の修正と作成も経験しました。',
      },
    ],
  },
  {
    period: '現在',
    title: 'フリーランスとして活動',
    icon: MdRocketLaunch,
    accent: 'var(--c-accent-5)',
    text: 'これまでの経験を活かし、お客さまのホームページ制作を直接お受けしています。',
    current: true,
  },
]

export const PROMISES: Feature[] = [
  {
    icon: MdDescription,
    title: '先に見積書をお渡しします',
    text: '内容・金額・納期・お支払い時期を書面(メール)で確認し、ご納得いただいてから着手します。',
    accent: 'var(--c-accent-1)',
  },
  {
    icon: MdCheckCircle,
    title: '追加費用は先にご相談',
    text: '見積書にない費用を、あとから請求しません。内容を追加するときは、先に金額をお伝えします。',
    accent: 'var(--c-accent-2)',
  },
  {
    icon: MdCurrencyYen,
    title: 'お支払いはわかりやすく',
    text: '初期費用は手渡しまたはカード、月額はカードの自動決済。お支払い後は領収書を発行します。',
    accent: 'var(--c-accent-3)',
  },
  {
    icon: MdPerson,
    title: '顔の見えるひとり対応',
    text: '最初から最後まで同じ私が担当し、連絡先と事業者情報を公開します。',
    accent: 'var(--c-accent-4)',
  },
  {
    icon: MdMail,
    title: '個人情報は守ります',
    text: 'お預かりした情報は、ご返信とお見積りのためだけに使い、第三者に渡しません。',
    accent: 'var(--c-accent-5)',
  },
]

export const FLOW: Feature[] = [
  { icon: MdSms, title: 'ご相談', text: '目的やご予算、ご希望をうかがいます。', accent: 'var(--c-accent-1)' },
  { icon: MdDescription, title: 'お見積り', text: '内容と費用、納期をお伝えします。', accent: 'var(--c-accent-2)' },
  { icon: MdEdit, title: 'デザイン・制作', text: '途中で確認していただきながら進めます。', accent: 'var(--c-accent-3)' },
  { icon: MdCheckCircle, title: '確認・修正', text: '仕上がりをご確認いただき、修正します。', accent: 'var(--c-accent-4)' },
  { icon: MdRocketLaunch, title: '公開・サポート', text: '公開後のご質問にも対応します。', accent: 'var(--c-accent-5)' },
]
