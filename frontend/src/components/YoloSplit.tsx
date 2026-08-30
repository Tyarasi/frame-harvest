import { useEffect, useState } from 'react'
import { api, type YoloSplitSummary } from '../api'
import { CloseIcon } from './icons'

interface Props {
  projectId: string
}

// Versi YOLO dari DatasetSplit.tsx — TIDAK ada preview per-label (deteksi
// tidak mengenal "label" seperti klasifikasi), jadi sengaja lebih
// sederhana: langsung tampilkan total train/val/test setelah digenerate,
// bukan preview live per-baris.
//
// Daftar kelas BOLEH lebih dari 1 sekarang (sebelumnya cuma 1 nama kelas
// per project) — urutan di daftar ini = index kelas (0, 1, 2, ...) yang
// HARUS sinkron dengan class_id yang ditulis ImageModal.tsx saat koreksi
// bbox manual, dan dikirim eksplisit ke createYoloSplit tiap generate,
// bukan dibaca ulang dari config oleh backend.
export function YoloSplit({ projectId }: Props) {
  const [trainPct, setTrainPct] = useState(70)
  const [valPct, setValPct] = useState(15)
  const [testPct, setTestPct] = useState(15)
  const [classNames, setClassNames] = useState<string[]>(['object'])
  const [newClassName, setNewClassName] = useState('')
  const [configLoaded, setConfigLoaded] = useState(false)
  const [summary, setSummary] = useState<YoloSplitSummary | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reloadSummary() {
    if (!projectId) return
    api.getYoloSplit(projectId).then(setSummary).catch(() => {})
  }

  useEffect(reloadSummary, [projectId])

  // daftar kelas TIDAK di-hardcode "person" lagi — disimpan per-project
  // (partial update, cuma field ini) supaya tidak perlu diketik ulang
  useEffect(() => {
    setConfigLoaded(false)
    if (!projectId) return
    api
      .getDatasetPrepConfig(projectId)
      .then((cfg) => setClassNames(cfg.yolo_class_names.length > 0 ? cfg.yolo_class_names : ['object']))
      .catch(() => {})
      .finally(() => setConfigLoaded(true))
  }, [projectId])

  useEffect(() => {
    if (!projectId || !configLoaded) return
    const timer = setTimeout(() => {
      api.saveDatasetPrepConfig(projectId, { yolo_class_names: classNames }).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [projectId, configLoaded, classNames])

  const totalPct = trainPct + valPct + testPct
  const hasSplit = summary ? summary.train + summary.val + summary.test > 0 : false

  function addClass() {
    const name = newClassName.trim()
    if (!name || classNames.includes(name)) return
    setClassNames((prev) => [...prev, name])
    setNewClassName('')
  }

  function removeClass(index: number) {
    // minimal 1 kelas harus tetap ada — data.yaml tidak valid tanpa kelas
    if (classNames.length <= 1) return
    setClassNames((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleGenerate() {
    if (totalPct !== 100 || !projectId || classNames.length === 0) return
    setGenerating(true)
    setError(null)
    try {
      const res = await api.createYoloSplit(
        projectId,
        trainPct / 100,
        valPct / 100,
        testPct / 100,
        classNames,
      )
      setSummary(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat split')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-2xl text-xs text-slate-500">
        Bagi frame yang sudah punya bbox (hasil langkah BBox) jadi{' '}
        <code className="text-slate-400">images/</code> + <code className="text-slate-400">labels/</code>{' '}
        format standar ultralytics YOLO, lengkap dengan <code className="text-slate-400">data.yaml</code> —
        siap dipakai langsung sebagai argumen training. Frame yang belum pernah di-generate BBOX-nya
        tidak ikut displit.
      </p>

      <div className="mb-4 max-w-sm">
        <label className="mb-1 block text-xs font-medium text-slate-400">
          Daftar Kelas ({classNames.length})
        </label>
        <p className="mb-2 text-[11px] text-slate-600">
          Urutan di sini menentukan index kelas (0, 1, 2, …) yang ditulis ke <code>data.yaml</code> —
          harus sama dengan urutan yang dipakai saat koreksi bbox manual di langkah Frame &amp; BBox.
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
                  title={
                    classNames.length <= 1
                      ? 'Minimal 1 kelas harus ada'
                      : `Hapus kelas "${name}"`
                  }
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
            value={newClassName}
            onChange={(e) => setNewClassName(e.target.value)}
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
            disabled={!newClassName.trim() || classNames.includes(newClassName.trim())}
            className="rounded-lg border border-blue-900 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Tambah
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Train %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={trainPct}
            onChange={(e) => setTrainPct(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Val %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={valPct}
            onChange={(e) => setValPct(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">Test %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={testPct}
            onChange={(e) => setTestPct(Number(e.target.value))}
            className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || totalPct !== 100 || classNames.length === 0}
          title={totalPct !== 100 ? `Total harus 100% (sekarang ${totalPct}%)` : undefined}
          className="rounded-lg border border-blue-900 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? 'Memproses…' : 'Generate Split'}
        </button>
        {totalPct !== 100 && (
          <span className="text-xs text-amber-500">Total harus 100% (sekarang {totalPct}%)</span>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {hasSplit && summary ? (
        <table className="w-full max-w-sm text-left text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-2 pr-6 font-medium">Train</th>
              <th className="pb-2 pr-6 font-medium">Val</th>
              <th className="pb-2 font-medium">Test</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            <tr className="border-t border-slate-800">
              <td className="py-1.5 pr-6 font-mono">{summary.train}</td>
              <td className="py-1.5 pr-6 font-mono">{summary.val}</td>
              <td className="py-1.5 font-mono">{summary.test}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500">Belum ada split — klik "Generate Split" di atas.</p>
      )}
    </div>
  )
}
