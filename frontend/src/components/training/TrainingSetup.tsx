import { useEffect, useState } from 'react'
import { api, type TrainingConfig } from '../../api'

const DEFAULT_CONFIG: TrainingConfig = {
  backbone: 'resnet18',
  epochs: 15,
  batch_size: 32,
  learning_rate: 0.001,
  freeze_backbone: true,
}

interface Props {
  projectId: string
}

export function TrainingSetup({ projectId }: Props) {
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_CONFIG)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    api.getTrainingConfig(projectId).then(setConfig).catch(() => {})
  }, [projectId])

  function update<K extends keyof TrainingConfig>(key: K, value: TrainingConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    if (!projectId) return
    setSaving(true)
    setError(null)
    try {
      const result = await api.saveTrainingConfig(projectId, config)
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
        Atur konfigurasi training di sini — dipakai langsung oleh tombol "Mulai Training" di
        bagian bawah, persis apa adanya (epoch, batch size, learning rate, dst).
      </p>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Backbone</label>
          <select
            value={config.backbone}
            onChange={(e) => update('backbone', e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="resnet18">ResNet-18</option>
            <option value="resnet34">ResNet-34</option>
          </select>
        </div>

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
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Learning Rate
          </label>
          <input
            type="number"
            min={0}
            step={0.0001}
            value={config.learning_rate}
            onChange={(e) => update('learning_rate', Number(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-col justify-end">
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={config.freeze_backbone}
              onChange={(e) => update('freeze_backbone', e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            Freeze Backbone
          </label>
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
