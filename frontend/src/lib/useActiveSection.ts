import { useEffect, useState } from 'react'

/**
 * 今見ているエリアの ID を返します（ヘッダーのメニューを青字＋下線にするために使います）。
 * 画面の上から 30% の線より上に先頭が来ているエリアのうち、一番下のものを選びます。どれも来ていなければ null です。
 * ページの一番下までスクロールしたときは、最後のエリアを選びます。
 * ids は毎回作り直さず、ファイルの先頭などで作った同じ配列を渡してください。
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const line = window.innerHeight * 0.3
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      let current: string | null = null
      for (const id of ids) {
        const section = document.getElementById(id)
        if (section && (atBottom || section.getBoundingClientRect().top <= line)) current = id
      }
      setActive(current)
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [ids])

  return active
}
