import { p, request } from './client'
import type { DatasetPrepConfig } from './types'

// ---- Persiapan Dataset config (per-project) — mis. persentase crop atas,
// setup langkah Label, daftar kelas YOLO ----

export const datasetPrepApi = {
  getDatasetPrepConfig: (projectId: string) =>
    request<DatasetPrepConfig>(`${p(projectId)}/dataset-prep-config`),

  // Partial<> dengan sengaja — endpoint ini sekarang ditulis dari beberapa
  // tempat independen (setup Persiapan Dataset, panel "Bersihkan Sample
  // Lama" di menu Pengaturan, popup "Pilih Kelas" di ImageModal). Kirim
  // CUMA field yang benar-benar berubah; backend merge ke file yang sudah
  // tersimpan, field lain tidak ikut ketiban.
  saveDatasetPrepConfig: (projectId: string, config: Partial<DatasetPrepConfig>) =>
    request<DatasetPrepConfig>(`${p(projectId)}/dataset-prep-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }),
}
