import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { TrashIcon } from './icons'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm harus dipakai di dalam <ConfirmProvider>')
  return ctx
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  function settle(result: boolean) {
    setOptions(null)
    resolveRef.current?.(result)
    resolveRef.current = null
  }

  useEffect(() => {
    if (!options) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') settle(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {options && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2.5">
              {options.danger && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-950 text-red-400">
                  <TrashIcon className="h-4 w-4" />
                </span>
              )}
              <h3 className="text-sm font-semibold text-slate-100">
                {options.title ?? 'Konfirmasi'}
              </h3>
            </div>

            <p className="mb-5 whitespace-pre-line text-sm text-slate-400">{options.message}</p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => settle(false)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                {options.cancelLabel ?? 'Batal'}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                autoFocus
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
                  options.danger
                    ? 'bg-red-600 hover:bg-red-500'
                    : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {options.confirmLabel ?? 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
