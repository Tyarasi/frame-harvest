export interface Camera {
  id: string
  name: string
  status: string
  active: boolean
}

export interface Project {
  id: string
  name: string
}

export interface DatasetImage {
  path: string
  camera_id: string
  label: string
  size_bytes: number
  bbox_count: number
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface StatusResponse {
  cameras: Camera[]
  counts: Record<string, number>
  interval_running: string[]
}

export interface Resolution {
  width: number
  height: number
}

export interface YoloBox {
  x: number
  y: number
  w: number
  h: number
}

export interface AnnotateResult {
  total_images: number
  processed: number
  skipped: number
  with_person: number
  total_boxes: number
}

export interface CropResult {
  total_images: number
  processed: number
  skipped: number
  images_with_boxes: number
  total_crops: number
}

export interface CropImage {
  path: string
  camera_id: string
  label: string
  size_bytes: number
}

export interface LabelInfo {
  name: string
  count: number
}

export interface LabelImage {
  path: string
  label: string
  size_bytes: number
}

export interface SplitCounts {
  train: number
  val: number
  test: number
}

export type SplitSummary = Record<string, SplitCounts>

export interface TrainingConfig {
  backbone: string
  epochs: number
  batch_size: number
  learning_rate: number
  freeze_backbone: boolean
}

export interface TrainingMetricPoint {
  epoch: number
  loss: number
  accuracy: number
  precision: number
  recall: number
  f1: number
}

export interface TrainingStatus {
  status: 'idle' | 'running' | 'finished' | 'stopped' | 'error'
  epoch: number
  total_epochs: number
  history: TrainingMetricPoint[]
  error: string | null
  simulated: boolean
}

export interface TestEvalResult {
  num_images: number
  class_names: string[]
  accuracy: number
  precision: number
  recall: number
  f1: number
}

// Cermin dari CaptureManager._safe_name() di backend — dipakai untuk menebak
// nama folder label secara optimis di frontend (mis. buat auto-fokus galeri).
export function sanitizeLabel(name: string): string {
  const lowered = name.trim().toLowerCase().replace(/ /g, '_')
  const cleaned = lowered.replace(/[^a-z0-9_-]/g, '')
  return cleaned || 'tanpa_label'
}

function formatErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  // FastAPI/Pydantic validation error (422): array of { msg, loc, ... }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item === 'object' && 'msg' in item ? String(item.msg) : null))
      .filter((m): m is string => Boolean(m))
    if (messages.length > 0) return messages.join('; ')
  }
  return fallback
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const fallback = `Request gagal (${res.status})`
    const body = await res.json().catch(() => ({ detail: fallback }))
    throw new Error(formatErrorDetail(body.detail, fallback))
  }
  return res.json()
}

function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}

export const api = {
  // ---- Project (dataset terpisah — kamera tetap global, lihat di bawah) ----
  listProjects: () => request<Project[]>('/api/projects'),

  addProject: (name: string) =>
    request<Project>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  renameProject: (projectId: string, name: string) =>
    request<Project>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deleteProject: (projectId: string) =>
    request<{ deleted: string }>(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    }),

  // ---- Kamera (global, shared lintas project) ----
  cameras: () => request<Camera[]>('/api/cameras'),

  addCamera: (name: string, rtsp_url: string) =>
    request<{ id: string; name: string }>('/api/cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rtsp_url }),
    }),

  deleteCamera: (camera_id: string) =>
    request<{ deleted: string }>(`/api/cameras/${encodeURIComponent(camera_id)}`, {
      method: 'DELETE',
    }),

  startStream: (camera_id: string) =>
    request<{ active: boolean }>(
      `/api/cameras/${encodeURIComponent(camera_id)}/start`,
      { method: 'POST' },
    ),

  stopStream: (camera_id: string) =>
    request<{ active: boolean }>(
      `/api/cameras/${encodeURIComponent(camera_id)}/stop`,
      { method: 'POST' },
    ),

  // ---- Status & capture (di-scope ke 1 project) ----
  status: (projectId: string) => request<StatusResponse>(`${p(projectId)}/status`),

  capture: (projectId: string, camera_id: string, label: string, resolution?: Resolution) =>
    request<{ saved: string }>('/api/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        camera_id,
        label,
        width: resolution?.width,
        height: resolution?.height,
      }),
    }),

  startInterval: (
    projectId: string,
    camera_id: string,
    label: string,
    interval_sec: number,
    resolution?: Resolution,
  ) =>
    request<{ running: boolean }>('/api/interval/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        camera_id,
        label,
        interval_sec,
        width: resolution?.width,
        height: resolution?.height,
      }),
    }),

  stopInterval: (projectId: string, camera_id: string) =>
    request<{ running: boolean }>(
      `/api/interval/stop?project_id=${encodeURIComponent(projectId)}&camera_id=${encodeURIComponent(camera_id)}`,
      { method: 'POST' },
    ),

  streamUrl: (camera_id: string) => `/stream/${encodeURIComponent(camera_id)}`,

  // ---- Sample (raw capture, per-project) ----
  listImages: (projectId: string, label: string, limit = 5000) =>
    request<DatasetImage[]>(
      `${p(projectId)}/sample/${encodeURIComponent(label)}/images?limit=${limit}`,
    ),

  listAllImages: (projectId: string, limit = 5000) =>
    request<DatasetImage[]>(`${p(projectId)}/sample/images?limit=${limit}`),

  sampleImageUrl: (projectId: string, path: string) =>
    `/projects/${encodeURIComponent(projectId)}/sample/${path}`,

  // hasil assign label (dataset/<label>/<filename>.jpg) — terpisah dari sample/
  labelImageUrl: (projectId: string, path: string) =>
    `/projects/${encodeURIComponent(projectId)}/dataset/${path}`,

  // file label YOLO ("<nama_file>.txt") disimpan di sebelah "<nama_file>.jpg"
  // yang sama — lihat person_annotator.py di backend
  annotationUrl: (projectId: string, path: string) =>
    `/projects/${encodeURIComponent(projectId)}/sample/${path.replace(/\.jpg$/i, '.txt')}`,

  deleteImages: (projectId: string, label: string, filenames: string[]) =>
    request<{ deleted: number }>(
      `${p(projectId)}/sample/${encodeURIComponent(label)}/images`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames }),
      },
    ),

  annotateLabel: (projectId: string, label: string, overwrite = false, confidence = 0.4) =>
    request<AnnotateResult>(`${p(projectId)}/sample/${encodeURIComponent(label)}/annotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confidence, overwrite }),
    }),

  annotateAll: (projectId: string, overwrite = false, confidence = 0.4) =>
    request<AnnotateResult>(`${p(projectId)}/sample/annotate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confidence, overwrite }),
    }),

  saveBoxes: (projectId: string, label: string, filename: string, boxes: YoloBox[]) =>
    request<{ boxes: number }>(
      `${p(projectId)}/sample/${encodeURIComponent(label)}/images/${encodeURIComponent(filename)}/boxes`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxes }),
      },
    ),

  cropObjects: (projectId: string, label: string, overwrite = false) =>
    request<CropResult>(`${p(projectId)}/sample/${encodeURIComponent(label)}/crop-objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overwrite }),
    }),

  cropAllObjects: (projectId: string, overwrite = false) =>
    request<CropResult>(`${p(projectId)}/sample/crop-objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overwrite }),
    }),

  listCrops: (projectId: string, label: string, limit = 5000, excludeAssigned = false) =>
    request<CropImage[]>(
      `${p(projectId)}/sample/${encodeURIComponent(label)}/crops?limit=${limit}&exclude_assigned=${excludeAssigned}`,
    ),

  listAllCrops: (projectId: string, limit = 5000, excludeAssigned = false) =>
    request<CropImage[]>(
      `${p(projectId)}/sample/crops?limit=${limit}&exclude_assigned=${excludeAssigned}`,
    ),

  resetAllSamples: (projectId: string) =>
    request<{ deleted: number }>(`${p(projectId)}/sample/reset`, { method: 'POST' }),

  deleteSample: (projectId: string, label: string) =>
    request<{ deleted: string }>(`${p(projectId)}/sample/${encodeURIComponent(label)}`, {
      method: 'DELETE',
    }),

  deleteCrops: (projectId: string, label: string, filenames: string[]) =>
    request<{ deleted: number }>(
      `${p(projectId)}/sample/${encodeURIComponent(label)}/crops`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filenames }),
      },
    ),

  // ---- Label (dataset klasifikasi hasil assign, per-project) ----
  listLabels: (projectId: string) => request<LabelInfo[]>(`${p(projectId)}/labels`),

  assignLabel: (projectId: string, label: string, sample: string, filenames: string[]) =>
    request<{ assigned: number }>(`${p(projectId)}/labels/${encodeURIComponent(label)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample, filenames }),
    }),

  listLabelImages: (projectId: string, label: string, limit = 5000) =>
    request<LabelImage[]>(`${p(projectId)}/labels/${encodeURIComponent(label)}/images?limit=${limit}`),

  deleteLabelImages: (projectId: string, label: string, filenames: string[]) =>
    request<{ deleted: number }>(`${p(projectId)}/labels/${encodeURIComponent(label)}/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames }),
    }),

  deleteLabel: (projectId: string, label: string) =>
    request<{ deleted: string }>(`${p(projectId)}/labels/${encodeURIComponent(label)}`, {
      method: 'DELETE',
    }),

  // ---- Split dataset train/val/test (per-project, format ImageFolder) ----
  createSplit: (
    projectId: string,
    trainRatio: number,
    valRatio: number,
    testRatio: number,
    seed = 42,
  ) =>
    request<SplitSummary>(`${p(projectId)}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        train_ratio: trainRatio,
        val_ratio: valRatio,
        test_ratio: testRatio,
        seed,
      }),
    }),

  getSplit: (projectId: string) => request<SplitSummary>(`${p(projectId)}/split`),

  // ---- Training setup (per-project) ----
  getTrainingConfig: (projectId: string) =>
    request<TrainingConfig>(`${p(projectId)}/training-config`),

  saveTrainingConfig: (projectId: string, config: TrainingConfig) =>
    request<TrainingConfig>(`${p(projectId)}/training-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }),

  // ---- Training run (sungguhan, jalan langsung di backend) ----
  getTrainingDevice: () => request<{ device: 'cpu' | 'gpu' }>('/api/training-device'),

  startTrainingRun: (projectId: string) =>
    request<{ started: boolean }>(`${p(projectId)}/training/start`, { method: 'POST' }),

  getTrainingRunStatus: (projectId: string) =>
    request<TrainingStatus>(`${p(projectId)}/training/status`),

  stopTrainingRun: (projectId: string) =>
    request<{ stopped: boolean }>(`${p(projectId)}/training/stop`, { method: 'POST' }),

  evaluateTestSet: (projectId: string) =>
    request<TestEvalResult>(`${p(projectId)}/training/evaluate-test`, { method: 'POST' }),
}
