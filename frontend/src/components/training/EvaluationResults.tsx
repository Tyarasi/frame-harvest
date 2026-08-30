import { useEffect, useMemo, useState } from 'react'
import { api, type TestEvalResult, type TestPrediction } from '../../api'
import { ImageModal } from '../dataset-prep/ImageModal'

interface Props {
  projectId: string
  result: TestEvalResult
}

// Tampilan hasil evaluasi — dipakai BERSAMA oleh "Evaluasi ke Test Set"
// (model tersimpan) dan "Coba Model dari File" (model diupload manual).
// Bentuk datanya (TestEvalResult) sengaja dibuat sama persis oleh backend
// (_evaluate_checkpoint_dict dipakai kedua alur), jadi tampilannya pun satu
// komponen, bukan diduplikasi jadi dua versi yang bisa perlahan beda sendiri.

const METRICS: Array<{ key: keyof TestEvalResult; label: string; color: string }> = [
  { key: 'accuracy', label: 'Accuracy', color: '#3987e5' },
  { key: 'precision', label: 'Precision', color: '#d95926' },
  { key: 'recall', label: 'Recall', color: '#199e70' },
  { key: 'f1', label: 'F1', color: '#c98500' },
]

type PredFilter = 'all' | 'wrong' | 'correct'

// Slot 1 (biru) & slot 2 (oranye) dari palet kategorikal skill dataviz —
// divalidasi lolos semua 6 pengecekan (lightness band, chroma floor, CVD
// separation, normal-vision floor, kontras) khusus untuk pasangan ini di
// mode dark, bukan warna tebakan. Urutan warna mengikuti urutan `class_names`
// dari backend (alfabetis, dari ImageFolder) — TETAP per label.
const LABEL_HUES = ['#3987e5', '#d95926']

function labelColor(label: string, classNames: string[]): string {
  const idx = classNames.indexOf(label)
  return idx >= 0 ? LABEL_HUES[idx % LABEL_HUES.length] : '#94a3b8'
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// isi badge label diwarnai per kelas (bukan cuma teks abu-abu polos) —
// benar: satu warna (label asli == prediksi). salah: 2 kata beda warna
// (asli lalu prediksi) dipisah panah netral, jadi arah kekeliruan kelihatan
// dari WARNA-nya juga, tidak cuma dari teksnya.
function LabelBadgeContent({ pred, classNames }: { pred: TestPrediction; classNames: string[] }) {
  if (pred.correct) {
    return <span style={{ color: labelColor(pred.true_label, classNames) }}>{pred.true_label}</span>
  }
  return (
    <>
      <span style={{ color: labelColor(pred.true_label, classNames) }}>{pred.true_label}</span>
      <span className="text-slate-500"> → </span>
      <span style={{ color: labelColor(pred.predicted_label, classNames) }}>
        {pred.predicted_label}
      </span>
    </>
  )
}

const ITEMS_PER_PAGE = 24

export function EvaluationResults({ projectId, result }: Props) {
  const [filter, setFilter] = useState<PredFilter>('wrong')
  const [page, setPage] = useState(0)
  const [openPath, setOpenPath] = useState<string | null>(null)

  const predictions = result.predictions
  const wrongCount = useMemo(() => predictions.filter((p) => !p.correct).length, [predictions])
  const correctCount = predictions.length - wrongCount

  const filtered = useMemo(() => {
    if (filter === 'wrong') return predictions.filter((p) => !p.correct)
    if (filter === 'correct') return predictions.filter((p) => p.correct)
    return predictions
  }, [predictions, filter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const paged = filtered.slice(currentPage * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE)

  const openIndex = openPath ? filtered.findIndex((p) => p.path === openPath) : -1
  const openPred = openIndex >= 0 ? filtered[openIndex] : null

  // ikuti navigasi Sebelumnya/Berikutnya di modal walau lompat ke halaman lain
  useEffect(() => {
    if (openIndex < 0) return
    const targetPage = Math.floor(openIndex / ITEMS_PER_PAGE)
    setPage(targetPage)
  }, [openIndex])

  function changeFilter(next: PredFilter) {
    setFilter(next)
    setPage(0)
    setOpenPath(null)
  }

  return (
    <div>
      <p className="mb-3 text-xs text-slate-500">
        {result.num_images} gambar test · label: {result.class_names.join(', ')}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METRICS.map((m) => (
          <div key={m.key} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{m.label}</p>
            <p className="mt-1 font-mono text-lg" style={{ color: m.color }}>
              {(result[m.key] as number).toFixed(3)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-slate-800 pt-4">
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Hasil per-gambar:
          </span>
          <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => changeFilter('wrong')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                filter === 'wrong' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Salah ({wrongCount})
            </button>
            <button
              type="button"
              onClick={() => changeFilter('correct')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                filter === 'correct' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Benar ({correctCount})
            </button>
            <button
              type="button"
              onClick={() => changeFilter('all')}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                filter === 'all' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Semua ({predictions.length})
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500">
            {filter === 'wrong'
              ? 'Tidak ada prediksi yang salah — model benar di semua gambar test.'
              : 'Tidak ada gambar untuk filter ini.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-8">
              {paged.map((pred) => (
                <PredictionCard
                  key={pred.path}
                  projectId={projectId}
                  pred={pred}
                  classNames={result.class_names}
                  onClick={() => setOpenPath(pred.path)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-3 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Sebelumnya
                </button>
                <span className="text-xs text-slate-500">
                  Halaman {currentPage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={currentPage >= totalPages - 1}
                  className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {openPred && (
        <ImageModal
          src={api.splitTestImageUrl(projectId, openPred.path)}
          editable={false}
          badge={{
            text: openPred.correct ? 'Benar' : 'Salah',
            tone: openPred.correct ? 'success' : 'danger',
          }}
          labelBadge={<LabelBadgeContent pred={openPred} classNames={result.class_names} />}
          labelBadgeBg={
            openPred.correct ? hexToRgba(labelColor(openPred.true_label, result.class_names), 0.22) : undefined
          }
          caption={`${openPred.path} · Asli: ${openPred.true_label} · Prediksi: ${
            openPred.predicted_label
          } (${(openPred.confidence * 100).toFixed(1)}% yakin) · ${openPred.correct ? 'Benar' : 'Salah'}`}
          onClose={() => setOpenPath(null)}
          onPrev={() => setOpenPath(filtered[openIndex - 1].path)}
          onNext={() => setOpenPath(filtered[openIndex + 1].path)}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < filtered.length - 1}
        />
      )}
    </div>
  )
}

function PredictionCard({
  projectId,
  pred,
  classNames,
  onClick,
}: {
  projectId: string
  pred: TestPrediction
  classNames: string[]
  onClick: () => void
}) {
  const labelBg = pred.correct
    ? hexToRgba(labelColor(pred.true_label, classNames), 0.22)
    : 'rgba(2, 6, 23, 0.8)'

  return (
    <div
      className={`overflow-hidden rounded-md border bg-slate-950 ${
        pred.correct ? 'border-slate-800' : 'border-red-900'
      }`}
    >
      <button type="button" onClick={onClick} className="block w-full text-left">
        <div className="relative aspect-square overflow-hidden bg-black">
          <img
            src={api.splitTestImageUrl(projectId, pred.path)}
            alt={pred.path}
            loading="lazy"
            className="h-full w-full object-cover transition hover:opacity-80"
          />
          <span
            style={{ backgroundColor: labelBg }}
            className="absolute left-1 top-1 max-w-[calc(100%-2.5rem)] truncate rounded px-1.5 py-0.5 text-[9px] font-medium"
          >
            <LabelBadgeContent pred={pred} classNames={classNames} />
          </span>
          <span
            className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
              pred.correct ? 'bg-emerald-950/90 text-emerald-400' : 'bg-red-950/90 text-red-400'
            }`}
          >
            {pred.correct ? 'Benar' : 'Salah'}
          </span>
        </div>
        <div className="space-y-0.5 px-1.5 py-1">
          <p className="truncate text-[10px] text-slate-500">
            Asli: <span className="text-slate-300">{pred.true_label}</span>
          </p>
          <p className="truncate text-[10px] text-slate-500">
            Prediksi:{' '}
            <span className={pred.correct ? 'text-emerald-400' : 'text-red-400'}>
              {pred.predicted_label}
            </span>
          </p>
          <p className="font-mono text-[9px] text-slate-600">{(pred.confidence * 100).toFixed(1)}% yakin</p>
        </div>
      </button>
    </div>
  )
}
