import { p, request } from './client'
import type { TestEvalResult, TrainingConfig, TrainingStatus } from './types'

// ---- Training resep ResNet (setup + run sungguhan + evaluasi), per-project ----

export const trainingApi = {
  getTrainingConfig: (projectId: string) =>
    request<TrainingConfig>(`${p(projectId)}/training-config`),

  saveTrainingConfig: (projectId: string, config: TrainingConfig) =>
    request<TrainingConfig>(`${p(projectId)}/training-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }),

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
}
