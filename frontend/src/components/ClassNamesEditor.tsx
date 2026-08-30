import { useState } from 'react'
import { CloseIcon } from './icons'

interface Props {
  classNames: string[]
  onChange: (next: string[]) => void
}

// Editor daftar kelas bbox untuk resep YOLO — dipakai di langkah "Frame &
// BBox" (SEBELUM mulai gambar bbox, supaya pemilih kelas di ImageModal sudah
// ada isinya), bukan di langkah Split. Urutan di daftar ini = index kelas
// (0, 1, 2, ...) yang ditulis ke file .txt & data.yaml — dipakai bersama
// oleh Gallery/ImageModal (koreksi manual) dan YoloSplit (generate split),
// makanya state-nya dipegang SATU tempat (PersiapanDatasetPhase) dan
// diteruskan ke sini lewat props, bukan disimpan lokal di komponen ini.
export function ClassNamesEditor({ classNames, onChange }: Props) {
  const [newName, setNewName] = useState('')

  function addClass() {
    const name = newName.trim()
    if (!name || classNames.includes(name)) return
    onChange([...classNames, name])
    setNewName('')
  }

  function removeClass(index: number) {
    // minimal 1 kelas harus tetap ada — data.yaml & pemilih kelas tidak
    // masuk akal tanpa kelas sama sekali
    if (classNames.length <= 1) return
    onChange(classNames.filter((_, i) => i !== index))
  }

  return (
    <div className="mb-4 max-w-sm rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <label className="mb-1 block text-xs font-medium text-slate-400">
        Daftar Kelas ({classNames.length})
      </label>
      <p className="mb-2 text-[11px] text-slate-600">
        Tentukan dulu object apa saja yang mau dideteksi — daftar ini dipakai saat kamu gambar bbox di
        bawah, dan urutannya jadi index kelas di <code className="text-slate-500">data.yaml</code> saat
        Split nanti.
      </p>
      {classNames.length > 0 && (
        <ul className="mb-2 space-y-1">
          {classNames.map((name, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
            >
              <span>
                <span className="mr-2 font-mono text-xs text-slate-500">{i}</span>
                {name}
              </span>
              <button
                type="button"
                onClick={() => removeClass(i)}
                disabled={classNames.length <= 1}
                title={classNames.length <= 1 ? 'Minimal 1 kelas harus ada' : `Hapus kelas "${name}"`}
                className="text-slate-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addClass()
            }
          }}
          placeholder="mis. helm, rompi, apd"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={addClass}
          disabled={!newName.trim() || classNames.includes(newName.trim())}
          className="rounded-lg border border-blue-900 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Tambah
        </button>
      </div>
    </div>
  )
}
