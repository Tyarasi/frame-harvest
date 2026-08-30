import { useEffect, useState } from 'react'
import { api, type YoloSplitSummary } from '../../api'

interface Props {
  projectId: string
  // daftar kelas dimiliki & diedit di langkah "Frame & BBox" (lihat
  // ClassNamesEditor.tsx di PersiapanDatasetPhase) — di sini CUMA
  // ditampilkan sebagai pengingat + dikirim apa adanya ke createYoloSplit,
  // tidak diedit ulang di sini supaya tidak ada 2 tempat sumber kebenaran
  // yang bisa beda sendiri.
  classNames: string[]
}

// Versi YOLO dari DatasetSplit.tsx — TIDAK ada preview per-label (deteksi
// tidak mengenal "label" seperti klasifikasi), jadi sengaja lebih
// sederhana: langsung tampilkan total train/val/test setelah digenerate,
// bukan preview live per-baris.
export function YoloSplit({ projectId, classNames }: Props) {
  const [trainPct, setTrainPct] = useState(70)
  const [valPct, setValPct] = useState(15)
  const [testPct, setTestPct] = useState(15)
  const [summary, setSummary] = useState<YoloSplitSummary | null>(null)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reloadSummary() {
    if (!projectId) return
    api.getYoloSplit(projectId).then(setSummary).catch(() => {})
  }

  useEffect(reloadSummary, [projectId])

  const totalPct = trainPct + valPct + testPct
  const hasSplit = summary ? summary.train + summary.val + summary.test > 0 : false

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

      <div className="mb-4 max-w-sm rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <p className="mb-1.5 text-xs font-medium text-slate-400">
          Kelas yang akan ditulis ke <code className="text-slate-500">data.yaml</code> ({classNames.length})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {classNames.map((name, i) => (
            <span
              key={i}
              className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-200"
            >
              <span className="mr-1 font-mono text-[10px] text-slate-500">{i}</span>
              {name}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          Mau tambah/hapus kelas? Kembali ke langkah "Frame & BBox", klik box mana pun untuk buka
          popup "Pilih Kelas" — daftar kelas dikelola dari sana, dekat dengan tempat kamu gambar bbox-nya.
        </p>
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
