import type { Camera } from '../api'
import { StatusBadge } from './StatusBadge'

interface Props {
  cameras: Camera[]
  counts: Record<string, number>
  lastSaved: string | null
}

export function StatusPanel({ cameras, counts, lastSaved }: Props) {
  const labels = Object.entries(counts)

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
      {lastSaved && (
        <div className="rounded-lg bg-emerald-950 px-3 py-2 text-emerald-400">
          Tersimpan: <span className="font-mono">{lastSaved}</span>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Kamera
        </h3>
        <ul className="space-y-1.5">
          {cameras.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span className="text-slate-300">{c.name}</span>
              <StatusBadge status={c.status} />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Jumlah gambar per sample
        </h3>
        {labels.length === 0 ? (
          <p className="text-slate-500">Belum ada gambar tersimpan.</p>
        ) : (
          <ul className="space-y-1">
            {labels.map(([label, n]) => (
              <li key={label} className="flex items-center justify-between">
                <span className="font-mono text-slate-300">{label}</span>
                <span className="font-mono text-slate-500">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
