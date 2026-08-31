import { useState } from 'react'
import { api, type YoloEvalResult } from '../../api'
import { ImageModal } from '../dataset-prep/ImageModal'
import { MetricCard } from '../ui/MetricCard'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons'
import { MetricInfoDetails } from './MetricInfoDetails'
import { YOLO_METRIC_FOOTNOTE, YOLO_METRIC_INFO } from './metricInfo'

interface Props {
  projectId: string
}

const METRICS: Array<{ key: 'precision' | 'recall' | 'map50' | 'map50_95'; label: string; color: string }> = [
  { key: 'precision', label: 'Precision', color: '#d95926' },
  { key: 'recall', label: 'Recall', color: '#199e70' },
  { key: 'map50', label: 'mAP50', color: '#3987e5' },
  { key: 'map50_95', label: 'mAP50-95', color: '#c98500' },
]

const ITEMS_PER_PAGE = 24

// Versi YOLO dari TestEvaluation.tsx — beda dari classifier ResNet: tidak
// ada konsep "benar/salah" biner per-gambar (deteksi objek jauh lebih fuzzy
// — bisa ketemu sebagian, meleset posisi dikit, dst.), jadi galerinya cuma
// nunjukkin BUKTI VISUAL bbox hasil prediksi model (bukan ground truth) per
// gambar test — evaluate_test_set() di backend SEKALIAN jalanin predict()
// per gambar & simpan hasilnya, bukan cuma angka mAP agregat yang abstrak.
export function YoloEvaluate({ projectId }: Props) {
  const [result, setResult] = useState<YoloEvalResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [openPath, setOpenPath] = useState<string | null>(null)

  async function handleEvaluate() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const r = await api.evaluateYoloTestSet(projectId)
      setResult(r)
      setPage(0)
      setOpenPath(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal evaluasi test set')
    } finally {
      setLoading(false)
    }
  }

  const predictions = result?.predictions ?? []
  const totalPages = Math.max(1, Math.ceil(predictions.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const paged = predictions.slice(currentPage * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE)
  const openIndex = openPath ? predictions.findIndex((p) => p.path === openPath) : -1
  const openPred = openIndex >= 0 ? predictions[openIndex] : null

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

          <div className="mt-6 border-t border-slate-800 pt-4">
            <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Bukti Visual — BBox Hasil Prediksi Model ({predictions.length} gambar)
            </h4>
            <p className="mb-3 text-[11px] text-slate-600">
              Bbox yang digambar di sini hasil prediksi model saat ini (bukan ground truth) — klik
              gambar untuk lihat lebih besar. "0 bbox" berarti model tidak menemukan apapun di
              gambar itu.
            </p>

            {predictions.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada gambar test.</p>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
                  {paged.map((pred) => (
                    <button
                      key={pred.path}
                      type="button"
                      onClick={() => setOpenPath(pred.path)}
                      className="overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-left"
                    >
                      <div className="relative aspect-square overflow-hidden bg-black">
                        <img
                          src={api.yoloTestImageUrl(projectId, pred.path)}
                          alt={pred.path}
                          loading="lazy"
                          className="h-full w-full object-cover transition hover:opacity-80"
                        />
                        <span
                          className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            pred.box_count > 0
                              ? 'bg-emerald-950/90 text-emerald-400'
                              : 'bg-slate-900/90 text-slate-500'
                          }`}
                        >
                          {pred.box_count} bbox
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-3 border-t border-slate-800 pt-3">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeftIcon className="h-3.5 w-3.5" />
                      Sebelumnya
                    </button>
                    <span className="text-xs text-slate-500">
                      Halaman {currentPage + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage >= totalPages - 1}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Berikutnya
                      <ChevronRightIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {openPred && (
            <ImageModal
              src={api.yoloTestImageUrl(projectId, openPred.path)}
              annotationUrl={api.yoloEvalPredictionUrl(projectId, openPred.path)}
              editable={false}
              classNames={result.class_names}
              caption={`${openPred.path} · ${openPred.box_count} bbox terdeteksi (hasil prediksi, bukan ground truth)`}
              onClose={() => setOpenPath(null)}
              onPrev={() => setOpenPath(predictions[openIndex - 1].path)}
              onNext={() => setOpenPath(predictions[openIndex + 1].path)}
              hasPrev={openIndex > 0}
              hasNext={openIndex >= 0 && openIndex < predictions.length - 1}
            />
          )}
        </div>
      )}
    </div>
  )
}
