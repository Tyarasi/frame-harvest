import { useState, type FormEvent } from 'react'
import type { Project } from '../api'
import { useConfirm } from './ConfirmProvider'
import { CloseIcon, PencilIcon } from './icons'

interface Props {
  projects: Project[]
  selectedId: string
  onAdd: (name: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onDone?: () => void
}

export function ManageProjects({ projects, selectedId, onAdd, onRename, onDelete, onDone }: Props) {
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await onAdd(name)
      setName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah project')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(proj: Project) {
    setEditingId(proj.id)
    setEditValue(proj.name)
  }

  async function handleRenameSubmit(e: FormEvent, id: string) {
    e.preventDefault()
    if (!editValue.trim()) return
    setRenaming(true)
    try {
      await onRename(id, editValue.trim())
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal ganti nama project')
    } finally {
      setRenaming(false)
    }
  }

  async function handleDelete(proj: Project) {
    const confirmed = await confirm({
      title: 'Hapus project?',
      message: `Hapus project "${proj.name}" beserta SEMUA sample dan label di dalamnya? Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: 'Hapus Project',
      danger: true,
    })
    if (confirmed) onDelete(proj.id)
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Kelola Project
        </h3>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Tutup
          </button>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Tiap project punya sample dan label sendiri-sendiri, terpisah total dari project
        lain. Kamera tetap dipakai bersama lintas project.
      </p>

      {projects.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {projects.map((proj) =>
            editingId === proj.id ? (
              <li key={proj.id}>
                <form
                  onSubmit={(e) => handleRenameSubmit(e, proj.id)}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    autoFocus
                    required
                    className="min-w-0 flex-1 rounded-lg border border-blue-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={renaming}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-slate-500 hover:text-slate-300"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                </form>
              </li>
            ) : (
              <li key={proj.id} className="flex items-center justify-between">
                <span className={proj.id === selectedId ? 'text-blue-300' : 'text-slate-300'}>
                  {proj.name}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => startEdit(proj)}
                    title="Ganti nama"
                    className="text-slate-500 hover:text-slate-300"
                  >
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(proj)}
                    className="text-xs font-medium text-red-400 hover:text-red-300"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nama project (mis. Lanyard Karyawan)"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Menambahkan…' : '+ Tambah Project'}
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
    </div>
  )
}
