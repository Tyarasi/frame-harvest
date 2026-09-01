# Changelog

Semua perubahan penting pada project ini dicatat di file ini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
dan project ini memakai [Semantic Versioning](https://semver.org/lang/id/).

## [0.2.0] - 2026-09-01

### Ditambahkan

- Tahap BBox/Crop berantai per project — `bbox -> crop -> bbox -> crop -> ...` bisa dirantai berkali-kali (mis. deteksi objek di dalam crop objek sebelumnya), menggantikan resep BBox/Crop yang dulu tetap sekali per project. Checklist tahap diatur langsung dari popup bbox, folder di-resolve otomatis (`services/stage_resolver.py`).
- Parameter training YOLO: `patience` (early stopping), `freeze` (bekukan layer pretrained), augmentasi (`mosaic`, `fliplr`, `flipud`, `degrees`), dan `cache` — default sama persis dengan bawaan ultralytics.
- Progress training per-batch (bukan cuma per-epoch) untuk YOLO — progress bar tidak lagi "macet di 0%" selama epoch panjang di CPU, dan tombol batalkan responsif dalam hitungan batch.
- Galeri bukti visual di halaman evaluasi YOLO — bbox hasil prediksi model per gambar test, dibuka read-only di ImageModal.
- Kartu metrik bersama (`MetricCard`) dengan penanda "makin tinggi/rendah makin baik" plus blok "apa artinya angka-angka ini" yang dipakai halaman Training Run & Evaluasi (ResNet maupun YOLO).
- Zoom 50–400% di ImageModal (`+`/`-`/`0`, ctrl+scroll) dan rename kelas inline dari popup pemilih kelas.

### Diubah

- Gating fase Training untuk project YOLO memakai keberadaan split YOLO, bukan label ter-assign (YOLO tidak pernah lewat assign-label).
- Backend dipecah lebih lanjut: `evaluate_test_set` YOLO sekalian menulis prediksi per-gambar, `assign_label` & YOLO split membaca dari folder tahap terkini.

## [0.1.0] - 2026-08-30

Rilis awal.

### Ditambahkan

- Capture frame dari stream RTSP CCTV, dikelompokkan per label per project.
- Auto-anotasi bbox person (YOLOv8) + koreksi manual di ImageModal.
- Crop object per-bbox, plus crop bagian atas tubuh (`crops_top`) untuk fokus klasifikasi.
- Bersihkan frame sample lama yang sudah di-crop (preview + eksekusi manual).
- Pipeline klasifikasi ResNet: setup, training run nyata (PyTorch), evaluasi test set dengan prediksi per-gambar.
- Evaluasi checkpoint `.pt` yang diupload manual, tanpa menimpa model project.
- Pipeline deteksi YOLO: split dataset ke layout ultralytics, config training, training run, evaluasi mAP.
- Dukungan multi-kelas untuk resep YOLO (class list dikelola dari popup bbox).
- Navigasi fase berbasis "resep" per `dataset_target` project.

### Struktur

- Backend dipecah dari `app.py` tunggal menjadi `routers/*` dengan state bersama di `state.py`.
- Frontend dipecah: `api.ts` menjadi `api/*`, komponen dikelompokkan ke `cameras/`, `ui/`, `dataset-prep/`, `projects/`, `training/`.

[0.2.0]: https://github.com/Tyarasi/frame-harvest/releases/tag/v0.2.0
[0.1.0]: https://github.com/Tyarasi/frame-harvest/releases/tag/v0.1.0
