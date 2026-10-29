/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API の接続先（.env.fastapi で設定） */
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
