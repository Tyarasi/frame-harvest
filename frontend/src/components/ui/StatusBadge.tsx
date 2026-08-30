function variant(status: string): { color: string; label: string } {
  if (status === 'OK') return { color: 'bg-emerald-500', label: 'OK' }
  if (status === 'Nonaktif') return { color: 'bg-slate-600', label: 'Nonaktif' }
  if (status.startsWith('Menyambung')) return { color: 'bg-amber-500', label: 'Menyambung' }
  return { color: 'bg-red-500', label: 'Error' }
}

export function StatusBadge({ status }: { status: string }) {
  const { color, label } = variant(status)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
