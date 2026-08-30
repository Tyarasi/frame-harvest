import { useState } from 'react'
import type { DatasetTarget } from '../../api'
import { DeviceBadge } from '../ui/DeviceBadge'
import { TestEvaluation } from './TestEvaluation'
import { TrainingRunner } from './TrainingRunner'
import { TrainingSetup } from './TrainingSetup'
import { UploadEvaluate } from './UploadEvaluate'
import { YoloEvaluate } from './YoloEvaluate'
import { YoloTrainingRunner } from './YoloTrainingRunner'
import { YoloTrainingSetup } from './YoloTrainingSetup'

interface Props {
  projectId: string
  projectName: string
  datasetTarget: DatasetTarget
}

// "Split Dataset" TIDAK ada lagi di sini — itu sekarang jadi langkah penutup
// fase Persiapan Dataset (lihat PersiapanDatasetPhase.tsx, step "split"),
// menandakan dataset yang sudah displit adalah SYARAT masuk fase Training,
// bukan salah satu tab yang setara dengan Setup/Run/Evaluasi di dalamnya.
type TrainingTab = 'setup' | 'run' | 'evaluate'

const TABS: Array<{ key: TrainingTab; label: string }> = [
  { key: 'setup', label: 'Setup Training' },
  { key: 'run', label: 'Training Run' },
  { key: 'evaluate', label: 'Evaluasi Test Set' },
]

function getInitialTab(): TrainingTab {
  const param = new URLSearchParams(window.location.search).get('trainingTab')
  const keys = TABS.map((t) => t.key) as string[]
  return keys.includes(param ?? '') ? (param as TrainingTab) : 'setup'
}

// 2 mode halaman ini (KHUSUS resep resnet) — "train" (alur biasa: setup/
// run/evaluasi model yang dilatih di aplikasi ini) dan "upload" (uji cepat
// 1 file .pt dari LUAR tanpa training apapun di sini). Sengaja mode
// terpisah, bukan tab ke-4 yang disamakan dengan Setup/Run/Evaluate —
// karena ini bukan LANGKAH lanjutan dalam urutan yang sama, tapi CARA
// KERJA yang beda sama sekali. TIDAK ada untuk resep yolo — checkpoint
// ultralytics (.pt) formatnya beda total dari checkpoint classifier, belum
// ada jalur upload-uji buat itu.
type TrainingMode = 'train' | 'upload'

function getInitialMode(): TrainingMode {
  const param = new URLSearchParams(window.location.search).get('trainingMode')
  return param === 'upload' ? 'upload' : 'train'
}

const FLIP_MS = 280

export function TrainingPage({ projectId, projectName, datasetTarget }: Props) {
  const [tab, setTabState] = useState<TrainingTab>(getInitialTab)
  const [mode, setMode] = useState<TrainingMode>(getInitialMode)
  const [displayMode, setDisplayMode] = useState<TrainingMode>(getInitialMode)
  const [angle, setAngle] = useState(0)
  const [noTransition, setNoTransition] = useState(false)

  function setTab(next: TrainingTab) {
    setTabState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('trainingTab', next)
    window.history.replaceState({}, '', url)
  }

  function persistMode(next: TrainingMode) {
    const url = new URL(window.location.href)
    url.searchParams.set('trainingMode', next)
    window.history.replaceState({}, '', url)
  }

  // "coin flip": rotasi 0 -> 90deg (kartu jadi tipis menyamping, nyaris tak
  // terlihat) -> di titik itu konten ditukar SEKALIGUS sudut dilompat ke
  // -90deg tanpa transisi (tidak kelihatan karena kartu memang sedang tak
  // kelihatan) -> lanjut animasi -90 -> 0deg. Hasil akhirnya selalu balik
  // ke 0deg terbaca normal (tidak pernah "mentok" di 180deg terbalik/cermin).
  function flip(next: TrainingMode) {
    if (next === mode || angle !== 0) return
    setMode(next)
    persistMode(next)

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setDisplayMode(next)
      return
    }

    setAngle(90)
    window.setTimeout(() => {
      setDisplayMode(next)
      setNoTransition(true)
      setAngle(-90)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setNoTransition(false)
          setAngle(0)
        })
      })
    }, FLIP_MS)
  }

  const tabContent =
    tab === 'setup' ? (
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Setup Training
        </h4>
        {datasetTarget === 'yolo' ? (
          <YoloTrainingSetup projectId={projectId} />
        ) : (
          <TrainingSetup projectId={projectId} />
        )}
      </div>
    ) : tab === 'run' ? (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Training Run</h4>
          {datasetTarget !== 'yolo' && <DeviceBadge />}
        </div>
        {datasetTarget === 'yolo' ? (
          <YoloTrainingRunner projectId={projectId} />
        ) : (
          <TrainingRunner projectId={projectId} />
        )}
      </div>
    ) : (
      <div>
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Evaluasi Test Set (Ukuran Akhir)
        </h4>
        {datasetTarget === 'yolo' ? (
          <YoloEvaluate projectId={projectId} />
        ) : (
          <TestEvaluation projectId={projectId} />
        )}
      </div>
    )

  const tabStrip = (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-800">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setTab(t.key)}
          className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
            tab === t.key
              ? 'border-blue-500 text-slate-100'
              : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )

  // Resep yolo: belum punya mode "Uji Model Upload" (format checkpoint
  // ultralytics beda dari classifier), jadi tampilkan tab biasa langsung
  // tanpa mekanisme coin-flip sama sekali — tidak dipaksa dibungkus fitur
  // yang belum kompatibel.
  if (datasetTarget === 'yolo') {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Training
        </h3>
        <p className="mb-4 text-[11px] text-slate-600">
          {projectName} / Training / {TABS.find((t) => t.key === tab)?.label}
        </p>
        {tabStrip}
        {tabContent}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Training
          </h3>
          <p className="text-[11px] text-slate-600">
            {projectName} / Training / {mode === 'train' ? TABS.find((t) => t.key === tab)?.label : 'Uji Model Upload'}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-0.5">
          <button
            type="button"
            onClick={() => flip('train')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mode === 'train' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Mode Training
          </button>
          <button
            type="button"
            onClick={() => flip('upload')}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              mode === 'upload' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Uji Model Upload
          </button>
        </div>
      </div>

      <div style={{ perspective: '1600px' }}>
        <div
          style={{
            transform: `rotateY(${angle}deg)`,
            transition: noTransition ? 'none' : `transform ${FLIP_MS}ms ease-in-out`,
          }}
        >
          {displayMode === 'train' ? (
            <div>
              {tabStrip}
              {tabContent}
            </div>
          ) : (
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Uji Model dari File Upload
              </h4>
              <UploadEvaluate projectId={projectId} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
