import { request } from './client'
import type { DatasetTarget, Project } from './types'

// ---- Project (dataset terpisah — kamera tetap global, lihat cameras.ts) ----

export const projectsApi = {
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
}
