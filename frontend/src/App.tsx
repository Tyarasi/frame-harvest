import { useCallback, useEffect, useState } from 'react'
import { api, sanitizeLabel, type Camera, type Project, type Resolution, type StatusResponse } from './api'
import { CameraSelector } from './components/CameraSelector'
import { CaptureControls } from './components/CaptureControls'
import { DatasetPreparation } from './components/DatasetPreparation'
import { Gallery } from './components/Gallery'
import { LivePreview } from './components/LivePreview'
import { SettingsIcon } from './components/icons'
import { ManageCameras } from './components/ManageCameras'
import { ManageProjects } from './components/ManageProjects'
import { Modal } from './components/Modal'
import { StatusPanel } from './components/StatusPanel'
import { TrainingPage } from './components/TrainingPage'

type Page = 'capture' | 'integration' | 'training'

const PAGES: Page[] = ['capture', 'integration', 'training']

// baca tab aktif dari URL (?page=...) supaya refresh browser tidak selalu
// balik ke tab "Capture" — tab yang lagi dibuka ikut tersimpan di address bar
function getInitialPage(): Page {
  const param = new URLSearchParams(window.location.search).get('page')
  return (PAGES as string[]).includes(param ?? '') ? (param as Page) : 'capture'
}

type CaptureTab = 'live' | 'gallery'

const CAPTURE_TABS: Array<{ key: CaptureTab; label: string }> = [
  { key: 'live', label: 'Live Capture' },
  { key: 'gallery', label: 'Galeri' },
]

function getInitialCaptureTab(): CaptureTab {
  const param = new URLSearchParams(window.location.search).get('captureTab')
  const keys = CAPTURE_TABS.map((t) => t.key) as string[]
  return keys.includes(param ?? '') ? (param as CaptureTab) : 'live'
}

export default function App() {
  const [page, setPageState] = useState<Page>(getInitialPage)
  const [captureTab, setCaptureTabState] = useState<CaptureTab>(getInitialCaptureTab)

  function setPage(next: Page) {
    setPageState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('page', next)
    window.history.replaceState({}, '', url)
  }

  function setCaptureTab(next: CaptureTab) {
    setCaptureTabState(next)
    const url = new URL(window.location.href)
    url.searchParams.set('captureTab', next)
    window.history.replaceState({}, '', url)
  }
  const [cameras, setCameras] = useState<Camera[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
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
  const [togglingStream, setTogglingStream] = useState(false)
  const [captureTargets, setCaptureTargets] = useState<Set<string>>(new Set())
  const [focusLabel, setFocusLabel] = useState<string | null>(null)

  const displayCameras = status?.cameras ?? cameras
  const runningIds = new Set(status?.interval_running ?? [])

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

  async function handleAddProject(name: string) {
    const res = await api.addProject(name)
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 px-6 py-4 lg:px-10">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Frame - Harvest - Hampir - Moon</h1>
            <p className="text-xs text-slate-500">
              Pengumpulan gambar dari stream RTSP untuk dataset training
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {projects.length > 0 && (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}
                  </option>
                ))}
              </select>
            )}
            {projects.length > 0 && (
              <button
                onClick={() => setShowManageProjects(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
                Kelola Project
              </button>
            )}
            {page === 'capture' && cameras.length > 0 && (
              <button
                onClick={() => setShowManage(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
              >
                <SettingsIcon className="h-3.5 w-3.5" />
                Kelola Kamera
              </button>
            )}
          </div>
        </div>
        <div className="mx-auto flex max-w-[1600px] items-center gap-1 border-b border-slate-800 px-6 lg:px-10">
          <button
            type="button"
            onClick={() => setPage('capture')}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
              page === 'capture'
                ? 'border-blue-500 text-slate-100'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            Capture
          </button>
          <button
            type="button"
            onClick={() => setPage('integration')}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
              page === 'integration'
                ? 'border-blue-500 text-slate-100'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            Persiapan Dataset
          </button>
          <button
            type="button"
            onClick={() => setPage('training')}
            className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
              page === 'training'
                ? 'border-blue-500 text-slate-100'
                : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            Training
          </button>
        </div>
      </header>

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
            <ManageCameras
              cameras={cameras}
              onAdd={handleAddCamera}
              onDelete={handleDeleteCamera}
            />
          </div>
        ) : page === 'integration' ? (
          <DatasetPreparation
            projectId={projectId}
            projectName={projects.find((p) => p.id === projectId)?.name ?? ''}
            counts={status?.counts ?? {}}
          />
        ) : page === 'training' ? (
          <TrainingPage
            projectId={projectId}
            projectName={projects.find((p) => p.id === projectId)?.name ?? ''}
          />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Capture
              </h3>
              <span className="rounded-full border border-blue-900 bg-blue-950/40 px-3 py-1 text-xs font-medium text-blue-300">
                Project aktif: {projects.find((p) => p.id === projectId)?.name || '(tidak ada)'}
              </span>
            </div>

            <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-800">
              {CAPTURE_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setCaptureTab(t.key)}
                  className={`border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                    captureTab === t.key
                      ? 'border-blue-500 text-slate-100'
                      : 'border-transparent text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {captureTab === 'live' ? (
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
                    <div className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-400">
                      {error}
                    </div>
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

                  <StatusPanel
                    cameras={displayCameras}
                    counts={status?.counts ?? {}}
                    lastSaved={lastSaved}
                  />
                </div>
              </div>
            ) : (
              <Gallery
                projectId={projectId}
                cameras={cameras}
                counts={status?.counts ?? {}}
                focusLabel={focusLabel}
                onResetAll={refreshStatus}
              />
            )}
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
    </div>
  )
}
