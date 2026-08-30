// Badge kecil & konsisten di dekat tombol aksi berat — supaya konsekuensi
// klik kelihatan SEBELUM diklik, bukan sesudah. 3 makna tetap dipakai di
// seluruh app: aksi yang aman diulang (skip-unless-overwrite), aksi yang
// menimpa hasil sebelumnya (generate ulang dari nol), dan aksi permanen
// (hapus/reset, tidak bisa dibatalkan).
export type ActionBadgeKind = 'safe' | 'overwrite' | 'danger'

const STYLES: Record<ActionBadgeKind, string> = {
  safe: 'border-emerald-800 bg-emerald-950/50 text-emerald-400',
  overwrite: 'border-amber-800 bg-amber-950/50 text-amber-400',
  danger: 'border-red-800 bg-red-950/50 text-red-400',
}

const DEFAULT_LABEL: Record<ActionBadgeKind, string> = {
  safe: 'Aman diulang',
  overwrite: 'Menimpa hasil sebelumnya',
  danger: 'Permanen',
}

export function ActionBadge({ kind, label }: { kind: ActionBadgeKind; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${STYLES[kind]}`}
    >
      {label ?? DEFAULT_LABEL[kind]}
    </span>
  )
}
