interface Props {
  label: string
  value: string
  color: string
  // 'up' = angka makin TINGGI makin baik (kebanyakan metrik akurasi/deteksi),
  // 'down' = makin RENDAH makin baik (loss) — ditandai langsung di kartu
  // biar kelihatan sekilas tanpa perlu buka penjelasan detail
  direction: 'up' | 'down'
}

// Kartu metrik generik dipakai di semua halaman Training Run/Evaluasi (ResNet
// & YOLO) — satu tampilan konsisten, termasuk penanda arah baik/buruknya.
// Penjelasan LEBIH DALAM per metrik (arti + dampaknya) ada di komponen
// pemanggil masing-masing lewat blok <details> terpisah (lihat metricInfo.ts)
// — kartu ini sengaja ringkas, cuma buat dilihat sekilas.
export function MetricCard({ label, value, color, direction }: Props) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
        <span className="shrink-0 text-[9px] text-slate-600" title={direction === 'up' ? 'Makin tinggi makin baik' : 'Makin rendah makin baik'}>
          {direction === 'up' ? '↑ tinggi' : '↓ rendah'}
        </span>
      </div>
      <p className="mt-1 font-mono text-lg" style={{ color }}>
        {value}
      </p>
    </div>
  )
}
