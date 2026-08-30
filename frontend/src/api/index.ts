// Barrel — satu object `api` gabungan dari semua domain, SENGAJA supaya
// setiap pemanggilan `api.xxx(...)` di komponen manapun tetap sama persis
// seperti sebelum file ini dipecah per-domain (cuma path importnya yang
// berubah dari '../api' ke '../../api' dst. mengikuti folder komponennya).
// Nambah domain baru = tambah 1 file api/<domain>.ts baru + 1 baris di sini.
export * from './types'

import { camerasApi } from './cameras'
import { captureApi } from './capture'
import { datasetPrepApi } from './dataset-prep'
import { labelsApi } from './labels'
import { projectsApi } from './projects'
import { splitApi } from './split'
import { trainingApi } from './training'
import { trainingYoloApi } from './training-yolo'

export const api = {
  ...projectsApi,
  ...camerasApi,
  ...captureApi,
  ...labelsApi,
  ...splitApi,
  ...datasetPrepApi,
  ...trainingApi,
  ...trainingYoloApi,
}
