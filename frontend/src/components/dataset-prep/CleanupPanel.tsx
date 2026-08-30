import { useEffect, useState } from 'react'
import { api, formatFileSize, type CleanupPreview } from '../../api'
import { ActionBadge } from '../ui/ActionBadge'
import { useConfirm } from '../ui/ConfirmProvider'
import { TrashIcon } from '../ui/icons'

interface Props {
  projectId: string
  projectName: string
  onCleaned?: () => void
  onDone?: () => void
}

// Aksi maintenance jarang-pakai — dipindah ke menu Pengaturan (bukan lagi
// inline di step BBox/Crop Persiapan Dataset) supaya tidak mengganggu alur
// kerja utama sehari-hari. Mandiri: cuma butuh projectId, mengurus load/save
// `retention_days` SENDIRI lewat partial update (lihat catatan di
// dataset_prep_config.py) — field lain punya PersiapanDatasetPhase, tidak
// saling menimpa walau dua-duanya menulis ke file config yang sama.
export function CleanupPanel({ projectId, projectName, onCleaned, onDone }: Props) {
  const confirm = useConfirm()
  const [retentionDays, setRetentionDays] = useState(14)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [preview, setPreview] = useState<CleanupPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  useEffect(() => {
    setConfigLoaded(false)
    if (!projectId) return
    api
      .getDatasetPrepConfig(projectId)
      .then((cfg) => setRetentionDays(cfg.retention_days))
      .catch(() => {})
      .finally(() => setConfigLoaded(true))
  }, [projectId])

  useEffect(() => {
    if (!projectId || !configLoaded) return
    const timer = setTimeout(() => {
      api.saveDatasetPrepConfig(projectId, { retention_days: retentionDays }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [projectId, configLoaded, retentionDays])

  useEffect(() => {
    if (!projectId || !configLoaded) return
    setResult(null)
    const timer = setTimeout(() => {
      api.previewCleanup(projectId, retentionDays).then(setPreview).catch(() => setPreview(null))
    }, 400)
    return () => clearTimeout(timer)
  }, [projectId, retentionDays, configLoaded])

  async function handleCleanup() {
    if (!preview || preview.count === 0) return
    const confirmed = await confirm({
      title: 'Bersihkan sample lama?',
      message:
        `Hapus PERMANEN ${preview.count} frame mentah (${formatFileSize(preview.total_bytes)}) ` +
        `yang lebih tua dari ${retentionDays} hari, di project "${projectName}"? Semuanya sudah pernah ` +
        'di-crop, jadi datanya tetap aman dalam bentuk crop — yang dihapus cuma frame mentahnya. ' +
        'Tindakan ini tidak bisa dibatalkan.',
      confirmLabel: 'Bersihkan Sekarang',
      danger: true,
    })
    if (!confirmed) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.runCleanup(projectId, retentionDays)
      setResult(`${res.deleted} frame dihapus, ${formatFileSize(res.freed_bytes)} ruang disk dibebaskan.`)
      setPreview({ count: 0, total_bytes: 0, by_label: {} })
      onCleaned?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membersihkan sample lama')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Bersihkan Sample Lama
        </h3>
        {onDone && (
          <button type="button" onClick={onDone} className="text-xs text-slate-500 hover:text-slate-300">
            Tutup
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Project aktif: <span className="text-slate-300">{projectName}</span>
        </p>
        <ActionBadge kind="danger" />
      </div>

      <p className="max-w-2xl text-xs text-slate-500">
        Hapus frame mentah di <code className="text-slate-400">sample/</code> yang{' '}
        <strong className="text-slate-400">sudah pernah di-crop</strong> DAN lebih tua dari ambang di
        bawah — datanya tetap aman dalam bentuk crop, cuma frame mentahnya yang dibuang supaya disk
        tidak terus penuh. Frame yang belum pernah di-crop TIDAK PERNAH ikut terhapus, seberapa pun
        tuanya.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Lebih tua dari (hari)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleCleanup}
          disabled={loading || !preview || preview.count === 0}
          className="flex items-center gap-1.5 rounded-lg border border-red-800 bg-red-950/40 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          {loading ? 'Menghapus…' : 'Bersihkan Sekarang'}
        </button>
        {preview && (
          <span className="text-xs text-slate-400">
            {preview.count === 0
              ? 'Tidak ada kandidat saat ini.'
              : `${preview.count} frame (${formatFileSize(preview.total_bytes)}) siap dibersihkan.`}
          </span>
        )}
      </div>

      {result && <p className="text-xs text-emerald-400">{result}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
