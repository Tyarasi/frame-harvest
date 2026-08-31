import type { MetricInfo } from './metricInfo'

interface Props {
  metrics: MetricInfo[]
  // loss bisa 1 (ResNet, loss tunggal) atau beberapa (YOLO: box/cls/dfl) —
  // opsional, karena halaman EVALUASI (snapshot test-set sekali jalan) tidak
  // punya nilai loss untuk dijelaskan (loss itu konsep waktu TRAINING)
  lossInfo?: MetricInfo | MetricInfo[]
  footnote: string
}

// Blok <details> "Apa artinya angka-angka ini?" — dipakai di halaman
// Training Run & Evaluasi, ResNet maupun YOLO, isinya beda (lihat
// metricInfo.ts) tapi tampilannya SATU komponen supaya konsisten.
export function MetricInfoDetails({ metrics, lossInfo, footnote }: Props) {
  const losses = !lossInfo ? [] : Array.isArray(lossInfo) ? lossInfo : [lossInfo]

  return (
    <details className="mt-5 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs">
      <summary className="cursor-pointer select-none font-medium text-slate-200">
        Apa artinya angka-angka ini &amp; arah baik/buruknya?
      </summary>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[...metrics, ...losses].map((m) => (
          <div key={m.key} className="rounded-md border border-slate-600 bg-slate-800 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[11px] font-semibold" style={{ color: m.color }}>
                {m.label}
              </p>
              <span className="shrink-0 text-[10px] text-slate-500">
                {m.direction === 'up' ? '↑ makin tinggi makin baik' : '↓ makin rendah makin baik'}
              </span>
            </div>
            <p className="mt-1 leading-snug text-slate-300">{m.meaning}</p>
            <p className="mt-1.5 leading-snug text-slate-300">
              <span className="font-medium text-slate-100">Dampak: </span>
              {m.impact}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-slate-700 pt-3 leading-snug text-slate-300">{footnote}</p>
    </details>
  )
}
