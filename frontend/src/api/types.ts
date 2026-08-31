// Semua interface/type request-response API, plus 2 helper murni (tanpa
// fetch) yang selalu dipakai berdampingan dengan tipe-tipe ini di komponen —
// dikumpulkan di satu file supaya tidak ada import silang antar file domain
// api/*.ts (tiap domain cukup import dari sini, bukan dari domain lain).

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

// 1 tahap BBox atau Crop dalam checklist project — bisa dirantai
// berkali-kali (bbox->crop->bbox->crop->...), bukan lagi sekali per project.
// Lihat backend/services/stage_resolver.py untuk aturan & resolusi foldernya.
export interface Stage {
  id: string
  type: 'bbox' | 'crop'
  name: string
}

export interface Project {
  id: string
  name: string
  dataset_target: DatasetTarget
  stages: Stage[]
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
  // index kelas (0-based) — dulu selalu tersirat 0 ("person"), sekarang
  // project YOLO bisa punya banyak kelas. Opsional: default 0 di backend,
  // aman buat resep ResNet yang memang cuma 1 kelas implisit.
  class_id?: number
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
  yolo_class_names: string[]
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
