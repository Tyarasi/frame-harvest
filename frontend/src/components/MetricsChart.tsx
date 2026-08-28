import { useRef, useState } from 'react'

export interface ChartSeries {
  key: string
  label: string
  color: string
}

interface Props<T> {
  data: T[]
  series: ChartSeries[]
  /** Batas keras domain-Y (opsional). Kalau tidak diisi, domain dihitung
   * otomatis dari data + padding supaya garis tidak mepet ke tepi. */
  domainFloor?: number
  domainCeil?: number
  yFormat?: (v: number) => string
  height?: number
}

const PAD_LEFT = 36
const PAD_RIGHT = 46
const PAD_TOP = 12
const PAD_BOTTOM = 22
const VIEW_WIDTH = 640
const LABEL_MIN_GAP = 13

export function MetricsChart<T extends { epoch: number }>({
  data,
  series,
  domainFloor,
  domainCeil,
  yFormat,
  height = 220,
}: Props<T>) {
  function valueOf(d: T, key: string): number {
    return (d[key as keyof T] as unknown as number) ?? 0
  }

  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const formatY = yFormat ?? ((v: number) => v.toFixed(2))
  const innerWidth = VIEW_WIDTH - PAD_LEFT - PAD_RIGHT
  const innerHeight = height - PAD_TOP - PAD_BOTTOM
  const n = data.length

  // domain-Y otomatis: pakai rentang nilai asli + padding 15%, supaya garis
  // memenuhi tinggi grafik alih-alih mepet di satu pita sempit (mis. akurasi
  // 0.5-0.95 tidak dipaksa tampil di skala 0-1 penuh yang menyisakan separuh
  // grafik kosong). Dijepit ke domainFloor/domainCeil kalau diisi (mis. 0-1
  // untuk metrik klasifikasi yang secara definisi tidak mungkin di luar itu).
  const allValues = data.flatMap((d) => series.map((s) => valueOf(d, s.key)))
  const rawMin = allValues.length ? Math.min(...allValues) : 0
  const rawMax = allValues.length ? Math.max(...allValues) : 1
  const span = rawMax - rawMin || Math.max(rawMax, 0.1)
  const pad = span * 0.18
  let yMin = rawMin - pad
  let yMax = rawMax + pad
  if (domainFloor !== undefined) yMin = Math.max(yMin, domainFloor)
  if (domainCeil !== undefined) yMax = Math.min(yMax, domainCeil)
  if (yMax - yMin < 1e-6) yMax = yMin + 1
  const yRange = yMax - yMin

  function xAt(i: number): number {
    if (n <= 1) return PAD_LEFT + innerWidth / 2
    return PAD_LEFT + (i / (n - 1)) * innerWidth
  }

  function yAt(value: number): number {
    const clamped = Math.max(yMin, Math.min(yMax, value))
    return PAD_TOP + innerHeight - ((clamped - yMin) / yRange) * innerHeight
  }

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (n === 0 || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_WIDTH
    let closest = 0
    let closestDist = Infinity
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(xAt(i) - relX)
      if (dist < closestDist) {
        closestDist = dist
        closest = i
      }
    }
    setHoverIndex(closest)
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => yMin + f * yRange)
  const hover = hoverIndex !== null ? data[hoverIndex] : null

  // posisi tooltip: geser ke kiri kalau titiknya di setengah kanan grafik,
  // supaya tooltip tidak terpotong tepi
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : 0
  const tooltipOnLeft = hoverX > VIEW_WIDTH / 2

  // label nilai langsung di ujung kanan tiap garis — supaya nilai terbaru
  // kebaca sekilas tanpa perlu hover. Kalau beberapa series nilainya
  // berdekatan, geser label secara vertikal supaya tidak tumpang tindih.
  const endLabels = n > 0
    ? series
        .map((s) => ({ series: s, y: yAt(valueOf(data[n - 1], s.key)) }))
        .sort((a, b) => a.y - b.y)
        .reduce<Array<{ series: ChartSeries; y: number }>>((acc, item) => {
          const prev = acc[acc.length - 1]
          const y = prev && item.y - prev.y < LABEL_MIN_GAP ? prev.y + LABEL_MIN_GAP : item.y
          acc.push({ series: item.series, y })
          return acc
        }, [])
    : []

  return (
    <div className="w-full">
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-3">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              {s.label}
            </div>
          ))}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="w-full touch-none select-none"
        style={{ height }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {/* gridlines + label sumbu-Y */}
        {gridLines.map((g) => (
          <g key={g}>
            <line
              x1={PAD_LEFT}
              x2={VIEW_WIDTH - PAD_RIGHT}
              y1={yAt(g)}
              y2={yAt(g)}
              stroke="#334155"
              strokeWidth={1}
            />
            <text x={PAD_LEFT - 6} y={yAt(g) + 3} textAnchor="end" fontSize={9} fill="#64748b">
              {formatY(g)}
            </text>
          </g>
        ))}

        {/* label sumbu-X: epoch pertama, tengah, terakhir */}
        {n > 0 && (
          <>
            <text x={xAt(0)} y={height - 6} textAnchor="middle" fontSize={9} fill="#64748b">
              {data[0].epoch}
            </text>
            {n > 2 && (
              <text
                x={xAt(Math.floor((n - 1) / 2))}
                y={height - 6}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                {data[Math.floor((n - 1) / 2)].epoch}
              </text>
            )}
            <text
              x={xAt(n - 1)}
              y={height - 6}
              textAnchor="middle"
              fontSize={9}
              fill="#64748b"
            >
              {data[n - 1].epoch}
            </text>
          </>
        )}

        {/* garis data per-series */}
        {series.map((s) => (
          <polyline
            key={s.key}
            points={data.map((d, i) => `${xAt(i)},${yAt(valueOf(d, s.key))}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* titik data */}
        {series.map((s) =>
          data.map((d, i) => (
            <circle
              key={`${s.key}-${i}`}
              cx={xAt(i)}
              cy={yAt(valueOf(d, s.key))}
              r={i === n - 1 ? 3 : 2.5}
              fill={s.color}
            />
          )),
        )}

        {/* label nilai langsung di ujung kanan tiap garis */}
        {endLabels.map(({ series: s, y }) => (
          <text
            key={`end-${s.key}`}
            x={VIEW_WIDTH - PAD_RIGHT + 6}
            y={y + 3}
            fontSize={10}
            fontFamily="ui-monospace, monospace"
            fill={s.color}
          >
            {formatY(valueOf(data[n - 1], s.key))}
          </text>
        ))}

        {/* crosshair + tooltip saat hover */}
        {hover && hoverIndex !== null && (
          <>
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={PAD_TOP}
              y2={height - PAD_BOTTOM}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            <foreignObject
              x={tooltipOnLeft ? xAt(hoverIndex) - 150 - 8 : xAt(hoverIndex) + 8}
              y={PAD_TOP}
              width={150}
              height={22 + series.length * 16}
            >
              <div className="rounded-md border border-slate-700 bg-slate-950/95 px-2 py-1.5 text-[10px] text-slate-300 shadow-lg">
                <p className="mb-1 font-mono text-slate-500">Epoch {hover.epoch}</p>
                {series.map((s) => (
                  <p key={s.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                    </span>
                    <span className="font-mono">{formatY(valueOf(hover, s.key))}</span>
                  </p>
                ))}
              </div>
            </foreignObject>
          </>
        )}
      </svg>
    </div>
  )
}
