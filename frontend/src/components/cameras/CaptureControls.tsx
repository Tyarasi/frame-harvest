import type { Camera } from '../../api'
import { useConfirm } from '../ui/ConfirmProvider'
import { CameraIcon, CloseIcon, PlayIcon, StopIcon } from '../ui/icons'
import { CameraTargets } from './CameraTargets'

export const RESOLUTION_PRESETS = [
  { label: 'Asli (native kamera)', value: '' },
  { label: '1920×1080 (Full HD)', value: '1920x1080' },
  { label: '1280×720 (HD)', value: '1280x720' },
  { label: '854×480 (480p)', value: '854x480' },
  { label: '640×360', value: '640x360' },
]

interface Props {
  cameras: Camera[]
  targets: Set<string>
  onToggleTarget: (id: string) => void
  runningIds: Set<string>
  hasTargets: boolean

  label: string
  onLabelChange: (label: string) => void
  existingLabels: string[]
  onDeleteSample: (name: string) => void
  onCapture: () => void
  capturing: boolean

  resolution: string
  onResolutionChange: (value: string) => void

  intervalSec: number
  onIntervalSecChange: (sec: number) => void
  intervalRunning: boolean
  onToggleInterval: () => void
}

export function CaptureControls({
  cameras,
  targets,
  onToggleTarget,
  runningIds,
  hasTargets,
  label,
  onLabelChange,
  existingLabels,
  onDeleteSample,
  onCapture,
  capturing,
  resolution,
  onResolutionChange,
  intervalSec,
  onIntervalSecChange,
  intervalRunning,
  onToggleInterval,
}: Props) {
  const confirm = useConfirm()

  async function handleDeleteSample(name: string) {
    const confirmed = await confirm({
      title: 'Hapus sample?',
      message: `Hapus sample "${name}" beserta SEMUA gambar dan crop di dalamnya? Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus Sample',
      danger: true,
    })
    if (confirmed) onDeleteSample(name)
  }

  return (
    <div className="space-y-3">
      <CameraTargets
        cameras={cameras}
        selected={targets}
        onToggle={onToggleTarget}
        runningIds={runningIds}
      />

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Resolusi simpan
        </label>
        <select
          value={resolution}
          onChange={(e) => onResolutionChange(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
        >
          {RESOLUTION_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Nama Sample
        </label>
        <input
          type="text"
          list="label-suggestions"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          placeholder="mis. motor, orang, mobil"
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <datalist id="label-suggestions">
          {existingLabels.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>

        {existingLabels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {existingLabels.map((l) => (
              <span
                key={l}
                className={`flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 text-[11px] transition ${
                  label === l
                    ? 'border-blue-600 bg-blue-950 text-blue-300'
                    : 'border-slate-700 text-slate-400'
                }`}
              >
                <button type="button" onClick={() => onLabelChange(l)} className="hover:underline">
                  {l}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSample(l)}
                  title={`Hapus sample "${l}"`}
                  className="rounded-full p-0.5 text-slate-500 hover:bg-red-950 hover:text-red-400"
                >
                  <CloseIcon className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {!label.trim() && (
          <p className="mt-1 text-xs text-amber-500">
            Kosong akan disimpan sebagai folder "tanpa_label".
          </p>
        )}
      </div>

      <button
        onClick={onCapture}
        disabled={capturing || !hasTargets}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CameraIcon className="h-4 w-4" />
        {capturing ? 'Menyimpan…' : 'Ambil Gambar'}
      </button>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          step={1}
          value={intervalSec}
          onChange={(e) => onIntervalSecChange(Number(e.target.value) || 1)}
          disabled={intervalRunning}
          className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
        <span className="text-sm text-slate-400">detik</span>
        <button
          onClick={onToggleInterval}
          disabled={!intervalRunning && !hasTargets}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
            intervalRunning
              ? 'bg-red-600 hover:bg-red-500'
              : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {intervalRunning ? (
            <>
              <StopIcon className="h-4 w-4" />
              Stop Interval
            </>
          ) : (
            <>
              <PlayIcon className="h-4 w-4" />
              Mulai Interval
            </>
          )}
        </button>
      </div>

      {!hasTargets && (
        <p className="text-xs text-slate-500">Pilih minimal satu kamera target.</p>
      )}
    </div>
  )
}
