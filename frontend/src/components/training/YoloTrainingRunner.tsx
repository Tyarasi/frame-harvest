import { useEffect, useRef, useState } from 'react'
import { api, type YoloMetricPoint, type YoloTrainingStatus } from '../../api'
import { MetricCard } from '../ui/MetricCard'
import { MetricsChart, type ChartSeries } from '../ui/MetricsChart'
import { MetricInfoDetails } from './MetricInfoDetails'
import { YOLO_LOSS_INFO, YOLO_METRIC_FOOTNOTE, YOLO_METRIC_INFO } from './metricInfo'

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
// precision/recall/mAP alih-alih accuracy/F1. Stop & progress di sini
// PER-BATCH (bukan cuma per-epoch) — diverifikasi langsung lewat tes nyata
// bahwa ultralytics punya callback on_train_batch_end yang cukup granular,
// jadi cancel responsif dalam hitungan batch (bukan nunggu 1 epoch penuh
// yang di CPU bisa puluhan detik-menit), dan progress bar tidak "macet di
// 0%" selama epoch pertama yang lama.
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
  // epoch YANG SEDANG JALAN (1-based) — status.epoch cuma nambah begitu 1
  // epoch SELESAI, jadi selama isRunning epoch ke-(status.epoch+1) itu yang
  // aktif sekarang
  const currentEpochNum = status ? Math.min(status.epoch + (isRunning ? 1 : 0), status.total_epochs) : 0
  const batchFraction =
    status && isRunning && status.total_batches > 0 ? status.batch / status.total_batches : 0
  const progressPct =
    status && status.total_epochs > 0
      ? Math.min(100, Math.round(((status.epoch + batchFraction) / status.total_epochs) * 100))
      : 0

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
            Epoch {currentEpochNum} / {status.total_epochs}
            {isRunning && status.total_batches > 0 && (
              <span className="text-slate-500">
                {' '}
                · batch {status.batch}/{status.total_batches}
              </span>
            )}{' '}
            ({progressPct}%)
            {status.status === 'finished' && ' — selesai'}
            {status.status === 'stopped' && ' — dihentikan'}
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
            <MetricCard
              key={s.key}
              label={s.label}
              color={s.color}
              direction="up"
              value={latest[s.key as keyof YoloMetricPoint].toFixed(3)}
            />
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
          <MetricInfoDetails metrics={YOLO_METRIC_INFO} lossInfo={YOLO_LOSS_INFO} footnote={YOLO_METRIC_FOOTNOTE} />
        </div>
      ) : isRunning ? (
        <p className="text-sm text-slate-500">
          Epoch pertama sedang berjalan — grafik loss/metrik muncul begitu epoch ini selesai. Progress
          batch di atas tetap ter-update live.
        </p>
      ) : (
        <p className="text-sm text-slate-500">Belum ada progress. Klik "Mulai Training" untuk mulai.</p>
      )}
    </div>
  )
}
