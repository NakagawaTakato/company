// 月ごとのお問い合わせ件数（直近12か月）の縦棒グラフです。
// 棒にマウスを乗せると件数を表示し、「表で見る」でも同じ数字を確認できます。
import { useEffect, useRef, useState } from 'react'
import { monthLabel } from '../../lib/format'

type Point = { month: string; count: number }

const HEIGHT = 220
const PAD = { top: 26, right: 8, bottom: 30, left: 34 }
const MAX_BAR = 24
const RADIUS = 4

function niceMax(value: number): number {
  if (value <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(value))
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (step * factor >= value) return step * factor
  }
  return value
}

/** 上の角だけ丸い棒（下は基準線にそろえて四角） */
function columnPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return ''
  const r = Math.min(RADIUS, height, width / 2)
  return [
    `M${x},${y + height}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${y + height}`,
    'Z',
  ].join(' ')
}

export function MonthlyChart({ data }: { data: Point[] }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  const max = niceMax(Math.max(0, ...data.map((d) => d.count)))
  const ticks = [0, max / 2, max]
  const innerW = width - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const band = innerW / data.length
  const barW = Math.min(MAX_BAR, band * 0.62)
  const yOf = (v: number) => PAD.top + innerH - (v / max) * innerH
  const last = data.length - 1

  return (
    <div className="chart">
      <div className="chart__plot" ref={boxRef} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label="月ごとのお問い合わせ件数（直近12か月）">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={yOf(tick)} y2={yOf(tick)} className="chart__grid" />
              <text x={PAD.left - 8} y={yOf(tick)} className="chart__tick" textAnchor="end" dominantBaseline="middle">
                {Number.isInteger(tick) ? tick : tick.toFixed(1)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2
            const y = yOf(d.count)
            const showLabel = i === last || i === hover
            return (
              <g key={d.month}>
                <path d={columnPath(cx - barW / 2, y, barW, PAD.top + innerH - y)} className="chart__bar" />
                {showLabel && d.count > 0 && (
                  <text x={cx} y={y - 7} className="chart__value" textAnchor="middle">
                    {d.count}
                  </text>
                )}
                <text x={cx} y={HEIGHT - 10} className="chart__tick" textAnchor="middle">
                  {monthLabel(d.month)}
                </text>
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  className="chart__hit"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <div
            className="chart__tooltip"
            style={{
              left: Math.min(Math.max(PAD.left + band * hover + band / 2, 70), width - 70),
              top: Math.max(yOf(data[hover].count) - 12, 4),
            }}
          >
            <strong>{monthLabel(data[hover].month, true)}</strong>
            <span>{data[hover].count} 件</span>
          </div>
        )}
      </div>
      <details className="chart__table">
        <summary>表で見る</summary>
        <table className="admin-table admin-table--compact">
          <thead>
            <tr>
              <th scope="col">月</th>
              <th scope="col">件数</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{monthLabel(d.month, true)}</td>
                <td>{d.count} 件</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
