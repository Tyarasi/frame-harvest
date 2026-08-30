import { CheckIcon, LockIcon } from './icons'

export interface PhaseDef {
  key: string
  label: string
}

interface Props {
  phases: PhaseDef[]
  active: string
  isCompleted: (key: string) => boolean
  disabledReason: (key: string) => string | null
  onSelect: (key: string) => void
}

// Navigasi TINGKAT 1 — 3 fase wajib berurutan (Capture -> Persiapan Dataset
// -> Training). Sengaja bukan tab datar biasa: fase yang sudah dilewati
// ditandai centang, fase yang syaratnya belum terpenuhi ditandai gembok +
// title (tooltip) alasannya — TIDAK disembunyikan total, supaya user tetap
// tahu langkah itu ada dan kenapa belum bisa diklik.
export function PhaseStepper({ phases, active, isCompleted, disabledReason, onSelect }: Props) {
  return (
    <div className="sticky top-14 z-40 h-12 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1600px] items-stretch px-6 lg:px-10">
        {phases.map((phase, i) => {
          const reason = disabledReason(phase.key)
          const disabled = reason !== null
          const isActive = phase.key === active
          const done = isCompleted(phase.key)

          return (
            <div key={phase.key} className="flex items-stretch">
              <button
                type="button"
                onClick={() => !disabled && onSelect(phase.key)}
                disabled={disabled}
                title={disabled ? reason : undefined}
                className={`flex items-center gap-2 border-b-2 px-4 text-sm font-medium transition ${
                  isActive
                    ? 'border-blue-500 text-slate-100'
                    : disabled
                      ? 'cursor-not-allowed border-transparent text-slate-600'
                      : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : done
                        ? 'bg-emerald-900 text-emerald-400'
                        : disabled
                          ? 'bg-slate-800 text-slate-600'
                          : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {disabled ? <LockIcon className="h-2.5 w-2.5" /> : done && !isActive ? (
                    <CheckIcon className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                {phase.label}
              </button>
              {i < phases.length - 1 && (
                <span className="mx-1 self-center text-slate-700" aria-hidden="true">
                  →
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
