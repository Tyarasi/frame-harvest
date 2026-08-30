import { p, request } from './client'
import type {
  AnnotateResult,
  CleanupPreview,
  CleanupResult,
  CropImage,
  CropResult,
  CropTopResult,
  DatasetImage,
  Resolution,
  StatusResponse,
  YoloBox,
} from './types'

// ---- Status & capture (live) + sample mentah (raw capture), per-project ----

export const captureApi = {
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

  listImages: (projectId: string, label: string, limit = 5000) =>
    request<DatasetImage[]>(
      `${p(projectId)}/sample/${encodeURIComponent(label)}/images?limit=${limit}`,
    ),

  listAllImages: (projectId: string, limit = 5000) =>
    request<DatasetImage[]>(`${p(projectId)}/sample/images?limit=${limit}`),

  sampleImageUrl: (projectId: string, path: string) =>
    `/projects/${encodeURIComponent(projectId)}/sample/${path}`,

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
}
