import { useEffect, useState } from 'react'
import { api, formatFileSize, type LabelImage, type LabelInfo } from '../../api'
import { useConfirm } from '../ui/ConfirmProvider'
import { ChevronLeftIcon, ChevronRightIcon, TrashIcon, UndoIcon } from '../ui/icons'
import { ImageModal } from './ImageModal'

function filenameOf(path: string): string {
  return path.split('/').pop()!
}

const COLUMNS = 9
const ROWS_PER_PAGE = 3
const ITEMS_PER_PAGE = COLUMNS * ROWS_PER_PAGE

interface Props {
  projectId: string
  labels: LabelInfo[]
  onChanged: () => void
}

export function LabelReview({ projectId, labels, onChanged }: Props) {
  const confirm = useConfirm()
  const [selected, setSelected] = useState('')
  const [images, setImages] = useState<LabelImage[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [page, setPage] = useState(0)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<Record<string, string>>({})

  useEffect(() => {
    if ((!selected || !labels.some((l) => l.name === selected)) && labels.length > 0) {
      setSelected(labels[0].name)
    }
  }, [labels, selected])

  function reloadImages() {
    if (!selected || !projectId) {
      setImages([])
      return
    }
    api.listLabelImages(projectId, selected).then(setImages).catch(() => {})
  }

  useEffect(reloadImages, [selected, projectId])

  useEffect(() => {
    setPage(0)
    setChecked(new Set())
    setOpenPath(null)
  }, [selected])

  const openIndex = openPath ? images.findIndex((i) => i.path === openPath) : -1
  const openImage = openIndex >= 0 ? images[openIndex] : null

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
    if (!paths.length || !selected) return
    setDeleting(true)
    try {
      await api.deleteLabelImages(projectId, selected, paths.map(filenameOf))
      setImages((prev) => prev.filter((img) => !paths.includes(img.path)))
      setChecked((prev) => {
        const next = new Set(prev)
        paths.forEach((p) => next.delete(p))
        return next
      })
      onChanged()
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteLabelCategory() {
    if (!selected) return
    const confirmed = await confirm({
      title: 'Hapus kategori label?',
      message:
        `Hapus label "${selected}" beserta SEMUA (${images.length}) gambar di dalamnya? ` +
        'Ini menghapus kategori labelnya sendiri (bukan cuma isinya) — tindakan ini ' +
        'tidak bisa dibatalkan.',
      confirmLabel: 'Hapus Label',
      danger: true,
    })
    if (!confirmed) return
    setDeleting(true)
    try {
      await api.deleteLabel(projectId, selected)
      setSelected('')
      setImages([])
      onChanged()
    } finally {
      setDeleting(false)
    }
  }

  async function handleDeleteAll() {
    if (!images.length) return
    const confirmed = await confirm({
      title: 'Batalkan semua label?',
      message:
        `Batalkan label SEMUA ${images.length} gambar di "${selected}"? Gambar akan kembali ` +
        'jadi crop belum dilabel (bisa dilabel ulang lewat Mode Grid/Swipe) — crop asli di ' +
        'sample tidak ikut terhapus.',
      confirmLabel: 'Batalkan Semua Label',
    })
    if (!confirmed) return
    await deleteByPaths(images.map((img) => img.path))
  }

  const totalPages = Math.max(1, Math.ceil(images.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const pagedImages = images.slice(
    currentPage * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  )

  if (labels.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Belum ada gambar yang di-assign ke label manapun. Pakai Mode Grid atau Mode Swipe di
        atas untuk mulai memberi label.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
        >
          {labels.map((l) => (
            <option key={l.name} value={l.name}>
              {l.name} ({l.count})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDeleteLabelCategory}
            disabled={deleting || !selected}
            title="Hapus kategori label ini sepenuhnya (bukan cuma isinya)"
            className="flex items-center gap-1.5 rounded-lg border border-red-900 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Hapus Label Ini
          </button>
          {checked.size > 0 && (
            <>
              <span className="text-xs text-slate-400">{checked.size} dipilih</span>
              <button
                type="button"
                onClick={() => deleteByPaths([...checked])}
                disabled={deleting}
                title="Batalkan label — gambar kembali jadi crop belum dilabel, tidak dihapus"
                className="flex items-center gap-1.5 rounded-lg border border-amber-900 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UndoIcon className="h-3.5 w-3.5" />
                Batalkan Label ({checked.size})
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
              title="Batalkan label — gambar kembali jadi crop belum dilabel, tidak dihapus"
              className="flex items-center gap-1.5 rounded-lg border border-amber-900 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UndoIcon className="h-3.5 w-3.5" />
              Batalkan Semua Label ({images.length})
            </button>
          )}
        </div>
      </div>

      {images.length === 0 ? (
        <p className="text-sm text-slate-500">Belum ada gambar di label ini.</p>
      ) : (
        <>
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

                <button
                  type="button"
                  onClick={() => setOpenPath(img.path)}
                  className="block w-full text-left"
                >
                  <div className="aspect-square overflow-hidden bg-black">
                    <img
                      src={api.labelImageUrl(projectId, img.path)}
                      alt={img.path}
                      loading="lazy"
                      onLoad={(e) => handleImgLoad(img.path, e)}
                      // object-contain (bukan object-cover): halaman ini buat
                      // MENGECEK KEBENARAN label, jadi gambar harus kelihatan
                      // utuh apa adanya — termasuk untuk crop bagian atas yang
                      // rasio aspeknya beda-beda, tidak boleh ada bagian yang
                      // kepotong dari tampilan review
                      className="h-full w-full object-contain transition hover:opacity-80"
                    />
                  </div>
                  <div className="space-y-0.5 px-1.5 py-1">
                    <p className="font-mono text-[10px] text-slate-500">
                      {formatFileSize(img.size_bytes)}
                    </p>
                  </div>
                </button>
              </div>
            ))}
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
        </>
      )}

      {openImage && (
        <ImageModal
          src={api.labelImageUrl(projectId, openImage.path)}
          editable={false}
          deleteLabel="Batalkan Label"
          caption={`${openImage.label} · ${dimensions[openImage.path] ?? '…'} · ${formatFileSize(
            openImage.size_bytes,
          )}`}
          onClose={() => setOpenPath(null)}
          onPrev={() => setOpenPath(images[openIndex - 1].path)}
          onNext={() => setOpenPath(images[openIndex + 1].path)}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < images.length - 1}
          onDelete={() => {
            // tetap di dalam modal setelah hapus — pindah ke gambar berikutnya
            // (atau sebelumnya kalau ini yang terakhir), bukan menutup modal
            const next = images[openIndex + 1] ?? images[openIndex - 1] ?? null
            deleteByPaths([openImage.path]).then(() => {
              setOpenPath(next ? next.path : null)
            })
          }}
        />
      )}
    </div>
  )
}
