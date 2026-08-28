import { useEffect, useRef, useState } from 'react'
import { api, type TrainingMetricPoint, type TrainingStatus } from '../api'
import { MetricsChart, type ChartSeries } from './MetricsChart'

const METRIC_SERIES: ChartSeries[] = [
  { key: 'accuracy', label: 'Accuracy', color: '#3987e5' },
  { key: 'precision', label: 'Precision', color: '#d95926' },
  { key: 'recall', label: 'Recall', color: '#199e70' },
  { key: 'f1', label: 'F1', color: '#c98500' },
]

const LOSS_SERIES: ChartSeries[] = [{ key: 'loss', label: 'Loss', color: '#3987e5' }]

const METRIC_INFO: Array<{ key: string; label: string; color: string; meaning: string; impact: string }> = [
  {
    key: 'accuracy',
    label: 'Accuracy',
    color: '#3987e5',
    meaning:
      'Persentase total tebakan yang benar dari seluruh data validasi — baik "karyawan" maupun "bukan_karyawan" yang ditebak tepat.',
    impact:
      'Gampang dibaca tapi bisa menipu kalau jumlah 2 kelas timpang. Kalau 90% data adalah "karyawan", model yang selalu menebak "karyawan" pun sudah dapat accuracy 90% padahal tidak berguna sama sekali.',
  },
  {
    key: 'precision',
    label: 'Precision',
    color: '#d95926',
    meaning:
      'Dari semua crop yang ditebak model sebagai "karyawan", berapa persen yang memang benar karyawan.',
    impact:
      'Rendah = banyak false positive — orang yang bukan karyawan malah dianggap karyawan. Berbahaya kalau dipakai untuk kontrol akses, karena orang luar bisa lolos.',
  },
  {
    key: 'recall',
    label: 'Recall',
    color: '#199e70',
    meaning:
      'Dari semua karyawan asli di data, berapa persen yang berhasil dikenali model sebagai "karyawan".',
    impact:
      'Rendah = banyak false negative — karyawan asli malah tidak dikenali sistem, mengganggu operasional (mis. akses/notifikasi otomatis gagal jalan untuk orang yang sah).',
  },
  {
    key: 'f1',
    label: 'F1',
    color: '#c98500',
    meaning:
      'Rata-rata harmonis Precision dan Recall — 1 angka ringkas yang cuma tinggi kalau keduanya sama-sama bagus.',
    impact:
      'Dipakai sebagai patokan utama saat precision & recall harus sama-sama diperhatikan, karena menaikkan salah satu biasanya menurunkan yang lain — beda dari Accuracy yang bisa menipu di data timpang.',
  },
]

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
            <div key={s.key} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className="mt-1 font-mono text-lg" style={{ color: s.color }}>
                {latest[s.key as keyof TrainingMetricPoint].toFixed(3)}
              </p>
            </div>
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

          <details className="mt-5 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs">
            <summary className="cursor-pointer select-none font-medium text-slate-200">
              Apa artinya angka-angka ini &amp; dampaknya ke model?
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {METRIC_INFO.map((m) => (
                <div key={m.key} className="rounded-md border border-slate-600 bg-slate-800 p-2.5">
                  <p className="font-mono text-[11px] font-semibold" style={{ color: m.color }}>
                    {m.label}
                  </p>
                  <p className="mt-1 leading-snug text-slate-300">{m.meaning}</p>
                  <p className="mt-1.5 leading-snug text-slate-300">
                    <span className="font-medium text-slate-100">Dampak: </span>
                    {m.impact}
                  </p>
                </div>
              ))}
              <div className="rounded-md border border-slate-600 bg-slate-800 p-2.5">
                <p className="font-mono text-[11px] font-semibold text-blue-400">Loss</p>
                <p className="mt-1 leading-snug text-slate-300">
                  Seberapa jauh prediksi model dari label sebenarnya secara matematis — bukan
                  persentase seperti 4 metrik lain.
                </p>
                <p className="mt-1.5 leading-snug text-slate-300">
                  <span className="font-medium text-slate-100">Dampak: </span>
                  Idealnya terus turun mendekati 0 tiap epoch; kalau berhenti turun (plateau)
                  berarti model sudah "mentok" belajar dari epoch &amp; data yang tersedia saat
                  ini.
                </p>
              </div>
            </div>
            <p className="mt-3 border-t border-slate-700 pt-3 leading-snug text-slate-300">
              Precision dan Recall biasanya tarik-menarik — menaikkan salah satu lewat pengaturan
              threshold cenderung menurunkan yang lain. Untuk kasus karyawan/lanyard ini: precision
              rendah berarti orang luar bisa lolos dianggap karyawan (risiko keamanan), sedangkan
              recall rendah berarti karyawan asli malah ditolak sistem (mengganggu operasional). F1
              dipakai supaya keduanya tetap jadi perhatian bersama, bukan cuma salah satu.
            </p>
          </details>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Belum ada progress. Klik "Mulai Training" untuk mulai.
        </p>
      )}
    </div>
  )
}
