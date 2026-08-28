import type { Camera } from '../api'
import { StatusBadge } from './StatusBadge'

interface Props {
  cameras: Camera[]
  selected: Set<string>
  onToggle: (id: string) => void
  runningIds: Set<string>
}

export function CameraTargets({ cameras, selected, onToggle, runningIds }: Props) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-400">
        Kamera target ({selected.size} dipilih)
      </p>
      <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-1.5">
        {cameras.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-slate-700/60"
          >
            <span className="flex min-w-0 items-center gap-2">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => onToggle(c.id)}
                className="h-3.5 w-3.5 shrink-0 accent-blue-600"
              />
              <span className="truncate text-slate-200">{c.name}</span>
              {runningIds.has(c.id) && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500"
                  title="Interval aktif"
                />
              )}
            </span>
            <span className="shrink-0">
              <StatusBadge status={c.status} />
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
