import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/** LINE や SNS で URL を送ったときのプレビュー画像（OGP）のタグを入れます。SITE_URL が空なら何もしません。 */
function ogImage(siteUrl: string): Plugin {
  if (siteUrl && !siteUrl.startsWith('https://')) {
    throw new Error(`.env.fastapi の SITE_URL は https:// から書いてください（今の値: ${siteUrl}）`)
  }
  const image = `${siteUrl.replace(/\/+$/, '')}/ogp.png`
  return {
    name: 'og-image',
    transformIndexHtml: () =>
      siteUrl
        ? [
            { tag: 'meta', attrs: { property: 'og:image', content: image }, injectTo: 'head' },
            { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' }, injectTo: 'head' },
            { tag: 'meta', attrs: { property: 'og:image:height', content: '630' }, injectTo: 'head' },
          ]
        : [],
  }
}

// 接続先は .env.fastapi で設定します。
//   npm run dev:fastapi → .env.fastapi（API: FastAPI 8000 / 画面: 5173）
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devPort = Number(env.DEV_PORT || 5173)
  // WSL から Windows のフォルダ（/mnt/c/...）を使う場合、ファイルの変更を検知できるよう定期的に確認します
  const onWindowsDrive = process.cwd().startsWith('/mnt/')

  return {
    plugins: [react(), ogImage(env.SITE_URL ?? '')],
    server: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
      watch: onWindowsDrive ? { usePolling: true, interval: 300 } : undefined,
      // ../shared/contact_options.json を読み込めるようにします
      fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] },
    },
    preview: {
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})
