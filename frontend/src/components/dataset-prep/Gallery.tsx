import { useEffect, useMemo, useState } from 'react'
import {
  api,
  formatFileSize,
  type AnnotateResult,
  type Camera,
  type CropImage,
  type CropResult,
  type DatasetImage,
} from '../../api'
import { ActionBadge } from '../ui/ActionBadge'
import { useConfirm } from '../ui/ConfirmProvider'
import { BoundingBoxIcon, ChevronLeftIcon, ChevronRightIcon, CropIcon, TrashIcon } from '../ui/icons'
import { ImageModal } from './ImageModal'

interface Props {
  projectId: string
  cameras: Camera[]
  counts: Record<string, number>
  focusLabel?: string | null
  onResetAll?: () => void
  // dikontrol dari RecipeStepNav (langkah "Frame & BBox" vs "Crop Object")
  // di PersiapanDatasetPhase — bukan toggle internal lagi, supaya "sedang di
  // langkah apa" cuma ditentukan SATU tempat (navigasi), tidak dobel dengan
  // toggle lokal yang bisa beda sendiri dari state navigasi di luarnya.
  viewMode: ViewMode
  // Generate BBOX otomatis cuma bisa deteksi kelas "person" (model COCO
  // pretrained, lihat person_annotator.py) — TIDAK relevan/menyesatkan
  // untuk project yang tujuannya melatih deteksi OBJECT BARU yang belum
  // pernah dikenal model itu. Default true (resep resnet selalu perlu ini,
  // karena crop-nya berasal dari deteksi person).
  showAutoAnnotate?: boolean
  // daftar nama kelas bbox, diteruskan ke ImageModal untuk resep YOLO
  // multi-kelas — default 1 kelas "person" (resep resnet)
  classNames?: string[]
  // true kalau daftar kelas di atas BOLEH dikelola (tambah/hapus) langsung
  // dari popup pemilih kelas di ImageModal — cuma resep YOLO
  manageClasses?: boolean
  onClassNamesChange?: (next: string[]) => void
}

const ALL_LABELS = '__all__'
const COLUMNS = 9
const ROWS_PER_PAGE = 3
const ITEMS_PER_PAGE = COLUMNS * ROWS_PER_PAGE

export type ViewMode = 'frame' | 'crop'
type GalleryImage = DatasetImage | CropImage

function filenameOf(path: string): string {
  return path.split('/').pop()!
}

export function Gallery({
  projectId,
  cameras,
  counts,
  focusLabel,
  onResetAll,
  viewMode,
  showAutoAnnotate = true,
  classNames = ['person'],
  manageClasses = false,
  onClassNamesChange,
}: Props) {
  const confirm = useConfirm()
  const labels = Object.keys(counts)
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)

  const [selected, setSelected] = useState<string>(ALL_LABELS)
  const [images, setImages] = useState<GalleryImage[]>([])
  const [dimensions, setDimensions] = useState<Record<string, string>>({})
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [annotating, setAnnotating] = useState(false)
  const [overwriteAnnotate, setOverwriteAnnotate] = useState(false)
  const [annotateResult, setAnnotateResult] = useState<AnnotateResult | null>(null)
  const [cropping, setCropping] = useState(false)
  const [overwriteCrop, setOverwriteCrop] = useState(false)
  const [cropResult, setCropResult] = useState<CropResult | null>(null)
  const [page, setPage] = useState(0)

  // di mode "Full Frame", gambar yang BELUM punya bbox ditaruh duluan — supaya
  // gampang ketahuan mana yang belum di-annotate tanpa perlu cari manual di
  // antara ratusan gambar yang sudah ada bbox-nya. Tidak relevan di mode
  // "Crop Object" (crop selalu berasal dari bbox yang sudah ada).
  const sortedImages = useMemo(() => {
    if (viewMode !== 'frame') return images
    const withBbox = (img: GalleryImage) => ('bbox_count' in img ? img.bbox_count > 0 : true)
    return [...images].sort((a, b) => Number(withBbox(a)) - Number(withBbox(b)))
  }, [images, viewMode])

  const openIndex = openPath ? sortedImages.findIndex((img) => img.path === openPath) : -1
  const openImage = openIndex >= 0 ? sortedImages[openIndex] : null

  const totalPages = Math.max(1, Math.ceil(sortedImages.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const pagedImages = sortedImages.slice(
    currentPage * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  )

  // balik ke halaman 1 tiap ganti filter label/mode, dan tetap dalam batas kalau total halaman menyusut
  useEffect(() => {
    setPage(0)
    setOpenPath(null)
  }, [selected, viewMode])

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1))
  }, [totalPages])

  // navigasi Prev/Next di dalam modal (ImageModal) pindah lewat sortedImages
  // langsung by index, TIDAK ikut mengubah `page` (grid di belakangnya) —
  // jadi kalau lagi koreksi berurutan lewat modal dan sampai jauh dari
  // halaman awal (mis. buka dari halaman 1, next puluhan kali sampai
  // "masuk" halaman 5), begitu modal ditutup/hapus gambar, grid balik ke
  // halaman lama yang tidak nyambung lagi sama posisi terakhir. Sinkronkan
  // `page` tiap kali gambar yang lagi dibuka di modal berubah.
  useEffect(() => {
    if (openIndex < 0) return
    const targetPage = Math.floor(openIndex / ITEMS_PER_PAGE)
    setPage((p) => (p === targetPage ? p : targetPage))
  }, [openIndex])

  // kalau label yang lagi difilter sudah tidak ada gambarnya (mis. semua dihapus), balik ke "Semua"
  useEffect(() => {
    if (selected !== ALL_LABELS && !labels.includes(selected)) setSelected(ALL_LABELS)
  }, [labels, selected])

  // saat sedang filter ke 1 label spesifik, ikut pindah kalau capture baru masuk ke label lain
  useEffect(() => {
    if (focusLabel && selected !== ALL_LABELS && labels.includes(focusLabel)) {
      setSelected(focusLabel)
    }
  }, [focusLabel, labels, selected])

  useEffect(() => {
    setChecked(new Set())
  }, [selected, viewMode])

  function reloadImages() {
    if (!projectId) return
    const fetcher =
      viewMode === 'crop'
        ? selected === ALL_LABELS
          ? api.listAllCrops(projectId)
          : api.listCrops(projectId, selected)
        : selected === ALL_LABELS
          ? api.listAllImages(projectId)
          : api.listImages(projectId, selected)
    fetcher.then(setImages).catch(() => {})
  }

  useEffect(() => {
    reloadImages()
    const id = setInterval(reloadImages, 5000)
    return () => clearInterval(id)
  }, [selected, viewMode, projectId])

  function cameraName(cameraId: string): string {
    return cameras.find((c) => c.id === cameraId)?.name ?? cameraId
  }

  function handleImgLoad(path: string, e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget
    setDimensions((prev) => ({ ...prev, [path]: `${naturalWidth}×${naturalHeight}` }))
  }

  function toggleCheck(path: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function deleteByPaths(paths: string[]) {
    if (!paths.length) return
    setDeleting(true)
    setDeleteError(null)
    try {
      // "Semua Label" bisa berisi campuran label berbeda — kelompokkan dulu per label asli gambarnya
      const byLabel = new Map<string, string[]>()
      for (const path of paths) {
        const img = images.find((i) => i.path === path)
        if (!img) continue
        const list = byLabel.get(img.label) ?? []
        list.push(filenameOf(path))
        byLabel.set(img.label, list)
      }
      const deleteFn = viewMode === 'crop' ? api.deleteCrops : api.deleteImages
      const entries = [...byLabel.entries()]
      const results = await Promise.allSettled(
        entries.map(([lbl, filenames]) => deleteFn(projectId, lbl, filenames)),
      )

      // hanya anggap "terhapus" untuk label yang request-nya benar-benar berhasil —
      // sebelumnya semua path langsung dibuang dari tampilan walau ada yang gagal
      // di backend (Promise.allSettled tidak pernah reject), jadi UI kelihatan
      // "sudah kehapus" padahal filenya masih ada di server.
      const succeededLabels = new Set<string>()
      const failedLabels: string[] = []
      results.forEach((res, i) => {
        const [lbl] = entries[i]
        if (res.status === 'fulfilled') succeededLabels.add(lbl)
        else failedLabels.push(lbl)
      })

      setImages((prev) =>
        prev.filter((img) => !(paths.includes(img.path) && succeededLabels.has(img.label))),
      )
      setChecked((prev) => {
        const next = new Set(prev)
        paths.forEach((p) => {
          const img = images.find((i) => i.path === p)
          if (img && succeededLabels.has(img.label)) next.delete(p)
        })
        return next
      })

      if (failedLabels.length > 0) {
        setDeleteError(
          `Gagal menghapus sebagian data (sample: ${failedLabels.join(', ')}). Coba lagi.`,
        )
      }
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteSelected() {
    await deleteByPaths([...checked])
  }

  async function handleDeleteSingle(path: string) {
    // tetap di dalam modal setelah hapus — pindah ke gambar berikutnya
    // (atau sebelumnya kalau ini yang terakhir), bukan menutup modal
    const idx = sortedImages.findIndex((img) => img.path === path)
    const next = sortedImages[idx + 1] ?? sortedImages[idx - 1] ?? null
    await deleteByPaths([path])
    setOpenPath(next ? next.path : null)
  }

  async function handleDeleteAll() {
    if (!images.length) return
    const scope = selected === ALL_LABELS ? 'semua sample' : `sample "${selected}"`
    const confirmed = await confirm({
      title: 'Hapus semua gambar?',
      message: `Hapus SEMUA ${images.length} gambar di ${scope}? Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus Semua',
      danger: true,
    })
    if (!confirmed) return
    await deleteByPaths(images.map((img) => img.path))
  }

  async function handleResetAll() {
    const confirmed = await confirm({
      title: 'Reset semua data?',
      message:
        `Hapus SEMUA data — seluruh gambar frame DAN crop object di semua sample (${totalCount} gambar)? ` +
        'Tindakan ini tidak bisa dibatalkan. Data yang sudah di-assign ke label (halaman Persiapan Dataset) tidak ikut terhapus.',
      confirmLabel: 'Reset Semua Data',
      danger: true,
    })
    if (!confirmed) return
    setResetting(true)
    setResetError(null)
    try {
      await api.resetAllSamples(projectId)
      setImages([])
      setChecked(new Set())
      onResetAll?.()
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Gagal reset data')
    } finally {
      setResetting(false)
    }
  }

  async function handleAnnotate() {
    setAnnotating(true)
    setAnnotateResult(null)
    try {
      const result =
        selected === ALL_LABELS
          ? await api.annotateAll(projectId, overwriteAnnotate)
          : await api.annotateLabel(projectId, selected, overwriteAnnotate)
      setAnnotateResult(result)
      reloadImages()
    } finally {
      setAnnotating(false)
    }
  }

  async function handleCrop() {
    setCropping(true)
    setCropResult(null)
    try {
      const result =
        selected === ALL_LABELS
          ? await api.cropAllObjects(projectId, overwriteCrop)
          : await api.cropObjects(projectId, selected, overwriteCrop)
      setCropResult(result)
      reloadImages()
    } finally {
      setCropping(false)
    }
  }

  // sebelumnya `return null` diam-diam — kalau project belum punya frame
  // sama sekali (mis. project baru, belum pernah capture), seluruh langkah
  // BBox/Crop jadi kosong TANPA pesan apapun, kelihatan seperti fiturnya
  // hilang padahal cuma belum ada data buat ditampilkan.
  if (!labels.length) {
    return (
      <p className="text-sm text-slate-500">
        Belum ada frame tersimpan untuk project ini — ambil gambar dulu di fase{' '}
        <strong className="text-slate-300">Capture</strong>, baru kembali ke sini untuk{' '}
        {viewMode === 'frame' ? 'generate BBOX' : 'crop object'}.
      </p>
    )
  }

  return (
    <div>
      {/* header langkah: judul kiri, aksi utama + badge konsekuensi kanan-atas
          — posisi ini konsisten dipakai di semua langkah Persiapan Dataset */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">
            {viewMode === 'frame' ? (showAutoAnnotate ? 'Frame & BBox Person' : 'Frame & BBox') : 'Crop Object'}
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            {viewMode === 'frame'
              ? showAutoAnnotate
                ? 'Lihat frame hasil capture, deteksi orang otomatis, koreksi manual kalau perlu.'
                : 'Gambar bbox manual per frame — klik gambar, lalu "Tambah BBOX". Object baru belum pernah dikenal model, jadi tidak bisa dideteksi otomatis.'
              : 'Potong tiap bbox jadi gambar terpisah per orang.'}
          </p>
        </div>

        {viewMode === 'frame' && !showAutoAnnotate ? null : viewMode === 'frame' ? (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <ActionBadge kind="safe" />
              <button
                type="button"
                onClick={handleAnnotate}
                disabled={annotating || images.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-blue-900 px-2.5 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <BoundingBoxIcon className="h-3.5 w-3.5" />
                {annotating ? 'Memproses…' : 'Generate BBOX Person'}
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={overwriteAnnotate}
                onChange={(e) => setOverwriteAnnotate(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              Timpa ulang yang sudah ada
            </label>
            {annotateResult && (
              <span className="text-right text-[11px] text-slate-500">
                {annotateResult.processed} diproses ({annotateResult.skipped} dilewati) ·{' '}
                {annotateResult.with_person} gambar ada orang · {annotateResult.total_boxes} bbox
                total
              </span>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <ActionBadge kind="safe" />
              <button
                type="button"
                onClick={handleCrop}
                disabled={cropping}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-900 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CropIcon className="h-3.5 w-3.5" />
                {cropping ? 'Memproses…' : 'Crop Semua Object'}
              </button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={overwriteCrop}
                onChange={(e) => setOverwriteCrop(e.target.checked)}
                className="h-3.5 w-3.5 accent-emerald-600"
              />
              Timpa ulang crop yang sudah ada
            </label>
            {cropResult && (
              <span className="text-right text-[11px] text-slate-500">
                {cropResult.processed} diproses ({cropResult.skipped} dilewati) ·{' '}
                {cropResult.images_with_boxes} gambar ada object · {cropResult.total_crops} crop
                dihasilkan
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
        >
          <option value={ALL_LABELS}>Semua Sample ({totalCount})</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l} ({counts[l]})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          {checked.size > 0 && (
            <>
              <span className="text-xs text-slate-400">{checked.size} dipilih</span>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 rounded-lg border border-red-900 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                Hapus ({checked.size})
              </button>
              <button
                type="button"
                onClick={() => setChecked(new Set())}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Batal
              </button>
            </>
          )}
          {images.length > 0 && checked.size === 0 && (
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-900 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Hapus Semua ({images.length})
            </button>
          )}
          <span className="mx-1 h-4 w-px bg-slate-800" aria-hidden="true" />
          <ActionBadge kind="danger" />
          <button
            type="button"
            onClick={handleResetAll}
            disabled={resetting || totalCount === 0}
            title="Hapus semua gambar frame dan crop object (sample/) di semua sample — TIDAK menghapus dataset yang sudah dilabel"
            className="flex items-center gap-1.5 rounded-lg border border-red-800 bg-red-950/40 px-2.5 py-1 text-xs font-semibold text-red-300 hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            {resetting ? 'Menghapus…' : 'Reset Sample & Crop'}
          </button>
        </div>
      </div>
      <p className="mb-3 text-right text-[11px] text-slate-600">
        "Reset Sample &amp; Crop" tidak menghapus dataset yang sudah dilabel (langkah Label/Review/Split).
      </p>

      {resetError && (
        <p className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-400">{resetError}</p>
      )}
      {deleteError && (
        <p className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-400">{deleteError}</p>
      )}

      <div>
        {images.length === 0 ? (
          <p className="text-sm text-slate-500">
            {viewMode === 'crop'
              ? 'Belum ada crop object. Klik "Crop Semua Object" untuk menghasilkannya dari bbox yang sudah ada.'
              : 'Belum ada gambar untuk sample ini.'}
          </p>
        ) : (
          <div className="grid grid-cols-9 gap-3">
            {pagedImages.map((img) => (
              <div
                key={img.path}
                className="relative overflow-hidden rounded-md border border-slate-800 bg-slate-950"
              >
                <label
                  className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-slate-600 bg-slate-950/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(img.path)}
                    onChange={() => toggleCheck(img.path)}
                    className="h-3.5 w-3.5 accent-blue-600"
                  />
                </label>

                {selected === ALL_LABELS && (
                  <span className="absolute right-1.5 top-1.5 z-10 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                    {img.label}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setOpenPath(img.path)}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-square overflow-hidden bg-black">
                    <img
                      src={api.sampleImageUrl(projectId, img.path)}
                      alt={img.path}
                      loading="lazy"
                      onLoad={(e) => handleImgLoad(img.path, e)}
                      className="h-full w-full object-cover transition hover:opacity-80"
                    />
                    {'bbox_count' in img && (
                      <span
                        className={`absolute bottom-1 left-1 flex items-center gap-1 rounded bg-slate-950/80 px-1.5 py-0.5 text-[10px] font-medium ${
                          img.bbox_count > 0 ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        <BoundingBoxIcon className="h-3 w-3" />
                        {img.bbox_count}
                      </span>
                    )}
                  </div>
                  <div className="space-y-0.5 px-1.5 py-1">
                    <p className="truncate text-[11px] font-medium text-slate-300">
                      {cameraName(img.camera_id)}
                    </p>
                    <p className="font-mono text-[10px] text-slate-500">
                      {dimensions[img.path] ?? '…'} · {formatFileSize(img.size_bytes)}
                    </p>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            Sebelumnya
          </button>
          <span className="text-xs text-slate-500">
            Halaman {currentPage + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Berikutnya
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {openImage && (
        <ImageModal
          src={api.sampleImageUrl(projectId, openImage.path)}
          annotationUrl={
            viewMode === 'frame' ? api.annotationUrl(projectId, openImage.path) : undefined
          }
          projectId={projectId}
          editable={viewMode === 'frame'}
          classNames={classNames}
          manageClasses={manageClasses}
          onClassNamesChange={onClassNamesChange}
          label={openImage.label}
          filename={filenameOf(openImage.path)}
          caption={`${cameraName(openImage.camera_id)} · ${openImage.label} · ${
            dimensions[openImage.path] ?? '…'
          } · ${formatFileSize(openImage.size_bytes)}`}
          onClose={() => setOpenPath(null)}
          onPrev={() => setOpenPath(sortedImages[openIndex - 1].path)}
          onNext={() => setOpenPath(sortedImages[openIndex + 1].path)}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < sortedImages.length - 1}
          onDelete={() => handleDeleteSingle(openImage.path)}
          onSaved={reloadImages}
        />
      )}
    </div>
  )
}
