import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from './Logo'

type Props = {
  /** 本文の幅: line=560px / form=640px / doc=760px */
  width?: 'line' | 'form' | 'doc'
  children: ReactNode
}

export function SubPageLayout({ width = 'form', children }: Props) {
  return (
    <div className={`subpage subpage--${width}`}>
      <header className="subpage__header">
        <Logo />
      </header>
      <main className="subpage__main">{children}</main>
      <div className="subpage__back">
        <Link className="btn btn--outline" to="/">
          トップページへ戻る
        </Link>
      </div>
    </div>
  )
}
