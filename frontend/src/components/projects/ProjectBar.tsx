import { useEffect, useRef, useState } from 'react'
import type { Project } from '../../api'
import { recipeFor } from '../../recipes'
import { CheckIcon, ChevronDownIcon, SettingsIcon } from '../ui/icons'

interface Props {
  projects: Project[]
  projectId: string
  onSelectProject: (id: string) => void
  onManageProjects: () => void
  onManageCameras?: () => void
  onCleanupSample?: () => void
}

// Dropdown generik: buka/tutup + tutup otomatis saat klik di luar atau Esc.
// Dipakai baik oleh switcher project maupun menu Pengaturan — satu pola,
// bukan diulang dua kali dengan listener sendiri-sendiri.
function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return { open, setOpen, ref }
}

// Bar paling atas aplikasi — SELALU terlihat (sticky), di semua tab & sub-
// halaman. Hierarki kiri->kanan sengaja bertingkat: brand (paling diam) ->
// pemisah tipis -> konteks project (yang paling sering dibutuhkan mata,
// jadi satu-satunya elemen tebal/besar) -> aksi jarang-pakai di ujung kanan
// (disembunyikan di satu menu, bukan dua tombol setara yang bersaing
// perhatian dengan konteks project).
export function ProjectBar({
  projects,
  projectId,
  onSelectProject,
  onManageProjects,
  onManageCameras,
  onCleanupSample,
}: Props) {
  const active = projects.find((p) => p.id === projectId)
  const switcher = useDropdown()
  const settings = useDropdown()

  return (
    <div className="sticky top-0 z-50 h-14 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-3 px-6 lg:px-10">
        <span className="hidden shrink-0 text-sm font-bold tracking-tight text-slate-500 sm:inline">
          FrameHarvest
        </span>
        <span className="hidden h-5 w-px shrink-0 bg-slate-800 sm:block" aria-hidden="true" />

        {/* konteks project — SATU kontrol yang sekaligus indikator "sedang di
            mana" dan switcher-nya, bukan teks statis + dropdown terpisah */}
        {projects.length === 0 ? (
          <span className="text-base font-semibold text-amber-400">
            Belum ada project — buat satu di bawah ↓
          </span>
        ) : (
          <div className="relative min-w-0" ref={switcher.ref}>
            <button
              type="button"
              onClick={() => switcher.setOpen((o) => !o)}
              aria-expanded={switcher.open}
              className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-900"
            >
              <span className="truncate text-base font-bold text-slate-100">
                {active?.name ?? '(project tidak ditemukan)'}
              </span>
              {active && (
                <span className="hidden shrink-0 rounded-full border border-blue-900 bg-blue-950/50 px-2 py-0.5 text-[10px] font-medium text-blue-300 sm:inline">
                  {recipeFor(active.dataset_target).label}
                </span>
              )}
              <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            </button>

            {switcher.open && (
              <div className="absolute left-0 top-full z-10 mt-1 min-w-[240px] overflow-hidden rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-2xl">
                {projects.map((proj) => (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => {
                      onSelectProject(proj.id)
                      switcher.setOpen(false)
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-700 ${
                      proj.id === projectId ? 'text-slate-100' : 'text-slate-300'
                    }`}
                  >
                    <span className="truncate">{proj.name}</span>
                    {proj.id === projectId && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-blue-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* aksi jarang-pakai (setup, bukan kerja harian) — satu menu di
            ujung kanan, tidak bersaing perhatian dengan konteks project */}
        {projects.length > 0 && (
          <div className="relative ml-auto shrink-0" ref={settings.ref}>
            <button
              type="button"
              onClick={() => settings.setOpen((o) => !o)}
              aria-expanded={settings.open}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Pengaturan</span>
              <ChevronDownIcon className="h-3 w-3 text-slate-500" />
            </button>

            {settings.open && (
              <div className="absolute right-0 top-full z-10 mt-1 min-w-[180px] overflow-hidden rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    onManageProjects()
                    settings.setOpen(false)
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-700"
                >
                  Kelola Project
                </button>
                {onManageCameras && (
                  <button
                    type="button"
                    onClick={() => {
                      onManageCameras()
                      settings.setOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-700"
                  >
                    Kelola Kamera
                  </button>
                )}
                {onCleanupSample && (
                  <button
                    type="button"
                    onClick={() => {
                      onCleanupSample()
                      settings.setOpen(false)
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-700"
                  >
                    Bersihkan Sample Lama
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
