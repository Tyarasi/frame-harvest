import { useEffect, useState } from 'react'
import { api, formatFileSize, type CropImage, type LabelInfo } from '../api'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { ImageModal } from './ImageModal'
import { LabelReview } from './LabelReview'
import { SwipeLabeler } from './SwipeLabeler'

function filenameOf(path: string): string {
  return path.split('/').pop()!
}

export const MODEL_MODES = [
  { value: 'resnet', label: 'ResNet (Lanyard Classifier)' },
]

type LabelMode = 'grid' | 'swipe'

const COLUMNS = 9
const ROWS_PER_PAGE = 3
const ITEMS_PER_PAGE = COLUMNS * ROWS_PER_PAGE

interface Props {
  projectId: string
  projectName: string
  counts: Record<string, number>
}

type DatasetTab = 'label' | 'review'

const TABS: Array<{ key: DatasetTab; label: string }> = [
  { key: 'label', label: 'Label Crop' },
  { key: 'review', label: 'Hasil Label' },
]

// baca tab aktif dari URL (?datasetTab=...) supaya refresh browser tidak
// selalu balik ke tab "Label Crop" — pola sama seperti ?page= / ?trainingTab=
function getInitialTab(): DatasetTab {
  const param = new URLSearchParams(window.location.search).get('datasetTab')
  const keys = TABS.map((t) => t.key) as string[]
  return keys.includes(param ?? '') ? (param as DatasetTab) : 'label'
}

export function DatasetPreparation({ projectId, projectName, counts }: Props) {
  const samples = Object.keys(counts)

  const [tab, setTabState] = useState<DatasetTab>(getInitialTab)
  const [mode, setMode] = useState(MODEL_MODES[0].value)
  const [selectedSample, setSelectedSample] = useState('')
  const [labelMode, setLabelMode] = useState<LabelMode>('grid')

  const [labelName, setLabelName] = useState('')
  const [leftLabel, setLeftLabel] = useState('')
  const [rightLabel, setRightLabel] = useState('')

  const [existingLabels, setExistingLabels] = useState<LabelInfo[]>([])
  const [crops, setCrops] = useState<CropImage[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<Record<string, string>>({})

  function setTab(next: DatasetTab) {
    setTabState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('datasetTab', next)
    window.history.replaceState({}, '', url)
  }

  // default: pilih sample pertama begitu daftar sample tersedia, atau kalau
  // sample yang lagi dipilih sudah tidak ada di project ini (mis. abis ganti project)
  useEffect(() => {
    if (samples.length === 0) {
      if (selectedSample) setSelectedSample('')
    } else if (!samples.includes(selectedSample)) {
      setSelectedSample(samples[0])
    }
  }, [samples, selectedSample])

  function reloadCrops() {
    if (mode !== 'resnet' || !selectedSample || !projectId) {
      setCrops([])
      return
    }
    api.listCrops(projectId, selectedSample, undefined, true).then(setCrops).catch(() => {})
  }

  useEffect(reloadCrops, [mode, selectedSample, projectId])

  function reloadLabels() {
    if (!projectId) return
    api.listLabels(projectId).then(setExistingLabels).catch(() => {})
  }

  useEffect(reloadLabels, [projectId])

  // dipanggil dari SwipeLabeler tiap 1 crop selesai di-assign — aman refresh
  // `crops` di sini karena SwipeLabeler cuma pakai prop ini sebagai nilai
  // awal antrean, bukan resync reaktif, jadi tidak mengacak swipe yang lagi
  // berjalan
  function handleSwipeAssigned() {
    reloadLabels()
    reloadCrops()
  }

  useEffect(() => {
    setPage(0)
    setChecked(new Set())
    setOpenPath(null)
  }, [mode, selectedSample, labelMode])

  const openIndex = openPath ? crops.findIndex((c) => c.path === openPath) : -1
  const openCrop = openIndex >= 0 ? crops[openIndex] : null

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

  async function handleAssign() {
    const label = labelName.trim()
    if (!label || checked.size === 0 || !selectedSample) return
    setAssigning(true)
    setAssignResult(null)
    try {
      const paths = [...checked]
      const filenames = paths.map(filenameOf)
      const res = await api.assignLabel(projectId, label, selectedSample, filenames)
      setAssignResult(`${res.assigned} crop di-assign ke label "${label}"`)
      // buang dari daftar supaya tidak muncul dobel/bisa ke-assign ulang tanpa sengaja
      setCrops((prev) => prev.filter((c) => !paths.includes(c.path)))
      setChecked(new Set())
      reloadLabels()
    } finally {
      setAssigning(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(crops.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const pagedCrops = crops.slice(
    currentPage * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  )

  const swipeReady = leftLabel.trim() !== '' && rightLabel.trim() !== ''

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Persiapan Dataset
        </h3>
        <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-medium text-blue-300">
          Project aktif: {projectName || '(tidak ada)'}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
              tab === t.key
                ? 'border-blue-500 text-slate-100'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'label' && (
        <div>
      <div className="flex flex-wrap gap-4">
        <div className="max-w-xs flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-400">Mode Model</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            {MODEL_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="max-w-xs flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-400">Dari Sample</label>
          <select
            value={selectedSample}
            onChange={(e) => setSelectedSample(e.target.value)}
            disabled={samples.length === 0}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            {samples.length === 0 && <option value="">Belum ada sample</option>}
            {samples.map((s) => (
              <option key={s} value={s}>
                {s} ({counts[s]})
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === 'resnet' && (
        <div className="mt-5 border-t border-slate-800 pt-4">
          <div className="mb-4 flex items-center gap-4">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Cara Label:
            </span>
            <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setLabelMode('grid')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  labelMode === 'grid'
                    ? 'bg-slate-600 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mode Grid
              </button>
              <button
                type="button"
                onClick={() => setLabelMode('swipe')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  labelMode === 'swipe'
                    ? 'bg-slate-600 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mode Swipe
              </button>
            </div>
          </div>

          {labelMode === 'grid' ? (
            <>
              <div className="mb-4 max-w-xs">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Nama Label
                </label>
                <input
                  type="text"
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                  placeholder="mis. ada_lanyard"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
                />
                {existingLabels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {existingLabels.map((l) => (
                      <button
                        key={l.name}
                        type="button"
                        onClick={() => setLabelName(l.name)}
                        className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                          labelName === l.name
                            ? 'border-blue-600 bg-blue-950 text-blue-300'
                            : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {l.name} ({l.count})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Crop Belum Dilabel dari Sample "{selectedSample || '-'}" ({crops.length})
                </h4>
                <div className="flex items-center gap-3">
                  {checked.size > 0 && (
                    <span className="text-xs text-slate-400">{checked.size} dipilih</span>
                  )}
                  <button
                    type="button"
                    onClick={handleAssign}
                    disabled={assigning || checked.size === 0 || !labelName.trim()}
                    className="rounded-lg border border-emerald-900 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assigning
                      ? 'Menyimpan…'
                      : `Assign ke Label${checked.size ? ` (${checked.size})` : ''}`}
                  </button>
                </div>
              </div>

              {assignResult && <p className="mb-3 text-xs text-slate-500">{assignResult}</p>}

              {crops.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Tidak ada crop tersisa untuk dilabel di sample ini — mungkin belum
                  di-crop sama sekali (buka tab "Crop Object" di Galeri halaman Capture,
                  jalankan "Crop Semua Object"), atau semua crop di sample ini sudah
                  di-assign ke label.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-9 gap-3">
                    {pagedCrops.map((c) => (
                      <div
                        key={c.path}
                        className="relative overflow-hidden rounded-md border border-slate-800 bg-slate-950"
                      >
                        <label
                          className="absolute left-1.5 top-1.5 z-10 flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-slate-600 bg-slate-950/80"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked.has(c.path)}
                            onChange={() => toggleCheck(c.path)}
                            className="h-3.5 w-3.5 accent-blue-600"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => setOpenPath(c.path)}
                          className="block w-full text-left"
                        >
                          <div className="aspect-square overflow-hidden bg-black">
                            <img
                              src={api.sampleImageUrl(projectId, c.path)}
                              alt={c.path}
                              loading="lazy"
                              onLoad={(e) => handleImgLoad(c.path, e)}
                              className="h-full w-full object-cover transition hover:opacity-80"
                            />
                          </div>
                          <div className="space-y-0.5 px-1.5 py-1">
                            <p className="truncate text-[11px] font-medium text-slate-300">
                              {c.label}
                            </p>
                            <p className="font-mono text-[10px] text-slate-500">
                              {formatFileSize(c.size_bytes)}
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
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-4">
                <div className="max-w-xs flex-1">
                  <label className="mb-1 block text-xs font-medium text-red-400">
                    Label Kiri (swipe kiri)
                  </label>
                  <input
                    type="text"
                    value={leftLabel}
                    onChange={(e) => setLeftLabel(e.target.value)}
                    placeholder="mis. tidak_lanyard"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-red-500 focus:outline-none"
                  />
                  {existingLabels.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {existingLabels.map((l) => (
                        <button
                          key={l.name}
                          type="button"
                          onClick={() => setLeftLabel(l.name)}
                          className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                            leftLabel === l.name
                              ? 'border-red-600 bg-red-950 text-red-300'
                              : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {l.name} ({l.count})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="max-w-xs flex-1">
                  <label className="mb-1 block text-xs font-medium text-emerald-400">
                    Label Kanan (swipe kanan)
                  </label>
                  <input
                    type="text"
                    value={rightLabel}
                    onChange={(e) => setRightLabel(e.target.value)}
                    placeholder="mis. ada_lanyard"
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                  {existingLabels.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {existingLabels.map((l) => (
                        <button
                          key={l.name}
                          type="button"
                          onClick={() => setRightLabel(l.name)}
                          className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                            rightLabel === l.name
                              ? 'border-emerald-600 bg-emerald-950 text-emerald-300'
                              : 'border-slate-700 text-slate-400 hover:bg-slate-800'
                          }`}
                        >
                          {l.name} ({l.count})
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {!selectedSample ? (
                <p className="text-sm text-slate-500">Pilih sample dulu.</p>
              ) : !swipeReady ? (
                <p className="text-sm text-slate-500">
                  Isi Label Kiri dan Label Kanan dulu untuk mulai swipe.
                </p>
              ) : crops.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Tidak ada crop tersisa untuk dilabel di sample ini — mungkin belum
                  di-crop sama sekali (buka tab "Crop Object" di Galeri halaman Capture,
                  jalankan "Crop Semua Object"), atau semua crop di sample ini sudah
                  di-assign ke label.
                </p>
              ) : (
                <SwipeLabeler
                  key={`${selectedSample}-${leftLabel}-${rightLabel}`}
                  projectId={projectId}
                  crops={crops}
                  sample={selectedSample}
                  leftLabel={leftLabel.trim()}
                  rightLabel={rightLabel.trim()}
                  onAssigned={handleSwipeAssigned}
                />
              )}
            </>
          )}
        </div>
      )}
        </div>
      )}
      {tab === 'review' && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hasil Label ({existingLabels.reduce((sum, l) => sum + l.count, 0)})
          </h4>
          <LabelReview projectId={projectId} labels={existingLabels} onChanged={reloadLabels} />
        </div>
      )}

      {openCrop && (
        <ImageModal
          src={api.sampleImageUrl(projectId, openCrop.path)}
          editable={false}
          label={openCrop.label}
          filename={filenameOf(openCrop.path)}
          caption={`${openCrop.label} · ${dimensions[openCrop.path] ?? '…'} · ${formatFileSize(
            openCrop.size_bytes,
          )}`}
          onClose={() => setOpenPath(null)}
          onPrev={() => setOpenPath(crops[openIndex - 1].path)}
          onNext={() => setOpenPath(crops[openIndex + 1].path)}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < crops.length - 1}
        />
      )}
    </div>
  )
}
