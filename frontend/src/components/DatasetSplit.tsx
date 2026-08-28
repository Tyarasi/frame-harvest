import { useEffect, useState } from 'react'
import { api, type LabelInfo } from '../api'

interface Props {
  projectId: string
}

// samakan dengan round() Python di dataset_splitter.py (round half to even),
// bukan Math.round() JS biasa (round half up) — supaya preview di sini PERSIS
// sama dengan hasil "Generate Split" yang sungguhan, termasuk di kasus .5 pas
function pythonRound(n: number): number {
  const floor = Math.floor(n)
  const diff = n - floor
  if (diff < 0.5) return floor
  if (diff > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

export function DatasetSplit({ projectId }: Props) {
  const [trainPct, setTrainPct] = useState(70)
  const [valPct, setValPct] = useState(15)
  const [testPct, setTestPct] = useState(15)
  const [labelCounts, setLabelCounts] = useState<LabelInfo[]>([])
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reloadLabelCounts() {
    if (!projectId) return
    api.listLabels(projectId).then(setLabelCounts).catch(() => {})
  }

  useEffect(reloadLabelCounts, [projectId])

  const totalPct = trainPct + valPct + testPct

  async function handleGenerate() {
    if (totalPct !== 100 || !projectId) return
    setGenerating(true)
    setError(null)
    setGenerated(false)
    try {
      await api.createSplit(projectId, trainPct / 100, valPct / 100, testPct / 100)
      setGenerated(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat split')
    } finally {
      setGenerating(false)
    }
  }

  // preview live: dihitung langsung dari jumlah gambar per label di dataset/
  // (bukan dari hasil split/ yang sudah jadi) — jadi ikut berubah tiap
  // persentase diketik, tanpa perlu klik "Generate Split" dulu
  const preview = labelCounts.map((l) => {
    const nTrain = pythonRound(l.count * (trainPct / 100))
    const nVal = pythonRound(l.count * (valPct / 100))
    const nTest = l.count - nTrain - nVal
    return { name: l.name, train: nTrain, val: nVal, test: nTest }
  })
  const totals = preview.reduce(
    (acc, p) => ({
      train: acc.train + p.train,
      val: acc.val + p.val,
      test: acc.test + p.test,
    }),
    { train: 0, val: 0, test: 0 },
  )

  return (
    <div>
      <p className="mb-4 max-w-2xl text-xs text-slate-500">
        Bagi gambar berlabel jadi folder <code className="text-slate-400">train</code>/
        <code className="text-slate-400">val</code>/<code className="text-slate-400">test</code>{' '}
        (format standar <code className="text-slate-400">ImageFolder</code>) — siap dipakai
        training di perangkat ber-GPU nanti tanpa perlu olah data lagi. Pembagian saat ini acak
        per-label (aplikasi ini belum punya metadata identitas per-orang — lihat catatan
        diversitas identitas di Guide-Hasil-Teori.md).
      </p>

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
          disabled={generating || totalPct !== 100}
          title={totalPct !== 100 ? `Total harus 100% (sekarang ${totalPct}%)` : undefined}
          className="rounded-lg border border-blue-900 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? 'Memproses…' : 'Generate Split'}
        </button>
        {totalPct !== 100 && (
          <span className="text-xs text-amber-500">
            Total harus 100% (sekarang {totalPct}%)
          </span>
        )}
        {generated && totalPct === 100 && (
          <span className="text-xs text-emerald-400">
            Split berhasil dibuat ke folder split/.
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      {labelCounts.length === 0 ? (
        <p className="text-sm text-slate-500">
          Belum ada label berisi gambar untuk di-split — assign gambar ke label dulu di
          "Persiapan Dataset".
        </p>
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-2 text-[11px] text-slate-500">
            Preview live — ikut berubah sesuai persentase di atas, sebelum "Generate Split"
            diklik.
          </p>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="pb-2 pr-6 font-medium">Label</th>
                <th className="pb-2 pr-6 font-medium">Train</th>
                <th className="pb-2 pr-6 font-medium">Val</th>
                <th className="pb-2 font-medium">Test</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {preview.map((p) => (
                <tr key={p.name} className="border-t border-slate-800">
                  <td className="py-1.5 pr-6">{p.name}</td>
                  <td className="py-1.5 pr-6 font-mono">{p.train}</td>
                  <td className="py-1.5 pr-6 font-mono">{p.val}</td>
                  <td className="py-1.5 font-mono">{p.test}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-700 font-semibold text-slate-100">
                <td className="py-1.5 pr-6">Total</td>
                <td className="py-1.5 pr-6 font-mono">{totals.train}</td>
                <td className="py-1.5 pr-6 font-mono">{totals.val}</td>
                <td className="py-1.5 font-mono">{totals.test}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
