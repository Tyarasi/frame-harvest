import { useEffect, useState } from 'react'
import {
  api,
  formatFileSize,
  type Camera,
  type CropImage,
  type CropTopResult,
  type DatasetTarget,
  type LabelInfo,
} from '../../api'
import { recipeFor } from '../../recipes'
import { RecipeStepNav } from '../projects/RecipeStepNav'
import { ActionBadge } from '../ui/ActionBadge'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons'
import { DatasetSplit } from './DatasetSplit'
import { Gallery } from './Gallery'
import { ImageModal } from './ImageModal'
import { LabelReview } from './LabelReview'
import { SwipeLabeler } from './SwipeLabeler'
import { YoloSplit } from './YoloSplit'

function filenameOf(path: string): string {
  return path.split('/').pop()!
}

const COLUMNS = 9
const ROWS_PER_PAGE = 3
const ITEMS_PER_PAGE = COLUMNS * ROWS_PER_PAGE
// lebar preview crop-atas dalam px — HARUS sinkron dengan class Tailwind `w-28`
const PREVIEW_WIDTH_PX = 112

type LabelMode = 'grid' | 'swipe'

interface Props {
  projectId: string
  projectName: string
  datasetTarget: DatasetTarget
  cameras: Camera[]
  counts: Record<string, number>
  focusLabel?: string | null
  onResetAll?: () => void
}

function getInitialStep(fallback: string): string {
  const param = new URLSearchParams(window.location.search).get('datasetStep')
  return param || fallback
}

// Orkestrator fase "Persiapan Dataset" — SATU alur bertahap (BBox -> Crop ->
// Crop Atas -> Label -> Review -> Split), bukan lagi tab-tab lepas. Langkah
// mana saja yang ada, urutan, dan judulnya dibaca dari resep aktif
// (recipes.ts, ditentukan oleh dataset_target project) — jadi menambah resep
// baru nanti (mis. YOLO) tidak perlu merombak file ini, cukup tambah entri
// baru di RECIPES.
export function PersiapanDatasetPhase({
  projectId,
  projectName,
  datasetTarget,
  cameras,
  counts,
  focusLabel,
  onResetAll,
}: Props) {
  const recipe = recipeFor(datasetTarget)
  const [step, setStepState] = useState<string>(() => getInitialStep(recipe.steps[0].id))

  function setStep(next: string) {
    setStepState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('datasetStep', next)
    window.history.replaceState({}, '', url)
  }

  // kalau step di URL tidak valid untuk resep aktif (mis. project lain beda
  // dataset_target), jatuhkan ke step pertama alih-alih layar kosong
  useEffect(() => {
    if (!recipe.steps.some((s) => s.id === step)) setStep(recipe.steps[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe.target])

  const samples = Object.keys(counts)
  const totalFrames = Object.values(counts).reduce((a, b) => a + b, 0)
  const hasFrames = totalFrames > 0

  // ---- data buat gating & checkmark "selesai" tiap step — existence check
  // murah (limit kecil), bukan hitung total, cukup buat tahu ADA/TIDAK ADA ----
  const [hasCrops, setHasCrops] = useState(false)
  const [existingLabels, setExistingLabels] = useState<LabelInfo[]>([])
  const [hasSplit, setHasSplit] = useState(false)

  function reloadLabels() {
    if (!projectId) return
    api.listLabels(projectId).then(setExistingLabels).catch(() => {})
  }
  useEffect(reloadLabels, [projectId])

  useEffect(() => {
    if (!projectId) return setHasCrops(false)
    api
      .listAllCrops(projectId, 1)
      .then((list) => setHasCrops(list.length > 0))
      .catch(() => setHasCrops(false))
  }, [projectId, step])

  useEffect(() => {
    if (!projectId) return setHasSplit(false)
    api
      .getSplit(projectId)
      .then((summary) => setHasSplit(Object.values(summary).some((c) => c.train + c.val + c.test > 0)))
      .catch(() => setHasSplit(false))
  }, [projectId, step])

  const hasLabels = existingLabels.some((l) => l.count > 0)

  function disabledReason(stepId: string): string | null {
    switch (stepId) {
      case 'bbox':
      case 'crop':
        return hasFrames ? null : 'Ambil gambar dulu di fase Capture'
      case 'croptop':
      case 'label':
        return hasCrops ? null : 'Crop Object dulu — belum ada crop yang bisa dilabel'
      case 'review':
        return hasLabels ? null : 'Label minimal 1 crop dulu'
      case 'split':
        return hasLabels ? null : 'Label dataset dulu sebelum bisa displit'
      default:
        return null
    }
  }

  function isDone(stepId: string): boolean {
    switch (stepId) {
      case 'bbox':
      case 'crop':
        return hasCrops
      case 'label':
      case 'review':
        return hasLabels
      case 'split':
        return hasSplit
      default:
        return false
    }
  }

  // ============================================================
  // state milik step "Label" (Grid/Swipe) — sample yang dipilih dipakai
  // bersama oleh step Crop Atas & Label, supaya pindah antar keduanya tidak
  // perlu pilih ulang sample yang sama
  // ============================================================
  const [selectedSample, setSelectedSample] = useState('')
  // daftar kelas bbox resep YOLO — dibaca dari config (dimiliki/ditulis oleh
  // YoloSplit.tsx), CUMA dibaca di sini untuk diteruskan ke Gallery/ImageModal
  // supaya pemilih kelas & warna box saat koreksi manual sinkron dengan
  // daftar kelas yang sama dipakai saat generate split
  const [yoloClassNames, setYoloClassNames] = useState<string[]>(['object'])
  const [labelMode, setLabelMode] = useState<LabelMode>('grid')
  const [topPercent, setTopPercent] = useState(25)
  const [useTopCrops, setUseTopCrops] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [topGenLoading, setTopGenLoading] = useState(false)
  const [topGenResult, setTopGenResult] = useState<CropTopResult | null>(null)
  const [topGenError, setTopGenError] = useState<string | null>(null)
  const [previewNatural, setPreviewNatural] = useState<{ w: number; h: number } | null>(null)
  const [previewCrop, setPreviewCrop] = useState<CropImage | null>(null)

  const [labelName, setLabelName] = useState('')
  const [leftLabel, setLeftLabel] = useState('')
  const [rightLabel, setRightLabel] = useState('')
  const [crops, setCrops] = useState<CropImage[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [openPath, setOpenPath] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<Record<string, string>>({})

  useEffect(() => {
    if (samples.length === 0) {
      if (selectedSample) setSelectedSample('')
    } else if (!samples.includes(selectedSample)) {
      setSelectedSample(samples[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples.join(','), selectedSample])

  function reloadCrops() {
    if (!selectedSample || !projectId) {
      setCrops([])
      return
    }
    const load = useTopCrops ? api.listTopCrops : api.listCrops
    load(projectId, selectedSample, undefined, true).then(setCrops).catch(() => {})
  }
  useEffect(reloadCrops, [selectedSample, projectId, useTopCrops])

  useEffect(() => {
    setPreviewNatural(null)
    if (!selectedSample || !projectId) return setPreviewCrop(null)
    api
      .listCrops(projectId, selectedSample, 1, false)
      .then((list) => setPreviewCrop(list[0] ?? null))
      .catch(() => setPreviewCrop(null))
  }, [selectedSample, projectId])

  // config Persiapan Dataset per project — persisten (bukan cuma di memori
  // tab ini), mencakup persentase crop-atas DAN setup langkah Label (sample
  // yang dipilih, mode Grid/Swipe, nama label yang sudah diketik) — supaya
  // refresh browser tidak memaksa user mengatur ulang semuanya dari nol.
  // `selected_sample` yang tidak valid lagi (mis. sample sudah dihapus)
  // otomatis dikoreksi oleh efek validasi sample di atas begitu diterapkan.
  useEffect(() => {
    setConfigLoaded(false)
    if (!projectId) return
    api
      .getDatasetPrepConfig(projectId)
      .then((cfg) => {
        setTopPercent(cfg.top_crop_percent)
        setUseTopCrops(cfg.use_top_crops)
        setLabelMode(cfg.label_mode)
        setLabelName(cfg.label_name)
        setLeftLabel(cfg.swipe_left_label)
        setRightLabel(cfg.swipe_right_label)
        if (cfg.selected_sample) setSelectedSample(cfg.selected_sample)
        if (cfg.yolo_class_names.length > 0) setYoloClassNames(cfg.yolo_class_names)
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true))
  }, [projectId])

  // partial update — kirim CUMA field yang jadi tanggung jawab komponen ini,
  // JANGAN sertakan retention_days: itu sekarang dimiliki CleanupPanel.tsx
  // (menu Pengaturan), supaya dua-duanya bisa nulis ke file config yang sama
  // tanpa saling menimpa nilai satu sama lain (lihat dataset_prep_config.py)
  useEffect(() => {
    if (!projectId || !configLoaded) return
    const timer = setTimeout(() => {
      api
        .saveDatasetPrepConfig(projectId, {
          top_crop_percent: topPercent,
          use_top_crops: useTopCrops,
          selected_sample: selectedSample,
          label_mode: labelMode,
          label_name: labelName,
          swipe_left_label: leftLabel,
          swipe_right_label: rightLabel,
        })
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [projectId, configLoaded, topPercent, useTopCrops, selectedSample, labelMode, labelName, leftLabel, rightLabel])

  // partial update TERPISAH khusus daftar kelas YOLO — dipisah dari effect di
  // atas (bukan cuma digabung) karena field ini cuma relevan buat resep yolo
  // dan berubah dari trigger yang beda (popup "pilih kelas" di ImageModal,
  // dipicu dari Gallery lewat onClassNamesChange), biar tidak ikut nge-
  // trigger simpan tiap kali ngetik di form Label
  useEffect(() => {
    if (!projectId || !configLoaded || datasetTarget !== 'yolo') return
    const timer = setTimeout(() => {
      api.saveDatasetPrepConfig(projectId, { yolo_class_names: yoloClassNames }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [projectId, configLoaded, datasetTarget, yoloClassNames])

  async function handleGenerateTopCrops() {
    if (!projectId || !selectedSample) return
    setTopGenLoading(true)
    setTopGenError(null)
    try {
      const res = await api.cropTopObjects(projectId, selectedSample, topPercent, true)
      setTopGenResult(res)
    } catch (e) {
      setTopGenError(e instanceof Error ? e.message : 'Gagal generate crop bagian atas')
    } finally {
      setTopGenLoading(false)
    }
  }

  useEffect(() => {
    setPage(0)
    setChecked(new Set())
    setOpenPath(null)
  }, [selectedSample, labelMode, useTopCrops])

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
      const res = await api.assignLabel(
        projectId,
        label,
        selectedSample,
        filenames,
        useTopCrops ? 'crops_top' : 'crops',
      )
      setAssignResult(`${res.assigned} crop di-assign ke label "${label}"`)
      setCrops((prev) => prev.filter((c) => !paths.includes(c.path)))
      setChecked(new Set())
      reloadLabels()
    } finally {
      setAssigning(false)
    }
  }

  function handleSwipeAssigned() {
    reloadLabels()
    reloadCrops()
  }

  const totalPages = Math.max(1, Math.ceil(crops.length / ITEMS_PER_PAGE))
  const currentPage = Math.min(page, totalPages - 1)
  const pagedCrops = crops.slice(currentPage * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE)
  const swipeReady = leftLabel.trim() !== '' && rightLabel.trim() !== ''

  const activeStepDef = recipe.steps.find((s) => s.id === step)

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Persiapan Dataset
      </h3>
      <p className="mb-4 text-[11px] text-slate-600">
        {projectName} / Persiapan Dataset / {activeStepDef?.label ?? '—'}
      </p>

      <RecipeStepNav
        steps={recipe.steps}
        active={step}
        isDone={isDone}
        disabledReason={disabledReason}
        onSelect={setStep}
      />

      {(step === 'bbox' || step === 'crop') && (
        <Gallery
          projectId={projectId}
          cameras={cameras}
          counts={counts}
          focusLabel={focusLabel}
          onResetAll={onResetAll}
          viewMode={step === 'bbox' ? 'frame' : 'crop'}
          showAutoAnnotate={datasetTarget !== 'yolo'}
          classNames={datasetTarget === 'yolo' ? yoloClassNames : ['person']}
          manageClasses={datasetTarget === 'yolo'}
          onClassNamesChange={setYoloClassNames}
        />
      )}

      {step === 'croptop' && (
        <div>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
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

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Crop Tambahan (Bagian Atas)
              </h4>
              <ActionBadge kind="safe" />
            </div>
            <p className="mb-3 max-w-2xl text-xs text-slate-500">
              Generate versi crop tambahan yang cuma mengambil bagian <strong className="text-slate-400">ATAS</strong>{' '}
              dari crop full-body yang sudah ada (mis. fokus ke area leher/dada tempat lanyard biasa terlihat). Crop
              full-body yang ada sekarang <strong className="text-slate-400">tidak berubah/terhapus</strong> — ini
              murni tambahan, opsional dipakai untuk labeling lewat toggle di bawah.
            </p>

            <div className="flex flex-wrap items-start gap-6">
              <div className="max-w-xs flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-400">
                  Persentase bagian atas: <span className="font-mono text-slate-200">{topPercent}%</span>
                </label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  value={topPercent}
                  onChange={(e) => setTopPercent(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <button
                  type="button"
                  onClick={handleGenerateTopCrops}
                  disabled={topGenLoading || !selectedSample}
                  className="mt-3 rounded-lg border border-amber-800 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {topGenLoading ? 'Meng-generate…' : `Generate Crop ${topPercent}% Atas`}
                </button>
                {topGenError && <p className="mt-2 text-xs text-red-400">{topGenError}</p>}
                {topGenResult && (
                  <p className="mt-2 text-xs text-slate-500">
                    {topGenResult.processed} crop diproses ({topGenResult.skipped} dilewati) dari{' '}
                    {topGenResult.total_source} crop full-body.
                  </p>
                )}
                <label className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={useTopCrops}
                    onChange={(e) => setUseTopCrops(e.target.checked)}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  Gunakan crop bagian atas ini untuk langkah Label (bukan full-body)
                </label>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">Preview</p>
                {!previewCrop ? (
                  <p className="max-w-[9rem] text-xs text-slate-500">Belum ada crop full-body untuk contoh preview.</p>
                ) : (
                  <div className="flex items-end gap-3">
                    <div className="text-center">
                      <img
                        src={api.sampleImageUrl(projectId, previewCrop.path)}
                        alt="Crop asli"
                        onLoad={(e) =>
                          setPreviewNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
                        }
                        className="w-28 rounded border border-slate-700 bg-black opacity-50"
                      />
                      <p className="mt-1 text-[10px] text-slate-500">Asli</p>
                    </div>
                    <div className="text-center">
                      <div
                        className="relative w-28 overflow-hidden rounded border-2 border-amber-600 bg-black"
                        style={{
                          height: previewNatural
                            ? `${((PREVIEW_WIDTH_PX * previewNatural.h) / previewNatural.w) * (topPercent / 100)}px`
                            : '20px',
                        }}
                      >
                        <img
                          src={api.sampleImageUrl(projectId, previewCrop.path)}
                          alt="Preview hasil crop bagian atas"
                          className="absolute left-0 top-0 w-28"
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-amber-400">Hasil ({topPercent}%)</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 'label' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-4">
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

          <div className="mb-4 flex items-center gap-4">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Cara Label:</span>
            <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setLabelMode('grid')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  labelMode === 'grid' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mode Grid
              </button>
              <button
                type="button"
                onClick={() => setLabelMode('swipe')}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  labelMode === 'swipe' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Mode Swipe
              </button>
            </div>
            {useTopCrops && (
              <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                sumber: crop bagian atas {topPercent}%
              </span>
            )}
          </div>

          {labelMode === 'grid' ? (
            <>
              <div className="mb-4 max-w-xs">
                <label className="mb-1 block text-xs font-medium text-slate-400">Nama Label</label>
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
                  {checked.size > 0 && <span className="text-xs text-slate-400">{checked.size} dipilih</span>}
                  <button
                    type="button"
                    onClick={handleAssign}
                    disabled={assigning || checked.size === 0 || !labelName.trim()}
                    className="rounded-lg border border-emerald-900 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assigning ? 'Menyimpan…' : `Assign ke Label${checked.size ? ` (${checked.size})` : ''}`}
                  </button>
                </div>
              </div>

              {assignResult && <p className="mb-3 text-xs text-slate-500">{assignResult}</p>}

              {crops.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Tidak ada crop tersisa untuk dilabel di sample ini — semua sudah di-assign, atau belum ada crop
                  sama sekali (kembali ke langkah "Crop").
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-9 gap-3">
                    {pagedCrops.map((c) => (
                      <div key={c.path} className="relative overflow-hidden rounded-md border border-slate-800 bg-slate-950">
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
                        <button type="button" onClick={() => setOpenPath(c.path)} className="block w-full text-left">
                          <div className="aspect-square overflow-hidden bg-black">
                            <img
                              src={api.sampleImageUrl(projectId, c.path)}
                              alt={c.path}
                              loading="lazy"
                              onLoad={(e) => handleImgLoad(c.path, e)}
                              className={`h-full w-full transition hover:opacity-80 ${
                                useTopCrops ? 'object-contain' : 'object-cover'
                              }`}
                            />
                          </div>
                          <div className="space-y-0.5 px-1.5 py-1">
                            <p className="truncate text-[11px] font-medium text-slate-300">{c.label}</p>
                            <p className="font-mono text-[10px] text-slate-500">{formatFileSize(c.size_bytes)}</p>
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
                  <label className="mb-1 block text-xs font-medium text-red-400">Label Kiri (swipe kiri)</label>
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
                  <label className="mb-1 block text-xs font-medium text-emerald-400">Label Kanan (swipe kanan)</label>
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
                <p className="text-sm text-slate-500">Isi Label Kiri dan Label Kanan dulu untuk mulai swipe.</p>
              ) : crops.length === 0 ? (
                <p className="text-sm text-slate-500">Tidak ada crop tersisa untuk dilabel di sample ini.</p>
              ) : (
                <SwipeLabeler
                  key={`${selectedSample}-${leftLabel}-${rightLabel}-${useTopCrops}`}
                  projectId={projectId}
                  crops={crops}
                  sample={selectedSample}
                  source={useTopCrops ? 'crops_top' : 'crops'}
                  leftLabel={leftLabel.trim()}
                  rightLabel={rightLabel.trim()}
                  onAssigned={handleSwipeAssigned}
                />
              )}
            </>
          )}
        </div>
      )}

      {step === 'review' && (
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hasil Label ({existingLabels.reduce((sum, l) => sum + l.count, 0)})
          </h4>
          <LabelReview projectId={projectId} labels={existingLabels} onChanged={reloadLabels} />
        </div>
      )}

      {step === 'split' && (
        <div className="rounded-lg border border-blue-900/60 bg-blue-950/10 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-300">
              Split Dataset — Penutup Fase Ini
            </h4>
            <ActionBadge kind="overwrite" />
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Ini titik transisi ke fase <strong className="text-slate-300">Training</strong> — generate ulang akan
            menghapus total folder <code>{datasetTarget === 'yolo' ? 'split_yolo/' : 'split/'}</code> lama dan
            menulis ulang dari nol.
          </p>
          {datasetTarget === 'yolo' ? (
            <YoloSplit projectId={projectId} classNames={yoloClassNames} />
          ) : (
            <DatasetSplit projectId={projectId} />
          )}
        </div>
      )}

      {openCrop && (
        <ImageModal
          src={api.sampleImageUrl(projectId, openCrop.path)}
          editable={false}
          label={openCrop.label}
          filename={filenameOf(openCrop.path)}
          caption={`${openCrop.label} · ${dimensions[openCrop.path] ?? '…'} · ${formatFileSize(openCrop.size_bytes)}`}
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
