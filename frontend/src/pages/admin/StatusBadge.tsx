import { STATUSES, labelOf } from '../../lib/options'

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status status--${status}`}>{labelOf(STATUSES, status)}</span>
}
