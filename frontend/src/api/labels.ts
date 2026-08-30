import { p, request } from './client'
import type { LabelImage, LabelInfo } from './types'

// ---- Label (dataset klasifikasi hasil assign, per-project) ----

export const labelsApi = {
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

  // hasil assign label (dataset/<label>/<filename>.jpg) — terpisah dari sample/
  labelImageUrl: (projectId: string, path: string) =>
    `/projects/${encodeURIComponent(projectId)}/dataset/${path}`,

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
}
