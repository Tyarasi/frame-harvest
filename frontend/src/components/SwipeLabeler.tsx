import { useEffect, useRef, useState } from 'react'
import { api, type CropImage } from '../api'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

function filenameOf(path: string): string {
  return path.split('/').pop()!
}

const SWIPE_THRESHOLD = 100

interface Props {
  projectId: string
  crops: CropImage[]
  sample: string
  leftLabel: string
  rightLabel: string
  onAssigned: () => void
}

export function SwipeLabeler({
  projectId,
  crops,
  sample,
  leftLabel,
  rightLabel,
  onAssigned,
}: Props) {
  // sengaja cuma dipakai sebagai nilai awal (bukan di-resync tiap `crops`
  // berubah) — parent boleh refresh daftar crop di background (mis. setelah
  // assign) tanpa mengacak ulang antrean swipe yang sedang berjalan. Reset
  // yang "sah" terjadi lewat remount total pakai `key` di parent (ganti
  // sample/label), bukan lewat effect ini.
  const [queue, setQueue] = useState(crops)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState(false)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const startXRef = useRef(0)
  const currentImgRef = useRef<HTMLImageElement>(null)

  const current = queue[0]
  const next = queue[1]

  // ukuran kartu mengikuti aspect ratio ASLI gambar & mengisi sebanyak
  // mungkin ruang yang tersedia (bukan kotak tetap 288x384 seperti
  // sebelumnya) — crop yang kecil/portrait ikut membesar, bukan cuma
  // ditempatkan kecil di tengah kotak dengan bilah hitam di kanan-kiri.
  const cardStyle = naturalSize
    ? {
        width: `min(70vw, calc(70vh * ${naturalSize.w / naturalSize.h}))`,
        height: `min(70vh, calc(70vw / ${naturalSize.w / naturalSize.h}))`,
      }
    : { width: '18rem', height: '24rem' }

  // gambar crop ini sering sudah ke-cache browser (baru saja dilihat di
  // Galeri) — kalau begitu, event "load" bisa sudah kejadian SEBELUM React
  // sempat pasang listener onLoad, jadi onLoad tidak pernah terpanggil dan
  // ukuran asli tidak pernah ke-set. Effect ini jadi jaring pengaman: tiap
  // kartu berganti, cek langsung `.complete` di img yang sudah terpasang —
  // kalau sudah true (dari cache) ambil ukurannya saat itu juga, tanpa
  // nunggu event "load" yang mungkin tidak pernah datang lagi. PENTING:
  // pengecekan ini lewat effect (jalan sekali tiap `current.path` ganti),
  // BUKAN lewat ref callback baru tiap render — versi ref callback
  // sebelumnya bikin infinite loop (ref callback baru tiap render → React
  // panggil ulang terus → setState terus → render lagi → ...).
  useEffect(() => {
    setNaturalSize(null)
    const img = currentImgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
  }, [current?.path])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (pending || !current) return
    startXRef.current = e.clientX
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return
    setDragX(e.clientX - startXRef.current)
  }

  async function onPointerUp() {
    if (!dragging) return
    setDragging(false)
    if (dragX > SWIPE_THRESHOLD) {
      await commit(rightLabel)
    } else if (dragX < -SWIPE_THRESHOLD) {
      await commit(leftLabel)
    } else {
      setDragX(0)
    }
  }

  async function commit(label: string) {
    if (!current || pending) return
    setPending(true)
    try {
      await api.assignLabel(projectId, label, sample, [filenameOf(current.path)])
      setQueue((q) => q.slice(1))
      onAssigned()
    } finally {
      setDragX(0)
      setPending(false)
    }
  }

  function skip() {
    if (pending) return
    setQueue((q) => q.slice(1))
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <p className="text-sm text-slate-400">
          Semua crop di sample ini sudah diproses untuk sesi swipe ini.
        </p>
        <p className="text-xs text-slate-500">
          Ganti sample lain, atau muat ulang halaman untuk mengulang dari awal.
        </p>
      </div>
    )
  }

  const rotation = dragX / 20
  const badgeOpacity = Math.min(Math.abs(dragX) / 150, 1)

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <p className="text-xs text-slate-500">{queue.length} crop tersisa</p>

      <div
        className="relative touch-none select-none"
        style={cardStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {next && (
          <img
            src={api.sampleImageUrl(projectId, next.path)}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full scale-[0.96] rounded-xl bg-black object-contain opacity-40"
          />
        )}

        <div
          className="absolute inset-0 cursor-grab overflow-hidden rounded-xl border border-slate-700 bg-slate-950 active:cursor-grabbing"
          style={{
            transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
            transition: dragging ? 'none' : 'transform 0.25s ease',
          }}
        >
          <img
            ref={currentImgRef}
            src={api.sampleImageUrl(projectId, current.path)}
            alt={current.path}
            draggable={false}
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget
              setNaturalSize({ w: naturalWidth, h: naturalHeight })
            }}
            className="h-full w-full bg-black object-contain"
          />
          {dragX > 20 && (
            <span
              className="absolute right-3 top-3 rounded border-2 border-emerald-400 px-2 py-1 text-sm font-bold uppercase text-emerald-400"
              style={{ opacity: badgeOpacity }}
            >
              {rightLabel}
            </span>
          )}
          {dragX < -20 && (
            <span
              className="absolute left-3 top-3 rounded border-2 border-red-400 px-2 py-1 text-sm font-bold uppercase text-red-400"
              style={{ opacity: badgeOpacity }}
            >
              {leftLabel}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => commit(leftLabel)}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          {leftLabel}
        </button>
        <button
          type="button"
          onClick={skip}
          disabled={pending}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Lewati
        </button>
        <button
          type="button"
          onClick={() => commit(rightLabel)}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-900 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rightLabel}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="max-w-xs text-center text-[11px] text-slate-600">
        Seret kartu ke kiri untuk "{leftLabel}", ke kanan untuk "{rightLabel}" — atau pakai
        tombol di bawah.
      </p>
    </div>
  )
}
