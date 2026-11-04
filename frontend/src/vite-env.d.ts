/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API の接続先（.env.fastapi で設定） */
  readonly VITE_API_BASE_URL?: string
  /** Google アナリティクス（GA4）の測定ID（.env.fastapi で設定。空なら計測しない） */
  readonly VITE_GA_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
