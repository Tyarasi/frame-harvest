import { useRef, useState } from 'react'
import { api, type TestEvalResult } from '../api'
import { EvaluationResults } from './EvaluationResults'
import { UploadIcon } from './icons'

interface Props {
  projectId: string
}

// Mode kedua halaman Training — uji 1 file .pt yang berasal dari LUAR
// aplikasi ini (mis. hasil training di mesin ber-GPU) terhadap split/test
// project yang sedang aktif. Model diupload TIDAK PERNAH menimpa atau
// disimpan sebagai model/best_model.pt project — murni "coba dulu, lihat
// hasilnya", dievaluasi di memori backend lalu dibuang begitu request selesai.
export function UploadEvaluate({ projectId }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<TestEvalResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleEvaluate() {
    if (!file || !projectId) return
    setLoading(true)
    setError(null)
    try {
      const r = await api.evaluateUploadedModel(projectId, file)
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengevaluasi model yang diupload')
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null)
    setResult(null)
    setError(null)
  }

  function handleChooseAnother() {
    setFile(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div>
      <p className="mb-4 max-w-2xl text-xs text-slate-500">
        Uji checkpoint <code>.pt</code> dari luar aplikasi ini (mis. hasil training di mesin
        ber-GPU) terhadap <code>split/test</code> project yang sedang aktif — tanpa perlu training
        ulang di sini dulu.{' '}
        <strong className="text-slate-400">
          Model yang diupload tidak pernah menimpa atau disimpan sebagai model project
        </strong>
        , cuma dievaluasi sekali lalu dibuang. Format checkpoint harus sama dengan hasil training
        aplikasi ini (dict berisi <code>model_state</code>, <code>class_names</code>, opsional{' '}
        <code>backbone</code>), dan label di dalamnya harus cocok dengan label di{' '}
        <code>split/test</code> project ini.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800">
          <UploadIcon className="h-3.5 w-3.5" />
          Pilih File .pt
          <input ref={inputRef} type="file" accept=".pt" onChange={handleFileChange} className="hidden" />
        </label>

        {file && (
          <>
            <span className="font-mono text-xs text-slate-400">
              {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
            </span>
            <button
              type="button"
              onClick={handleChooseAnother}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Ganti file
            </button>
          </>
        )}

        <button
          type="button"
          onClick={handleEvaluate}
          disabled={loading || !file || !projectId}
          className="rounded-lg border border-purple-800 px-3 py-1.5 text-xs font-medium text-purple-300 hover:bg-purple-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Mengevaluasi…' : 'Evaluasi Model Ini'}
        </button>
      </div>

      {error && <p className="mb-4 max-w-2xl text-xs text-red-400">{error}</p>}

      {result && <EvaluationResults projectId={projectId} result={result} />}
    </div>
  )
}
