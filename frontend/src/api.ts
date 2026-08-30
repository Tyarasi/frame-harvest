export interface Camera {
  id: string
  name: string
  status: string
  active: boolean
}

// resep persiapan dataset yang dipakai project ini — lihat recipes.ts.
// Baru "resnet" yang beneran didukung; nilai lain nanti (mis. "yolo") akan
// mengarahkan UI Persiapan Dataset ke rangkaian langkah yang berbeda.
export type DatasetTarget = 'resnet' | 'yolo'

export interface Project {
  id: string
  name: string
  dataset_target: DatasetTarget
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

export interface CropTopResult {
  total_source: number
  processed: number
  skipped: number
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

export interface DatasetPrepConfig {
  top_crop_percent: number
  use_top_crops: boolean
  selected_sample: string
  label_mode: 'grid' | 'swipe'
  label_name: string
  swipe_left_label: string
  swipe_right_label: string
  retention_days: number
  yolo_class_name: string
}

export interface CleanupPreview {
  count: number
  total_bytes: number
  by_label: Record<string, number>
}

export interface CleanupResult {
  deleted: number
  freed_bytes: number
}

export interface TrainingMetricPoint {
  epoch: number
  loss: number
  accuracy: number
  precision: number
  recall: number
  f1: number
}

// ---- Resep YOLO — bentuk data beda dari classifier ResNet di atas ----

export interface YoloSplitSummary {
  train: number
  val: number
  test: number
}

export interface YoloTrainingConfig {
  epochs: number
  batch_size: number
  imgsz: number
}

export interface YoloMetricPoint {
  epoch: number
  box_loss: number
  cls_loss: number
  dfl_loss: number
  precision: number
  recall: number
  map50: number
  map50_95: number
}

export interface YoloTrainingStatus {
  status: 'idle' | 'running' | 'finished' | 'stopped' | 'error'
  epoch: number
  total_epochs: number
  history: YoloMetricPoint[]
  error: string | null
}

export interface YoloEvalResult {
  num_images: number
  precision: number
  recall: number
  map50: number
  map50_95: number
}

export interface TrainingStatus {
  status: 'idle' | 'running' | 'finished' | 'stopped' | 'error'
  epoch: number
  total_epochs: number
  history: TrainingMetricPoint[]
  error: string | null
  simulated: boolean
}

export interface TestPrediction {
  path: string
  true_label: string
  predicted_label: string
  correct: boolean
  confidence: number
}

export interface TestEvalResult {
  num_images: number
  class_names: string[]
  accuracy: number
  precision: number
  recall: number
  f1: number
  predictions: TestPrediction[]
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

  addProject: (name: string, datasetTarget: DatasetTarget = 'resnet') =>
    request<Project>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, dataset_target: datasetTarget }),
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

  // gambar split/test/<label>/<filename>.jpg — dipakai galeri prediksi di
  // TestEvaluation, path sudah relatif terhadap split/test dari backend
  splitTestImageUrl: (projectId: string, path: string) =>
    `/projects/${encodeURIComponent(projectId)}/split/test/${path}`,

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

  // crop bagian atas (mis. 25% teratas) dari crop full-body yang sudah ada —
  // dipakai fokus klasifikasi ke area tertentu (mis. leher/dada tempat
  // lanyard biasa terlihat), tanpa hitung ulang bbox dari frame asli
  cropTopObjects: (projectId: string, label: string, percent: number, overwrite = false) =>
    request<CropTopResult>(`${p(projectId)}/sample/${encodeURIComponent(label)}/crop-top-objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percent, overwrite }),
    }),

  listTopCrops: (projectId: string, label: string, limit = 5000, excludeAssigned = false) =>
    request<CropImage[]>(
      `${p(projectId)}/sample/${encodeURIComponent(label)}/crops-top?limit=${limit}&exclude_assigned=${excludeAssigned}`,
    ),

  resetAllSamples: (projectId: string) =>
    request<{ deleted: number }>(`${p(projectId)}/sample/reset`, { method: 'POST' }),

  // "Bersihkan Sample Lama" — HANYA menghitung/preview, tidak menghapus
  previewCleanup: (projectId: string, olderThanDays: number) =>
    request<CleanupPreview>(`${p(projectId)}/sample/cleanup-preview?older_than_days=${olderThanDays}`),

  // eksekusi hapus sungguhan — panggil ini CUMA setelah user konfirmasi
  runCleanup: (projectId: string, olderThanDays: number) =>
    request<CleanupResult>(`${p(projectId)}/sample/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ older_than_days: olderThanDays }),
    }),

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

  assignLabel: (
    projectId: string,
    label: string,
    sample: string,
    filenames: string[],
    source: 'crops' | 'crops_top' = 'crops',
  ) =>
    request<{ assigned: number }>(`${p(projectId)}/labels/${encodeURIComponent(label)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample, filenames, source }),
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

  // URL unduhan .zip (bukan lewat request() — ini file binary, bukan JSON;
  // browser cukup diarahkan langsung ke URL ini, Content-Disposition di
  // backend yang memicu download-nya)
  splitExportUrl: (projectId: string) => `${p(projectId)}/split/export`,

  // ---- Training setup (per-project) ----
  getTrainingConfig: (projectId: string) =>
    request<TrainingConfig>(`${p(projectId)}/training-config`),

  saveTrainingConfig: (projectId: string, config: TrainingConfig) =>
    request<TrainingConfig>(`${p(projectId)}/training-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }),

  // ---- Persiapan Dataset config (per-project) — mis. persentase crop atas ----
  getDatasetPrepConfig: (projectId: string) =>
    request<DatasetPrepConfig>(`${p(projectId)}/dataset-prep-config`),

  // Partial<> dengan sengaja — endpoint ini sekarang ditulis dari 2 tempat
  // independen (setup Persiapan Dataset & panel "Bersihkan Sample Lama" di
  // menu Pengaturan). Kirim CUMA field yang benar-benar berubah; backend
  // merge ke file yang sudah tersimpan, field lain tidak ikut ketiban.
  saveDatasetPrepConfig: (projectId: string, config: Partial<DatasetPrepConfig>) =>
    request<DatasetPrepConfig>(`${p(projectId)}/dataset-prep-config`, {
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

  // upload 1 file .pt manual (mis. hasil training di mesin lain), dievaluasi
  // terhadap split/test project ini — TIDAK PERNAH menimpa best_model.pt
  // project. FormData sengaja TANPA header Content-Type manual — browser
  // yang isi boundary multipart-nya sendiri, kalau di-set manual malah rusak.
  evaluateUploadedModel: (projectId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<TestEvalResult>(`${p(projectId)}/training/evaluate-uploaded`, {
      method: 'POST',
      body: form,
    })
  },

  // ---- Resep YOLO — endpoint terpisah total dari training ResNet di atas ----
  createYoloSplit: (
    projectId: string,
    trainRatio: number,
    valRatio: number,
    testRatio: number,
    className: string,
    seed = 42,
  ) =>
    request<YoloSplitSummary>(`${p(projectId)}/yolo-split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        train_ratio: trainRatio,
        val_ratio: valRatio,
        test_ratio: testRatio,
        seed,
        class_name: className,
      }),
    }),

  getYoloSplit: (projectId: string) => request<YoloSplitSummary>(`${p(projectId)}/yolo-split`),

  getYoloTrainingConfig: (projectId: string) =>
    request<YoloTrainingConfig>(`${p(projectId)}/yolo-training-config`),

  saveYoloTrainingConfig: (projectId: string, config: YoloTrainingConfig) =>
    request<YoloTrainingConfig>(`${p(projectId)}/yolo-training-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }),

  startYoloTrainingRun: (projectId: string) =>
    request<{ started: boolean }>(`${p(projectId)}/yolo-training/start`, { method: 'POST' }),

  getYoloTrainingRunStatus: (projectId: string) =>
    request<YoloTrainingStatus>(`${p(projectId)}/yolo-training/status`),

  stopYoloTrainingRun: (projectId: string) =>
    request<{ stopped: boolean }>(`${p(projectId)}/yolo-training/stop`, { method: 'POST' }),

  evaluateYoloTestSet: (projectId: string) =>
    request<YoloEvalResult>(`${p(projectId)}/yolo-training/evaluate-test`, { method: 'POST' }),
}
