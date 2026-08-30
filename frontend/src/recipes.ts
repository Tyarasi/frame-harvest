import type { DatasetTarget } from './api'

// "Resep" = rangkaian langkah persiapan dataset untuk satu dataset_target.
// Fase "Persiapan Dataset" di navigasi TIDAK hardcode langkah-langkahnya —
// dia baca dari sini berdasarkan dataset_target project aktif. Nambah target
// baru (mis. YOLO deteksi, yang tidak butuh Crop/Label per-objek karena
// modelnya langsung dilatih dari bbox di frame penuh) cukup nambah entri baru
// di RECIPES, navigasi & gating ikut menyesuaikan otomatis.

export interface RecipeStep {
  id: string
  label: string
  shortLabel: string
  description: string
  // step ini ditandai sebagai PENUTUP fase (mis. Split Dataset) — divisualkan
  // terpisah dari rangkaian langkah di atasnya, menandakan transisi ke fase
  // berikutnya (Training), bukan cuma langkah lanjutan
  isCloser?: boolean
}

export interface Recipe {
  target: DatasetTarget
  label: string
  steps: RecipeStep[]
}

export const RECIPES: Record<DatasetTarget, Recipe> = {
  resnet: {
    target: 'resnet',
    label: 'ResNet — Klasifikasi',
    steps: [
      {
        id: 'bbox',
        label: 'Frame & BBox Person',
        shortLabel: 'BBox',
        description: 'Lihat frame hasil capture, deteksi orang otomatis lewat YOLO, koreksi manual kalau perlu.',
      },
      {
        id: 'crop',
        label: 'Crop Object',
        shortLabel: 'Crop',
        description: 'Potong tiap bbox jadi gambar terpisah per orang — satu crop, satu subjek.',
      },
      {
        id: 'croptop',
        label: 'Crop Bagian Atas',
        shortLabel: 'Crop Atas',
        description: 'Opsional — fokuskan crop ke bagian atas tubuh saja (mis. area leher/dada).',
      },
      {
        id: 'label',
        label: 'Label Crop',
        shortLabel: 'Label',
        description: 'Tentukan kelas tiap crop lewat Mode Grid atau Mode Swipe.',
      },
      {
        id: 'review',
        label: 'Hasil Label',
        shortLabel: 'Review',
        description: 'Cek ulang gambar yang sudah ter-assign per label sebelum lanjut.',
      },
      {
        id: 'split',
        label: 'Split Dataset',
        shortLabel: 'Split',
        description: 'Bagi dataset berlabel jadi train/val/test — hasil akhir fase ini, siap dipakai Training.',
        isCloser: true,
      },
    ],
  },
  // YOLO dilatih langsung dari FRAME PENUH + bbox-nya (bukan crop per-objek),
  // jadi tidak butuh Crop/Crop Atas/Label/Review sama sekali — begitu bbox
  // ada, langsung bisa displit. Ini bukti bahwa arsitektur resep memang bisa
  // menampung alur yang jauh lebih pendek, bukan cuma placeholder di UI.
  yolo: {
    target: 'yolo',
    label: 'YOLO — Deteksi Objek',
    steps: [
      {
        id: 'bbox',
        label: 'Frame & BBox',
        shortLabel: 'BBox',
        description:
          'Gambar bbox manual per frame untuk object yang mau dideteksi — tidak ada auto-detect, object ini belum pernah dikenal model manapun.',
      },
      {
        id: 'split',
        label: 'Split Dataset',
        shortLabel: 'Split',
        description:
          'Bagi frame yang sudah ada bbox-nya jadi train/val/test format YOLO — hasil akhir fase ini, siap dipakai Training.',
        isCloser: true,
      },
    ],
  },
}

export const DATASET_TARGET_OPTIONS: Array<{ value: DatasetTarget; label: string }> = [
  { value: 'resnet', label: 'ResNet — Klasifikasi (crop per objek)' },
  { value: 'yolo', label: 'YOLO — Deteksi Objek (bbox langsung dari frame penuh)' },
]

export function recipeFor(target: DatasetTarget): Recipe {
  return RECIPES[target] ?? RECIPES.resnet
}
