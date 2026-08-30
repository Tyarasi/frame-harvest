import { useEffect, useRef, useState } from 'react'
import { api, type YoloMetricPoint, type YoloTrainingStatus } from '../api'
import { MetricsChart, type ChartSeries } from './MetricsChart'

const LOSS_SERIES: ChartSeries[] = [
  { key: 'box_loss', label: 'Box Loss', color: '#3987e5' },
  { key: 'cls_loss', label: 'Class Loss', color: '#d95926' },
  { key: 'dfl_loss', label: 'DFL Loss', color: '#199e70' },
]

const METRIC_SERIES: ChartSeries[] = [
  { key: 'precision', label: 'Precision', color: '#d95926' },
  { key: 'recall', label: 'Recall', color: '#199e70' },
  { key: 'map50', label: 'mAP50', color: '#3987e5' },
  { key: 'map50_95', label: 'mAP50-95', color: '#c98500' },
]

interface Props {
  projectId: string
}

const TERMINAL_STATUSES = new Set(['finished', 'stopped', 'error'])

// Mirror TrainingRunner.tsx (classifier ResNet), tapi untuk metrik deteksi
// YOLO — 3 loss terpisah (box/class/dfl, bukan 1 loss tunggal) dan
// precision/recall/mAP alih-alih accuracy/F1. Stop di sini BEST-EFFORT
// berhenti di batas epoch terdekat (bukan per-batch) — sudah diverifikasi
// langsung lewat tes nyata, ultralytics tidak expose hook stop per-batch
// yang aman lintas versi seperti loop PyTorch manual training ResNet.
export function YoloTrainingRunner({ projectId }: Props) {
  const [status, setStatus] = useState<YoloTrainingStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  function reloadStatus() {
    if (!projectId) return
    api
      .getYoloTrainingRunStatus(projectId)
      .then((s) => {
        setStatus(s)
        setError(null)
        if (TERMINAL_STATUSES.has(s.status)) setPolling(false)
        else if (s.status === 'running') setPolling(true)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat status training'))
  }

  useEffect(() => {
    setPolling(false)
    reloadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!polling) {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    if (pollRef.current === null) {
      pollRef.current = window.setInterval(reloadStatus, 1500)
    }
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling])

  async function handleStart() {
    if (!projectId) return
    setStarting(true)
    setError(null)
    try {
      await api.startYoloTrainingRun(projectId)
      setPolling(true)
      reloadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memulai training')
    } finally {
      setStarting(false)
    }
  }

  async function handleStop() {
    if (!projectId) return
    await api.stopYoloTrainingRun(projectId)
    reloadStatus()
  }

  const history = status?.history ?? []
  const latest: YoloMetricPoint | undefined = history[history.length - 1]
  const isRunning = status?.status === 'running'
  const progressPct =
    status && status.total_epochs > 0 ? Math.round((status.epoch / status.total_epochs) * 100) : 0

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleStart}
          disabled={starting || isRunning || !projectId}
          className="rounded-lg border border-blue-900 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? 'Sedang berjalan…' : 'Mulai Training'}
        </button>
        {isRunning && (
          <button
            type="button"
            onClick={handleStop}
            className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900"
          >
            Batalkan Training
          </button>
        )}
        {status && status.total_epochs > 0 && (
          <span className="text-xs text-slate-400">
            Epoch {status.epoch} / {status.total_epochs} ({progressPct}%)
            {status.status === 'finished' && ' — selesai'}
            {status.status === 'stopped' && ' — dihentikan (di batas epoch terdekat)'}
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
        {status?.error && <span className="text-xs text-red-400">{status.error}</span>}
      </div>

      {status && status.total_epochs > 0 && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      )}

      {latest && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METRIC_SERIES.map((s) => (
            <div key={s.key} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className="mt-1 font-mono text-lg" style={{ color: s.color }}>
                {latest[s.key as keyof YoloMetricPoint].toFixed(3)}
              </p>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 ? (
        <div className="space-y-6">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Precision / Recall / mAP50 / mAP50-95
            </p>
            <MetricsChart data={history} series={METRIC_SERIES} domainFloor={0} domainCeil={1} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Box / Class / DFL Loss
            </p>
            <MetricsChart data={history} series={LOSS_SERIES} domainFloor={0} yFormat={(v) => v.toFixed(2)} height={160} />
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Belum ada progress. Klik "Mulai Training" untuk mulai.</p>
      )}
    </div>
  )
}
