import { useEffect, useState } from 'react'
import { api, type YoloTrainingConfig } from '../api'

const DEFAULT_CONFIG: YoloTrainingConfig = {
  epochs: 30,
  batch_size: 16,
  imgsz: 640,
}

interface Props {
  projectId: string
}

export function YoloTrainingSetup({ projectId }: Props) {
  const [config, setConfig] = useState<YoloTrainingConfig>(DEFAULT_CONFIG)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    api.getYoloTrainingConfig(projectId).then(setConfig).catch(() => {})
  }, [projectId])

  function update<K extends keyof YoloTrainingConfig>(key: K, value: YoloTrainingConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      const result = await api.saveYoloTrainingConfig(projectId, config)
      setConfig(result)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan konfigurasi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-2xl text-xs text-slate-500">
        Fine-tune dari bobot <code>yolov8n.pt</code> bawaan aplikasi ini — dipakai langsung oleh
        tombol "Mulai Training" di bagian bawah.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Epochs</label>
          <input
            type="number"
            min={1}
            value={config.epochs}
            onChange={(e) => update('epochs', Number(e.target.value) || 1)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Batch Size</label>
          <input
            type="number"
            min={1}
            value={config.batch_size}
            onChange={(e) => update('batch_size', Number(e.target.value) || 1)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Ukuran Gambar (imgsz)</label>
          <input
            type="number"
            min={32}
            step={32}
            value={config.imgsz}
            onChange={(e) => update('imgsz', Number(e.target.value) || 32)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : 'Simpan Konfigurasi'}
        </button>

        {saved && <span className="text-xs text-emerald-400">Tersimpan.</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>
    </div>
  )
}
