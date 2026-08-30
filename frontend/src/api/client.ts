// Helper inti dipakai SEMUA file domain api/*.ts — request() (fetch wrapper
// + parsing error FastAPI/Pydantic) dan p() (path dasar per-project). Tidak
// ada domain lain yang perlu diimpor dari sini selain dua ini.

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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const fallback = `Request gagal (${res.status})`
    const body = await res.json().catch(() => ({ detail: fallback }))
    throw new Error(formatErrorDetail(body.detail, fallback))
  }
  return res.json()
}

export function p(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}`
}
