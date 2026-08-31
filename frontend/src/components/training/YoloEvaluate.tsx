import { useState } from 'react'
import { api, type YoloEvalResult } from '../../api'
import { MetricCard } from '../ui/MetricCard'
import { MetricInfoDetails } from './MetricInfoDetails'
import { YOLO_METRIC_FOOTNOTE, YOLO_METRIC_INFO } from './metricInfo'

interface Props {
  projectId: string
}

const METRICS: Array<{ key: keyof YoloEvalResult; label: string; color: string }> = [
  { key: 'precision', label: 'Precision', color: '#d95926' },
  { key: 'recall', label: 'Recall', color: '#199e70' },
  { key: 'map50', label: 'mAP50', color: '#3987e5' },
  { key: 'map50_95', label: 'mAP50-95', color: '#c98500' },
]

// Versi YOLO dari TestEvaluation.tsx — sengaja HANYA metrik agregat, tanpa
// galeri prediksi per-gambar seperti classifier ResNet (mAP dihitung
// ultralytics dari perbandingan bbox prediksi vs ground truth per-gambar,
// belum ada breakdown per-gambar yang diekspos ke endpoint ini).
export function YoloEvaluate({ projectId }: Props) {
  const [result, setResult] = useState<YoloEvalResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEvaluate() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const r = await api.evaluateYoloTestSet(projectId)
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal evaluasi test set')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-2xl text-xs text-slate-500">
        Evaluasi model tersimpan (<code>best_yolo.pt</code>) terhadap{' '}
        <code>split_yolo/images/test</code> — frame yang tidak pernah dilihat selama training.
        mAP50/mAP50-95 dihitung langsung oleh ultralytics.
      </p>

      <button
        type="button"
        onClick={handleEvaluate}
        disabled={loading || !projectId}
        className="mb-4 rounded-lg border border-purple-800 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-950 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Mengevaluasi…' : 'Evaluasi ke Test Set'}
      </button>

      {error && <p className="mb-4 text-xs text-red-400">{error}</p>}

      {result && (
        <div>
          <p className="mb-3 text-xs text-slate-500">{result.num_images} gambar test</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {METRICS.map((m) => (
              <MetricCard key={m.key} label={m.label} color={m.color} direction="up" value={result[m.key].toFixed(3)} />
            ))}
          </div>
          <MetricInfoDetails metrics={YOLO_METRIC_INFO} footnote={YOLO_METRIC_FOOTNOTE} />
        </div>
      )}
    </div>
  )
}
