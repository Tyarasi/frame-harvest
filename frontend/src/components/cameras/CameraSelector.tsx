import type { Camera } from '../../api'
import { PowerIcon } from '../ui/icons'
import { StatusBadge } from '../ui/StatusBadge'

interface Props {
  cameras: Camera[]
  selectedId: string
  onSelect: (id: string) => void
  onToggleStream: () => void
  toggling: boolean
}

export function CameraSelector({
  cameras,
  selectedId,
  onSelect,
  onToggleStream,
  toggling,
}: Props) {
  const selected = cameras.find((c) => c.id === selectedId)
  const active = selected?.active ?? false

  return (
    <div className="flex items-center gap-3">
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
      >
        {cameras.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {selected && <StatusBadge status={selected.status} />}
      <button
        type="button"
        onClick={onToggleStream}
        disabled={toggling || !selected}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
          active
            ? 'border-red-900 text-red-400 hover:bg-red-950'
            : 'border-emerald-900 text-emerald-400 hover:bg-emerald-950'
        }`}
      >
        <PowerIcon className="h-3.5 w-3.5" />
        {active ? 'Matikan Stream' : 'Aktifkan Stream'}
      </button>
    </div>
  )
}
