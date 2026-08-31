import { useEffect, useState } from 'react'
import { api, type YoloTrainingConfig } from '../../api'

const DEFAULT_CONFIG: YoloTrainingConfig = {
  epochs: 30,
  batch_size: 16,
  imgsz: 640,
  patience: 100,
  freeze: 0,
  mosaic: true,
  fliplr: 0.5,
  flipud: 0.0,
  degrees: 0.0,
  cache: 'none',
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

      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
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

      <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Efisiensi &amp; Stabilitas
        </h4>
        <p className="mb-3 text-[11px] text-slate-600">
          Penting buat dataset custom yang biasanya kecil (mis. 1 kelas "lanyard") dan training di
          CPU yang lambat.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Patience</label>
            <input
              type="number"
              min={0}
              value={config.patience}
              onChange={(e) => update('patience', Number(e.target.value) || 0)}
              title="Berhenti otomatis kalau mAP tidak membaik selama N epoch berturut-turut — hemat waktu di CPU"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Freeze Backbone</label>
            <input
              type="number"
              min={0}
              max={23}
              value={config.freeze}
              onChange={(e) => update('freeze', Math.max(0, Number(e.target.value) || 0))}
              title="Jumlah layer awal (bobot pretrained) yang dibekukan — 0 = tidak ada. Naikkan kalau dataset kecil, biar fitur pretrained tidak rusak."
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Cache Gambar</label>
            <select
              value={config.cache}
              onChange={(e) => update('cache', e.target.value as YoloTrainingConfig['cache'])}
              title="Simpan gambar di RAM/disk biar tidak dibaca ulang dari file tiap epoch — mempercepat training di CPU"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="none">Tidak (default)</option>
              <option value="ram">RAM (tercepat)</option>
              <option value="disk">Disk</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Augmentasi
        </h4>
        <p className="mb-3 text-[11px] text-slate-600">
          Variasi acak tiap epoch supaya model tidak cuma hafal gambar training — penting buat
          dataset kecil.
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              checked={config.mosaic}
              onChange={(e) => update('mosaic', e.target.checked)}
              className="h-3.5 w-3.5 accent-blue-600"
            />
            Mosaic (gabung 4 gambar)
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Flip Horizontal ({Math.round(config.fliplr * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.fliplr}
              onChange={(e) => update('fliplr', Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-medium text-slate-400"
              title='Sebaiknya biarkan 0% — objek di CCTV hampir tidak pernah muncul terbalik.'
            >
              Flip Vertikal ({Math.round(config.flipud * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.flipud}
              onChange={(e) => update('flipud', Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Rotasi (±{config.degrees}°)
            </label>
            <input
              type="range"
              min={0}
              max={45}
              step={1}
              value={config.degrees}
              onChange={(e) => update('degrees', Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
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
