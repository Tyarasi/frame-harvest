import { useState } from 'react'
import { DatasetSplit } from './DatasetSplit'
import { DeviceBadge } from './DeviceBadge'
import { TestEvaluation } from './TestEvaluation'
import { TrainingRunner } from './TrainingRunner'
import { TrainingSetup } from './TrainingSetup'

interface Props {
  projectId: string
  projectName: string
}

type TrainingTab = 'split' | 'setup' | 'run' | 'evaluate'

const TABS: Array<{ key: TrainingTab; label: string }> = [
  { key: 'split', label: 'Split Dataset' },
  { key: 'setup', label: 'Setup Training' },
  { key: 'run', label: 'Training Run' },
  { key: 'evaluate', label: 'Evaluasi Test Set' },
]

// baca sub-tab aktif dari URL (?trainingTab=...) supaya refresh browser tidak
// selalu balik ke tab "Split Dataset" — sama seperti pola ?page= di App.tsx
function getInitialTab(): TrainingTab {
  const param = new URLSearchParams(window.location.search).get('trainingTab')
  const keys = TABS.map((t) => t.key) as string[]
  return keys.includes(param ?? '') ? (param as TrainingTab) : 'split'
}

export function TrainingPage({ projectId, projectName }: Props) {
  const [tab, setTabState] = useState<TrainingTab>(getInitialTab)

  function setTab(next: TrainingTab) {
    setTabState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('trainingTab', next)
    window.history.replaceState({}, '', url)
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Training
        </h3>
        <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-medium text-blue-300">
          Project aktif: {projectName || '(tidak ada)'}
        </span>
      </div>
      <p className="mb-4 -mt-2 text-xs text-slate-500">
        Semua langkah di bawah — split dataset, konfigurasi, dan run training — hanya berlaku
        untuk project <strong className="text-slate-300">{projectName}</strong>. Ganti project lewat
        dropdown di header kalau mau memproses project lain.
      </p>

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

      {tab === 'split' && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Split Dataset (Train / Val / Test)
          </h4>
          <DatasetSplit projectId={projectId} />
        </div>
      )}

      {tab === 'setup' && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Setup Training
          </h4>
          <TrainingSetup projectId={projectId} />
        </div>
      )}

      {tab === 'run' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Training Run
            </h4>
            <DeviceBadge />
          </div>
          <TrainingRunner projectId={projectId} />
        </div>
      )}

      {tab === 'evaluate' && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Evaluasi Test Set (Ukuran Akhir)
          </h4>
          <TestEvaluation projectId={projectId} />
        </div>
      )}
    </div>
  )
}
