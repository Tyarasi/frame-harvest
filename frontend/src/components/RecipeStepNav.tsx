import type { RecipeStep } from '../recipes'
import { CheckIcon, LockIcon } from './icons'

interface Props {
  steps: RecipeStep[]
  active: string
  isDone: (id: string) => boolean
  disabledReason: (id: string) => string | null
  onSelect: (id: string) => void
}

// Navigasi TINGKAT 2 — langkah-langkah DI DALAM satu fase, dibaca dari resep
// aktif (recipes.ts). Sengaja dipisah visual dari PhaseStepper (skala lebih
// kecil, warna netral bukan biru) supaya user langsung bisa bedakan "ini
// fase" vs "ini langkah di dalam fase" tanpa perlu baca teks.
//
// Step biasa dirender sebagai SATU rangkaian bernomor+terhubung garis (bukan
// tab lepas-lepas) — ini rangkaian wajib berurutan menuju satu hasil. Step
// `isCloser` (mis. Split Dataset) dirender terpisah di sisi kanan dengan
// gaya beda, menandakan dia penutup fase / titik transisi ke fase berikutnya.
export function RecipeStepNav({ steps, active, isDone, disabledReason, onSelect }: Props) {
  const mainSteps = steps.filter((s) => !s.isCloser)
  const closerStep = steps.find((s) => s.isCloser)

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="flex flex-1 flex-wrap items-center gap-0 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
        {mainSteps.map((step, i) => {
          const reason = disabledReason(step.id)
          const disabled = reason !== null
          const isActive = step.id === active
          const done = isDone(step.id)

          return (
            <div key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => !disabled && onSelect(step.id)}
                disabled={disabled}
                title={disabled ? reason : step.description}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'bg-slate-700 text-slate-100'
                    : disabled
                      ? 'cursor-not-allowed text-slate-600'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                    isActive
                      ? 'bg-slate-100 text-slate-900'
                      : done
                        ? 'bg-emerald-900 text-emerald-400'
                        : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {disabled ? <LockIcon className="h-2.5 w-2.5" /> : done && !isActive ? (
                    <CheckIcon className="h-2.5 w-2.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                {step.shortLabel}
              </button>
              {i < mainSteps.length - 1 && (
                <span className="mx-0.5 text-slate-700" aria-hidden="true">
                  ·
                </span>
              )}
            </div>
          )
        })}
      </div>

      {closerStep && (
        <>
          <span className="text-slate-700" aria-hidden="true">
            ⇒
          </span>
          {(() => {
            const reason = disabledReason(closerStep.id)
            const disabled = reason !== null
            const isActive = closerStep.id === active
            return (
              <button
                type="button"
                onClick={() => !disabled && onSelect(closerStep.id)}
                disabled={disabled}
                title={disabled ? reason : closerStep.description}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'border-blue-600 bg-blue-950/50 text-blue-300'
                    : disabled
                      ? 'cursor-not-allowed border-slate-800 text-slate-600'
                      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {disabled && <LockIcon className="h-3 w-3" />}
                {closerStep.label}
              </button>
            )
          })()}
        </>
      )}
    </div>
  )
}
