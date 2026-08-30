# Changelog

Semua perubahan penting pada project ini dicatat di file ini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
dan project ini memakai [Semantic Versioning](https://semver.org/lang/id/).

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

[0.1.0]: https://github.com/Tyarasi/frame-harvest/releases/tag/v0.1.0
