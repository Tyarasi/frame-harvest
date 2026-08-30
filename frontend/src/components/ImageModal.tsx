import { useEffect, useRef, useState } from 'react'
import { api, type YoloBox } from '../api'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CollapseIcon,
  ExpandIcon,
  PencilIcon,
  TrashIcon,
} from './icons'

interface Props {
  src: string
  annotationUrl?: string
  projectId?: string
  label?: string
  filename?: string
  caption: string
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  hasPrev: boolean
  hasNext: boolean
  onDelete?: () => void
  onSaved?: () => void
  editable?: boolean
  deleteLabel?: string
  // badge status generik (mis. "Benar"/"Salah" di TestEvaluation) — ikut
  // mewarnai border gambar, sama seperti kartu thumbnail sebelum diklik
  badge?: { text: string; tone: 'success' | 'danger' }
  // badge di pojok kiri, terpisah dari `badge` di kanan — dipakai untuk
  // info tambahan yang bukan status benar/salah (mis. nama label). Isi
  // (ReactNode) boleh sudah membawa warnanya sendiri per-kata (lihat
  // LabelBadgeContent di TestEvaluation.tsx); labelBadgeBg cuma warna latar
  // pill-nya, default abu netral kalau tidak diisi.
  labelBadge?: React.ReactNode
  labelBadgeBg?: string
}

// Representasi internal saat mengedit: dua titik sudut, bukan pusat+ukuran —
// jauh lebih gampang dipakai untuk hitung drag/resize dibanding format YOLO.
interface CornerBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

const MIN_SIZE = 0.01

function toYolo(box: CornerBox): YoloBox {
  return {
    x: (box.x1 + box.x2) / 2,
    y: (box.y1 + box.y2) / 2,
    w: box.x2 - box.x1,
    h: box.y2 - box.y1,
  }
}

function fromYolo(box: YoloBox): CornerBox {
  return {
    x1: box.x - box.w / 2,
    y1: box.y - box.h / 2,
    x2: box.x + box.w / 2,
    y2: box.y + box.h / 2,
  }
}

function parseYoloText(text: string): CornerBox[] {
  return text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [, x, y, w, h] = line.trim().split(/\s+/).map(Number)
      return { x, y, w, h }
    })
    .filter((b) => [b.x, b.y, b.w, b.h].every((n) => Number.isFinite(n)))
    .map(fromYolo)
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

type DragMode = 'move' | 'resize' | 'create'

interface DragState {
  mode: DragMode
  index: number
  startX: number
  startY: number
  origBox: CornerBox
}

export function ImageModal({
  src,
  annotationUrl,
  projectId,
  label,
  filename,
  caption,
  onClose,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onDelete,
  onSaved,
  editable = true,
  deleteLabel = 'Hapus',
  badge,
  labelBadge,
  labelBadgeBg = 'rgba(2, 6, 23, 0.8)',
}: Props) {
  const [boxes, setBoxes] = useState<CornerBox[]>([])
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)
  const [availableSize, setAvailableSize] = useState<{ w: number; h: number } | null>(null)
  const imgWrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const canEdit = editable && Boolean(projectId && label && filename)
  // Full Frame (ada bbox) sengaja TIDAK dibesarkan/dihitung dinamis — bbox
  // butuh wrapper yang presisi pas dengan gambar, dan cara paling aman untuk
  // itu adalah biarkan browser sendiri yang menghitung lewat max-height +
  // object-contain (wrapper otomatis menyusut pas ukuran gambar, nol
  // kalkulasi manual, nol risiko geser). Crop (tanpa bbox) tetap boleh
  // membesar mengisi jendela karena tidak ada overlay yang bisa salah posisi.
  const hasBboxOverlay = Boolean(annotationUrl)

  // batal status konfirmasi hapus & reset ukuran asli kalau pindah gambar.
  // Sekaligus jaring pengaman cache: gambar ini sering sudah ke-cache
  // browser (mis. baru dilihat di Galeri) — kalau begitu event "load" bisa
  // sudah kejadian SEBELUM React sempat pasang listener onLoad, jadi
  // onLoad tidak pernah terpanggil. Cek `.complete` langsung di sini (jalan
  // sekali tiap `src` ganti lewat effect, BUKAN ref callback baru tiap
  // render — itu pernah bikin infinite loop, lihat catatan di
  // SwipeLabeler.tsx).
  useEffect(() => {
    setConfirmingDelete(false)
    setNaturalSize(null)
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
  }, [src])

  // ukur ruang yang beneran tersedia buat gambar — CUMA relevan untuk crop
  // (tanpa bbox) yang boleh membesar mengisi ruang. Full Frame (ada bbox)
  // sengaja dilewati total (lihat `hasBboxOverlay` di atas), jadi tidak
  // perlu observer ini jalan sama sekali di kasus itu.
  useEffect(() => {
    if (hasBboxOverlay) return
    const row = rowRef.current
    if (!row) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      setAvailableSize({ w: width, h: height })
    })
    observer.observe(row)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (editing) {
        // selagi koreksi: Enter = simpan, Escape = batal (bukan tutup/pindah gambar)
        if (e.key === 'Enter' && !saving) {
          e.preventDefault()
          handleSave()
        } else if (e.key === 'Escape' && !saving) {
          e.preventDefault()
          handleCancelEdit()
        }
        return
      }
      // status menunggu konfirmasi hapus: Enter = eksekusi, Escape = batal
      // (bukan tutup modal), tombol lain dianggap membatalkan konfirmasi
      if (confirmingDelete) {
        if (e.key === 'Enter') {
          e.preventDefault()
          setConfirmingDelete(false)
          onDelete?.()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setConfirmingDelete(false)
        } else {
          setConfirmingDelete(false)
        }
        return
      }

      if (e.key === 'Escape') {
        if (fullscreen) setFullscreen(false)
        else onClose()
      }
      if (e.key === 'ArrowLeft' && hasPrev) onPrev?.()
      if (e.key === 'ArrowRight' && hasNext) onNext?.()
      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setFullscreen((f) => !f)
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'e' && canEdit) {
        e.preventDefault()
        setEditing(true)
      }
      // Ctrl+D = minta konfirmasi hapus dulu, Enter berikutnya baru benar-benar hapus
      if (e.ctrlKey && e.key.toLowerCase() === 'd' && onDelete) {
        e.preventDefault()
        setConfirmingDelete(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    onClose,
    onPrev,
    onNext,
    hasPrev,
    hasNext,
    editing,
    canEdit,
    saving,
    boxes,
    fullscreen,
    confirmingDelete,
    label,
    filename,
    annotationUrl,
    onDelete,
  ])

  useEffect(() => {
    setBoxes([])
    setEditing(false)
    if (!annotationUrl) return
    let cancelled = false
    // no-store: file .txt ini sering diedit (koreksi manual), bukan aset
    // statis yang aman di-cache — backend tidak kirim Cache-Control, jadi
    // browser bisa pakai heuristic caching dan balikin isi LAMA (sebelum
    // koreksi) tanpa sempat cek ulang ke server kalau tidak dipaksa no-store.
    fetch(annotationUrl, { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : ''))
      .then((text) => {
        if (!cancelled) setBoxes(parseYoloText(text))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [annotationUrl])

  function getRelPos(e: PointerEvent): { x: number; y: number } | null {
    const rect = imgWrapRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    return {
      x: clamp01((e.clientX - rect.left) / rect.width),
      y: clamp01((e.clientY - rect.top) / rect.height),
    }
  }

  useEffect(() => {
    if (!dragState) return
    const ds = dragState

    function onMove(e: PointerEvent) {
      const pos = getRelPos(e)
      if (!pos) return

      setBoxes((prev) => {
        const next = [...prev]
        const { mode, index, startX, startY, origBox } = ds

        if (mode === 'move') {
          const w = origBox.x2 - origBox.x1
          const h = origBox.y2 - origBox.y1
          const x1 = Math.min(Math.max(origBox.x1 + (pos.x - startX), 0), 1 - w)
          const y1 = Math.min(Math.max(origBox.y1 + (pos.y - startY), 0), 1 - h)
          next[index] = { x1, y1, x2: x1 + w, y2: y1 + h }
        } else if (mode === 'resize') {
          next[index] = {
            x1: origBox.x1,
            y1: origBox.y1,
            x2: Math.max(pos.x, origBox.x1 + MIN_SIZE),
            y2: Math.max(pos.y, origBox.y1 + MIN_SIZE),
          }
        } else if (mode === 'create') {
          next[index] = {
            x1: Math.min(startX, pos.x),
            y1: Math.min(startY, pos.y),
            x2: Math.max(startX, pos.x),
            y2: Math.max(startY, pos.y),
          }
        }
        return next
      })
    }

    function onUp() {
      if (ds.mode === 'create') {
        setBoxes((prev) => {
          const box = prev[ds.index]
          if (!box || box.x2 - box.x1 < MIN_SIZE || box.y2 - box.y1 < MIN_SIZE) {
            return prev.filter((_, i) => i !== ds.index)
          }
          return prev
        })
      }
      setDragState(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragState])

  function handleBackgroundPointerDown(e: React.PointerEvent) {
    if (!editing) return
    const pos = getRelPos(e.nativeEvent)
    if (!pos) return
    const box = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y }
    setBoxes((prev) => {
      setDragState({ mode: 'create', index: prev.length, startX: pos.x, startY: pos.y, origBox: box })
      return [...prev, box]
    })
  }

  function handleBoxPointerDown(e: React.PointerEvent, index: number) {
    if (!editing) return
    e.stopPropagation()
    const pos = getRelPos(e.nativeEvent)
    if (!pos) return
    setDragState({ mode: 'move', index, startX: pos.x, startY: pos.y, origBox: boxes[index] })
  }

  function handleResizePointerDown(e: React.PointerEvent, index: number) {
    e.stopPropagation()
    setDragState({ mode: 'resize', index, startX: 0, startY: 0, origBox: boxes[index] })
  }

  function deleteBox(index: number) {
    setBoxes((prev) => prev.filter((_, i) => i !== index))
    setHoveredIndex(null)
  }

  async function handleSave() {
    if (!projectId || !label || !filename) return
    setSaving(true)
    try {
      await api.saveBoxes(projectId, label, filename, boxes.map(toYolo))
      setEditing(false)
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelEdit() {
    setEditing(false)
    if (!annotationUrl) {
      setBoxes([])
      return
    }
    const text = await fetch(annotationUrl, { cache: 'no-store' })
      .then((res) => (res.ok ? res.text() : ''))
      .catch(() => '')
    setBoxes(parseYoloText(text))
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/85 ${
        fullscreen ? 'p-1' : 'p-4'
      }`}
      onClick={editing ? undefined : onClose}
    >
      <div
        className={`flex flex-col gap-2 ${fullscreen ? 'h-[96vh] w-full max-w-none' : 'h-[88vh] max-w-5xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 text-sm text-slate-300">
          <span>
            {caption}
            {boxes.length > 0 && (
              <span className="ml-2 text-emerald-400">· {boxes.length} bbox person</span>
            )}
          </span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setFullscreen((f) => !f)}
              title={fullscreen ? 'Keluar Fullscreen (F)' : 'Fullscreen (F)'}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              {fullscreen ? (
                <CollapseIcon className="h-3.5 w-3.5" />
              ) : (
                <ExpandIcon className="h-3.5 w-3.5" />
              )}
            </button>
            {editing ? (
              <>
                <span className="self-center text-xs text-amber-500">
                  Klik-seret area kosong = tambah box · seret box = pindah · seret titik
                  pojok = ubah ukuran · Enter = simpan · Esc = batal
                </span>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </button>
              </>
            ) : confirmingDelete ? (
              <>
                <span className="self-center text-xs text-red-400">
                  {deleteLabel} gambar ini? Enter = konfirmasi · Esc = batal
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDelete(false)
                    onDelete?.()
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-700 bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Konfirmasi {deleteLabel}
                </button>
              </>
            ) : (
              <>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    title="Koreksi BBOX (Ctrl+E)"
                    className="flex items-center gap-1.5 rounded-lg border border-blue-900 px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-blue-950"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                    Koreksi BBOX
                    <span className="text-blue-600">Ctrl+E</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={onDelete}
                    title={`${deleteLabel} — Ctrl+D lalu Enter untuk konfirmasi lewat keyboard`}
                    className="flex items-center gap-1.5 rounded-lg border border-red-900 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-950"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                    {deleteLabel}
                    <span className="text-red-700">Ctrl+D</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>

        <div ref={rowRef} className="relative flex min-h-0 flex-1 items-center justify-center">
          {hasPrev && !editing && (
            <button
              type="button"
              onClick={onPrev}
              aria-label="Gambar sebelumnya"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          )}

          <div
            ref={imgWrapRef}
            className={`relative ${editing ? 'cursor-crosshair' : ''}`}
            onPointerDown={handleBackgroundPointerDown}
            style={(() => {
              // Full Frame (ada bbox): JANGAN hitung ukuran manual sama
              // sekali — biarkan <img> pakai max-height/max-width bawaan
              // CSS di bawah, wrapper otomatis menyusut pas ukuran gambar
              // (tidak ada style di sini = shrink-to-fit content). Ini
              // yang paling aman dari risiko bbox geser, lihat diskusi
              // sebelumnya (rumus manual sempat salah hitung sisa ruang).
              if (hasBboxOverlay) return undefined

              // Crop (tanpa bbox): isi sebanyak mungkin dari RUANG YANG
              // BENERAN TERSEDIA (availableSize, diukur via ResizeObserver
              // di baris gambar) TANPA melebihi aspect ratio asli gambar —
              // bisa MEMPERBESAR gambar kecil (mis. crop 176x407), bukan
              // cuma membatasi gambar besar. Aman dilakukan di sini karena
              // tidak ada overlay yang bisa salah posisi kalau ukurannya
              // meleset dikit.
              if (!naturalSize || !availableSize) return undefined
              const ratio = naturalSize.w / naturalSize.h
              const w = Math.min(availableSize.w, availableSize.h * ratio)
              const h = Math.min(availableSize.h, availableSize.w / ratio)
              return { width: `${w}px`, height: `${h}px` }
            })()}
          >
            <img
              ref={imgRef}
              src={src}
              alt={caption}
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth, naturalHeight } = e.currentTarget
                setNaturalSize({ w: naturalWidth, h: naturalHeight })
              }}
              className={`select-none rounded-lg border object-contain ${
                badge?.tone === 'danger' ? 'border-red-900' : 'border-slate-800'
              } ${
                !hasBboxOverlay && naturalSize && availableSize
                  ? 'h-full w-full'
                  : fullscreen
                    ? 'w-auto max-h-[95vh] max-w-[98vw]'
                    : 'w-auto max-h-[85vh]'
              }`}
            />
            {labelBadge && (
              <span
                style={{ backgroundColor: labelBadgeBg }}
                className="absolute left-2 top-2 z-20 rounded px-2 py-1 text-xs font-medium"
              >
                {labelBadge}
              </span>
            )}
            {badge && (
              <span
                className={`absolute right-2 top-2 z-20 rounded px-2 py-1 text-xs font-bold uppercase ${
                  badge.tone === 'danger'
                    ? 'bg-red-950/90 text-red-400'
                    : 'bg-emerald-950/90 text-emerald-400'
                }`}
              >
                {badge.text}
              </span>
            )}
            {boxes.map((box, i) => {
              const isActive = dragState?.index === i || hoveredIndex === i
              return (
                <div
                  key={i}
                  onPointerDown={(e) => handleBoxPointerDown(e, i)}
                  onPointerEnter={() => editing && setHoveredIndex(i)}
                  onPointerLeave={() =>
                    editing && setHoveredIndex((h) => (h === i ? null : h))
                  }
                  className={`absolute border-2 shadow-[0_0_0_1px_rgba(0,0,0,0.6)] ${
                    isActive ? 'border-amber-400' : 'border-emerald-400'
                  } ${editing ? 'cursor-move' : 'pointer-events-none'}`}
                  style={{
                    left: `${box.x1 * 100}%`,
                    top: `${box.y1 * 100}%`,
                    width: `${(box.x2 - box.x1) * 100}%`,
                    height: `${(box.y2 - box.y1) * 100}%`,
                    // kotak yang lagi dihover/di-drag naik ke depan — supaya kotak
                    // berdempetan/tumpang tindih tetap bisa dipilih satu-satu, bukan
                    // selalu kena kotak yang urutannya di atas
                    zIndex: dragState?.index === i ? 50 : hoveredIndex === i ? 40 : i + 1,
                  }}
                >
                  <span
                    className={`absolute -top-5 left-0 rounded px-1 text-[10px] font-semibold text-slate-950 ${
                      isActive ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                  >
                    person
                  </span>
                  {editing && (
                    <>
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => deleteBox(i)}
                        className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-500"
                        aria-label="Hapus box ini"
                      >
                        <CloseIcon className="h-3 w-3" />
                      </button>
                      <div
                        onPointerDown={(e) => handleResizePointerDown(e, i)}
                        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-slate-950 bg-emerald-400"
                      />
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {hasNext && !editing && (
            <button
              type="button"
              onClick={onNext}
              aria-label="Gambar berikutnya"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition hover:bg-black/80"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
