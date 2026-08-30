import { useState } from 'react'
import { api, type TestEvalResult } from '../../api'
import { EvaluationResults } from './EvaluationResults'

interface Props {
  projectId: string
}

export function TestEvaluation({ projectId }: Props) {
  const [result, setResult] = useState<TestEvalResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleEvaluate() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const r = await api.evaluateTestSet(projectId)
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
        Evaluasi model tersimpan (<code>best_model.pt</code>) terhadap <code>split/test</code> —
        gambar yang <strong className="text-slate-400">tidak pernah dilihat</strong> selama
        training maupun saat memilih checkpoint terbaik (beda dari angka val yang muncul selama
        training run di atas). Ini ukuran performa paling jujur yang tersedia untuk model saat
        ini.
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

      {result && <EvaluationResults projectId={projectId} result={result} />}
    </div>
  )
}
