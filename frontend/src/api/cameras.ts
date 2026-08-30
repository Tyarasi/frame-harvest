import { request } from './client'
import type { Camera } from './types'

// ---- Kamera (global, shared lintas project) ----

export const camerasApi = {
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

  streamUrl: (camera_id: string) => `/stream/${encodeURIComponent(camera_id)}`,
}
