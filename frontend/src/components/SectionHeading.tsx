import type { ReactNode } from 'react'
import type { IconType } from 'react-icons'

type Props = {
  eyebrow: string
  title: ReactNode
  icon?: IconType
  lead?: ReactNode
  center?: boolean
  inverse?: boolean
}

export function SectionHeading({ eyebrow, title, icon: Icon, lead, center, inverse }: Props) {
  const classes = ['section-heading', center && 'section-heading--center', inverse && 'section-heading--inverse']
  return (
    <div className={classes.filter(Boolean).join(' ')}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="section-title">
        {Icon && (
          <span className="icon-circle icon-circle--lg" aria-hidden="true">
            <Icon />
          </span>
        )}
        <span>{title}</span>
      </h2>
      {lead && <p className="section-lead">{lead}</p>}
    </div>
  )
}
