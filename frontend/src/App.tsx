import { useCallback, useEffect, useState } from 'react'
import { api, sanitizeLabel, type Camera, type DatasetTarget, type Project, type Resolution, type StatusResponse } from './api'
import { CameraSelector } from './components/cameras/CameraSelector'
import { CaptureControls } from './components/cameras/CaptureControls'
import { LivePreview } from './components/cameras/LivePreview'
import { ManageCameras } from './components/cameras/ManageCameras'
import { StatusPanel } from './components/cameras/StatusPanel'
import { CleanupPanel } from './components/dataset-prep/CleanupPanel'
import { PersiapanDatasetPhase } from './components/dataset-prep/PersiapanDatasetPhase'
import { ManageProjects } from './components/projects/ManageProjects'
import { PhaseStepper } from './components/projects/PhaseStepper'
import { ProjectBar } from './components/projects/ProjectBar'
import { TrainingPage } from './components/training/TrainingPage'
import { Modal } from './components/ui/Modal'

type Page = 'capture' | 'integration' | 'training'

const PHASES: Array<{ key: Page; label: string }> = [
  { key: 'capture', label: 'Capture' },
  { key: 'integration', label: 'Persiapan Dataset' },
  { key: 'training', label: 'Training' },
]

// baca tab aktif dari URL (?page=...) supaya refresh browser tidak selalu
// balik ke tab "Capture" — tab yang lagi dibuka ikut tersimpan di address bar
function getInitialPage(): Page {
  const param = new URLSearchParams(window.location.search).get('page')
  return (PHASES.map((p) => p.key) as string[]).includes(param ?? '') ? (param as Page) : 'capture'
}

// project aktif ikut disimpan di URL (?project=...) juga — sebelumnya tidak,
// jadi tiap refresh selalu balik ke project PERTAMA dari daftar backend
// (urutan projects.yaml), bukan project yang terakhir dipilih user
function getInitialProjectId(): string {
  return new URLSearchParams(window.location.search).get('project') ?? ''
}

export default function App() {
  const [page, setPageState] = useState<Page>(getInitialPage)

  function setPage(next: Page) {
    setPageState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('page', next)
    window.history.replaceState({}, '', url)
  }

  const [cameras, setCameras] = useState<Camera[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState(getInitialProjectId)
  const [label, setLabel] = useState('')
  const [resolution, setResolution] = useState('1280x720')
  const [intervalSec, setIntervalSec] = useState(5)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [showManageProjects, setShowManageProjects] = useState(false)
  const [showCleanup, setShowCleanup] = useState(false)
  const [togglingStream, setTogglingStream] = useState(false)
  const [captureTargets, setCaptureTargets] = useState<Set<string>>(new Set())
  const [focusLabel, setFocusLabel] = useState<string | null>(null)
  // dipakai buat gating fase Training di PhaseStepper — bukan buat konten,
  // cuma existence check ringan. Dua indikator TERPISAH karena resep beda
  // total: resnet "Persiapan Dataset selesai" = sudah ada label ter-assign,
  // yolo TIDAK PERNAH lewat assign-label sama sekali (hasLabels mustahil
  // true) — indikatornya = split_yolo sudah pernah digenerate.
  const [hasLabels, setHasLabels] = useState(false)
  const [hasYoloSplit, setHasYoloSplit] = useState(false)

  const displayCameras = status?.cameras ?? cameras
  const runningIds = new Set(status?.interval_running ?? [])
  const activeProject = projects.find((p) => p.id === projectId)
  const totalFrames = Object.values(status?.counts ?? {}).reduce((a, b) => a + b, 0)

  // buang target yang kameranya sudah dihapus
  useEffect(() => {
    setCaptureTargets((prev) => {
      const validIds = new Set(cameras.map((c) => c.id))
      return new Set([...prev].filter((id) => validIds.has(id)))
    })
  }, [cameras])

  // default: target = kamera yang sedang di-preview, kalau belum ada target sama sekali
  useEffect(() => {
    if (loaded && selectedId) {
      setCaptureTargets((prev) => (prev.size === 0 ? new Set([selectedId]) : prev))
    }
  }, [loaded, selectedId])

  function toggleCaptureTarget(id: string) {
    setCaptureTargets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const reloadCameras = useCallback(async (preferId?: string) => {
    const list = await api.cameras()
    setCameras(list)
    setSelectedId((current) => {
      if (preferId && list.some((c) => c.id === preferId)) return preferId
      if (list.some((c) => c.id === current)) return current
      return list[0]?.id ?? ''
    })
    return list
  }, [])

  // sinkronkan project aktif ke URL tiap kali berubah — baik dari user pilih
  // dropdown, maupun dari resolusi otomatis di reloadProjects (mis. project
  // di URL sudah dihapus, fallback ke project pertama)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (projectId) url.searchParams.set('project', projectId)
    else url.searchParams.delete('project')
    window.history.replaceState({}, '', url)
  }, [projectId])

  const reloadProjects = useCallback(async (preferId?: string) => {
    const list = await api.listProjects()
    setProjects(list)
    setProjectId((current) => {
      if (preferId && list.some((p) => p.id === preferId)) return preferId
      if (list.some((p) => p.id === current)) return current
      return list[0]?.id ?? ''
    })
    return list
  }, [])

  useEffect(() => {
    Promise.all([reloadCameras(), reloadProjects()]).finally(() => setLoaded(true))
  }, [reloadCameras, reloadProjects])

  async function handleAddCamera(name: string, rtspUrl: string) {
    const res = await api.addCamera(name, rtspUrl)
    await reloadCameras(res.id)
  }

  async function handleDeleteCamera(id: string) {
    await api.deleteCamera(id)
    await reloadCameras()
  }

  async function handleAddProject(name: string, datasetTarget: DatasetTarget) {
    const res = await api.addProject(name, datasetTarget)
    await reloadProjects(res.id)
  }

  async function handleRenameProject(id: string, name: string) {
    await api.renameProject(id, name)
    await reloadProjects()
  }

  async function handleDeleteProject(id: string) {
    await api.deleteProject(id)
    await reloadProjects()
  }

  async function handleDeleteSample(name: string) {
    if (!projectId) return
    await api.deleteSample(projectId, name)
    refreshStatus()
  }

  const refreshStatus = useCallback(() => {
    if (!cameras.length || !projectId) return
    api.status(projectId).then(setStatus).catch(() => {})
  }, [cameras.length, projectId])

  useEffect(() => {
    setStatus(null)
    refreshStatus()
    const id = setInterval(refreshStatus, 3000)
    return () => clearInterval(id)
  }, [refreshStatus])

  // existence check ringan buat gating fase Training — cukup tahu "ada
  // minimal 1 label berisi gambar", bukan hitung total
  const reloadHasLabels = useCallback(() => {
    if (!projectId) return setHasLabels(false)
    api
      .listLabels(projectId)
      .then((labels) => setHasLabels(labels.some((l) => l.count > 0)))
      .catch(() => setHasLabels(false))
  }, [projectId])

  useEffect(() => {
    reloadHasLabels()
    const id = setInterval(reloadHasLabels, 5000)
    return () => clearInterval(id)
  }, [reloadHasLabels])

  const reloadHasYoloSplit = useCallback(() => {
    if (!projectId) return setHasYoloSplit(false)
    api
      .getYoloSplit(projectId)
      .then((summary) => setHasYoloSplit(summary.train + summary.val + summary.test > 0))
      .catch(() => setHasYoloSplit(false))
  }, [projectId])

  useEffect(() => {
    reloadHasYoloSplit()
    const id = setInterval(reloadHasYoloSplit, 5000)
    return () => clearInterval(id)
  }, [reloadHasYoloSplit])

  // indikator "Persiapan Dataset selesai" yang BENAR-BENAR dipakai gating —
  // pilih sumbernya sesuai resep aktif project, bukan selalu hasLabels
  const datasetPrepReady = activeProject?.dataset_target === 'yolo' ? hasYoloSplit : hasLabels

  const hasTargets = captureTargets.size > 0

  function parseResolution(value: string): Resolution | undefined {
    const match = /^(\d+)x(\d+)$/.exec(value)
    if (!match) return undefined
    return { width: Number(match[1]), height: Number(match[2]) }
  }

  async function handleCapture() {
    const targets = [...captureTargets]
    if (!targets.length || !projectId) return
    setCapturing(true)
    setError(null)
    try {
      // stream boleh nonaktif — backend konek RTSP sesaat untuk ambil frame
      const res = parseResolution(resolution)
      const results = await Promise.allSettled(
        targets.map((id) => api.capture(projectId, id, label || 'tanpa_label', res)),
      )
      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.length - succeeded
      setLastSaved(
        failed === 0
          ? `${succeeded} gambar tersimpan dari ${targets.length} kamera`
          : `${succeeded} tersimpan, ${failed} gagal`,
      )
      if (succeeded > 0) setFocusLabel(sanitizeLabel(label))
      refreshStatus()
    } finally {
      setCapturing(false)
    }
  }

  const targetsRunning = [...captureTargets].filter((id) => runningIds.has(id))
  const intervalRunning = targetsRunning.length > 0
  const streamActive = displayCameras.find((c) => c.id === selectedId)?.active ?? false

  async function handleToggleStream() {
    setTogglingStream(true)
    setError(null)
    try {
      if (streamActive) {
        await api.stopStream(selectedId)
      } else {
        await api.startStream(selectedId)
      }
      refreshStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah status stream')
    } finally {
      setTogglingStream(false)
    }
  }

  async function handleToggleInterval() {
    if (!projectId) return
    setError(null)
    try {
      if (intervalRunning) {
        await Promise.allSettled(targetsRunning.map((id) => api.stopInterval(projectId, id)))
      } else {
        const targets = [...captureTargets]
        if (!targets.length) return
        const res = parseResolution(resolution)
        await Promise.allSettled(
          targets.map((id) =>
            api.startInterval(projectId, id, label || 'tanpa_label', intervalSec, res),
          ),
        )
        setFocusLabel(sanitizeLabel(label))
      }
      refreshStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah mode interval')
    }
  }

  // Navigasi TINGKAT 1 (fase) — Persiapan Dataset butuh minimal 1 frame,
  // Training butuh minimal 1 label ter-assign. TIDAK disembunyikan kalau
  // belum bisa diakses — cuma dikunci + tooltip alasannya (lihat PhaseStepper).
  function phaseDisabledReason(key: string): string | null {
    if (key === 'integration' && totalFrames === 0) return 'Ambil gambar dulu di fase Capture'
    if (key === 'training' && !datasetPrepReady) {
      return activeProject?.dataset_target === 'yolo'
        ? 'Split Dataset dulu di fase Persiapan Dataset'
        : 'Label dataset dulu di fase Persiapan Dataset'
    }
    return null
  }
  function phaseCompleted(key: string): boolean {
    if (key === 'capture') return totalFrames > 0
    if (key === 'integration') return datasetPrepReady
    return false
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <ProjectBar
        projects={projects}
        projectId={projectId}
        onSelectProject={setProjectId}
        onManageProjects={() => setShowManageProjects(true)}
        onManageCameras={projects.length > 0 && cameras.length > 0 ? () => setShowManage(true) : undefined}
        onCleanupSample={projects.length > 0 ? () => setShowCleanup(true) : undefined}
      />

      {projects.length > 0 && cameras.length > 0 && (
        <PhaseStepper
          phases={PHASES}
          active={page}
          isCompleted={phaseCompleted}
          disabledReason={phaseDisabledReason}
          onSelect={(key) => setPage(key as Page)}
        />
      )}

      <main className="mx-auto max-w-[1600px] px-6 py-8 lg:px-10">
        {!loaded ? (
          <p className="text-slate-500">Memuat…</p>
        ) : projects.length === 0 ? (
          <div className="mx-auto max-w-md pt-12">
            <ManageProjects
              projects={projects}
              selectedId={projectId}
              onAdd={handleAddProject}
              onRename={handleRenameProject}
              onDelete={handleDeleteProject}
            />
          </div>
        ) : cameras.length === 0 ? (
          <div className="mx-auto max-w-md pt-12">
            <ManageCameras cameras={cameras} onAdd={handleAddCamera} onDelete={handleDeleteCamera} />
          </div>
        ) : page === 'integration' ? (
          <PersiapanDatasetPhase
            projectId={projectId}
            projectName={activeProject?.name ?? ''}
            datasetTarget={activeProject?.dataset_target ?? 'resnet'}
            stages={activeProject?.stages ?? []}
            onStagesChanged={() => reloadProjects(projectId)}
            cameras={cameras}
            counts={status?.counts ?? {}}
            focusLabel={focusLabel}
            onResetAll={refreshStatus}
          />
        ) : page === 'training' ? (
          <TrainingPage
            projectId={projectId}
            projectName={activeProject?.name ?? ''}
            datasetTarget={activeProject?.dataset_target ?? 'resnet'}
          />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Capture</h3>
            <p className="mb-4 text-[11px] text-slate-600">{activeProject?.name} / Live Capture</p>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <CameraSelector
                  cameras={displayCameras}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onToggleStream={handleToggleStream}
                  toggling={togglingStream}
                />

                <LivePreview
                  streamUrl={api.streamUrl(selectedId)}
                  cameraId={selectedId}
                  active={streamActive}
                />

                {error && (
                  <div className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-400">{error}</div>
                )}
              </div>

              <div className="space-y-4">
                <CaptureControls
                  cameras={displayCameras}
                  targets={captureTargets}
                  onToggleTarget={toggleCaptureTarget}
                  runningIds={runningIds}
                  hasTargets={hasTargets}
                  label={label}
                  onLabelChange={setLabel}
                  existingLabels={Object.keys(status?.counts ?? {})}
                  onDeleteSample={handleDeleteSample}
                  onCapture={handleCapture}
                  capturing={capturing}
                  resolution={resolution}
                  onResolutionChange={setResolution}
                  intervalSec={intervalSec}
                  onIntervalSecChange={setIntervalSec}
                  intervalRunning={intervalRunning}
                  onToggleInterval={handleToggleInterval}
                />

                <StatusPanel cameras={displayCameras} counts={status?.counts ?? {}} lastSaved={lastSaved} />
              </div>
            </div>
          </div>
        )}
      </main>

      {showManageProjects && (
        <Modal onClose={() => setShowManageProjects(false)}>
          <ManageProjects
            projects={projects}
            selectedId={projectId}
            onAdd={handleAddProject}
            onRename={handleRenameProject}
            onDelete={handleDeleteProject}
            onDone={() => setShowManageProjects(false)}
          />
        </Modal>
      )}

      {showManage && (
        <Modal onClose={() => setShowManage(false)}>
          <ManageCameras
            cameras={cameras}
            onAdd={handleAddCamera}
            onDelete={handleDeleteCamera}
            onDone={() => setShowManage(false)}
          />
        </Modal>
      )}

      {showCleanup && (
        <Modal onClose={() => setShowCleanup(false)}>
          <CleanupPanel
            projectId={projectId}
            projectName={activeProject?.name ?? ''}
            onCleaned={refreshStatus}
            onDone={() => setShowCleanup(false)}
          />
        </Modal>
      )}
    </div>
  )
}
