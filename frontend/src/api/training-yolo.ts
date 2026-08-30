import { p, request } from './client'
import type { YoloEvalResult, YoloTrainingConfig, YoloTrainingStatus } from './types'

// ---- Training resep YOLO — endpoint terpisah total dari training ResNet
// (training.ts): data, config, job registry, checkpoint semuanya beda ----

export const trainingYoloApi = {
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
