import { useEffect, useRef, useState } from 'react'
import { api, type TrainingMetricPoint, type TrainingStatus } from '../../api'
import { MetricCard } from '../ui/MetricCard'
import { MetricsChart, type ChartSeries } from '../ui/MetricsChart'
import { MetricInfoDetails } from './MetricInfoDetails'
import { RESNET_LOSS_INFO, RESNET_METRIC_FOOTNOTE, RESNET_METRIC_INFO } from './metricInfo'

const METRIC_SERIES: ChartSeries[] = [
  { key: 'accuracy', label: 'Accuracy', color: '#3987e5' },
  { key: 'precision', label: 'Precision', color: '#d95926' },
  { key: 'recall', label: 'Recall', color: '#199e70' },
  { key: 'f1', label: 'F1', color: '#c98500' },
]

const LOSS_SERIES: ChartSeries[] = [{ key: 'loss', label: 'Loss', color: '#3987e5' }]

interface Props {
  projectId: string
}

const TERMINAL_STATUSES = new Set(['finished', 'stopped', 'error'])

export function TrainingRunner({ projectId }: Props) {
  const [status, setStatus] = useState<TrainingStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  function reloadStatus() {
    if (!projectId) return
    api
      .getTrainingRunStatus(projectId)
      .then((s) => {
        setStatus(s)
        setError(null)
        // "idle" sengaja tidak mengubah `polling` sama sekali: bisa berarti
        // "memang belum pernah dimulai" (mount awal, jangan mulai polling)
        // ATAU "baru saja start tapi thread belum sempat ganti status dari
        // idle ke running" (race condition) — kasus kedua sudah ditangani
        // langsung di handleStart lewat setPolling(true), jadi di sini cukup
        // dibiarkan supaya tidak menimpa balik jadi false.
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
      await api.startTrainingRun(projectId)
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
    await api.stopTrainingRun(projectId)
    reloadStatus()
  }

  const history = status?.history ?? []
  const latest: TrainingMetricPoint | undefined = history[history.length - 1]
  const isRunning = status?.status === 'running'
  const progressPct =
    status && status.total_epochs > 0
      ? Math.round((status.epoch / status.total_epochs) * 100)
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
            Epoch {status.epoch} / {status.total_epochs} ({progressPct}%)
            {status.status === 'finished' && ' — selesai'}
            {status.status === 'stopped' && ' — dihentikan'}
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
        {status?.error && <span className="text-xs text-red-400">{status.error}</span>}
      </div>

      {status && status.total_epochs > 0 && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${progressPct}%` }}
          />
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
              value={latest[s.key as keyof TrainingMetricPoint].toFixed(3)}
            />
          ))}
        </div>
      )}

      {history.length > 0 ? (
        <div>
          <div className="space-y-6">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Accuracy / Precision / Recall / F1
              </p>
              <MetricsChart data={history} series={METRIC_SERIES} domainFloor={0} domainCeil={1} />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Loss
              </p>
              <MetricsChart
                data={history}
                series={LOSS_SERIES}
                domainFloor={0}
                yFormat={(v) => v.toFixed(2)}
                height={160}
              />
            </div>
          </div>

          <MetricInfoDetails metrics={RESNET_METRIC_INFO} lossInfo={RESNET_LOSS_INFO} footnote={RESNET_METRIC_FOOTNOTE} />
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Belum ada progress. Klik "Mulai Training" untuk mulai.
        </p>
      )}
    </div>
  )
}
