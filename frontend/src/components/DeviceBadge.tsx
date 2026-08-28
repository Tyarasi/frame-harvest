import { useEffect, useState } from 'react'
import { api } from '../api'

export function DeviceBadge() {
  const [device, setDevice] = useState<'cpu' | 'gpu' | null>(null)

  useEffect(() => {
    api
      .getTrainingDevice()
      .then((d) => setDevice(d.device))
      .catch(() => {})
  }, [])

  if (!device) return null

  const isGpu = device === 'gpu'
  const dotColor = isGpu ? 'bg-emerald-400' : 'bg-amber-400'

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
        isGpu
          ? 'border-emerald-800 bg-emerald-950 text-emerald-400'
          : 'border-amber-800 bg-amber-950 text-amber-400'
      }`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColor}`} />
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColor}`} />
      </span>
      {device}
    </span>
  )
}
