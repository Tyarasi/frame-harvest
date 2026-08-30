import { useState, type FormEvent } from 'react'
import type { Camera } from '../../api'
import { useConfirm } from '../ui/ConfirmProvider'

interface Props {
  cameras: Camera[]
  onAdd: (name: string, rtspUrl: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDone?: () => void
}

export function ManageCameras({ cameras, onAdd, onDelete, onDone }: Props) {
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [rtspUrl, setRtspUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(cam: Camera) {
    const confirmed = await confirm({
      title: 'Hapus kamera?',
      message: `Hapus kamera "${cam.name}" dari daftar? Konfigurasi RTSP-nya akan hilang (data gambar yang sudah tersimpan tidak terpengaruh).`,
      confirmLabel: 'Hapus Kamera',
      danger: true,
    })
    if (confirmed) onDelete(cam.id)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onAdd(name, rtspUrl)
      setName('')
      setRtspUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah kamera')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Kelola Kamera
        </h3>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Tutup
          </button>
        )}
      </div>

      {cameras.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {cameras.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span className="text-slate-300">{c.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(c)}
                className="text-xs font-medium text-red-400 hover:text-red-300"
              >
                Hapus
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama kamera (mis. Kamera Depan)"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          value={rtspUrl}
          onChange={(e) => setRtspUrl(e.target.value)}
          placeholder="rtsp://user:password@ip:port/path"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Menambahkan…' : '+ Tambah Kamera'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
    </div>
  )
}
