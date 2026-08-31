import type { DatasetTarget } from './api'

// "Resep" = rangkaian langkah PENUTUP persiapan dataset untuk satu
// dataset_target — SETELAH checklist tahap BBox/Crop (lihat api/types.ts::
// Stage & stageStepsFor() di PersiapanDatasetPhase.tsx). Tahap BBox/Crop
// sendiri TIDAK lagi didefinisikan statis di sini — dulu resnet selalu
// "bbox->crop" tetap 1x, yolo selalu "bbox" tetap 1x; sekarang keduanya
// bisa dirantai berkali-kali per project (checklist dinamis di
// project.stages), jadi bagian itu dihitung dari data project, bukan dari
// konstanta di file ini. RECIPES cuma nyimpan apa yang terjadi SETELAH
// rantai tahap itu selesai (Crop Atas/Label/Review untuk resnet, langsung
// Split untuk yolo).

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
  // YOLO tidak butuh Crop Atas/Label/Review sama sekali — begitu checklist
  // tahap BBox/Crop-nya selesai (minimal 1 tahap BBox), langsung bisa
  // displit dari UJUNG rantai tahap itu (lihat stageStepsFor() di
  // PersiapanDatasetPhase.tsx & backend/services/stage_resolver.py).
  yolo: {
    target: 'yolo',
    label: 'YOLO — Deteksi Objek',
    steps: [
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
