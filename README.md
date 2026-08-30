# FrameHarvest

Web untuk mengumpulkan gambar (frame) dari stream RTSP CCTV, dikelompokkan per
label, siap dipakai sebagai dataset training model deteksi/klasifikasi.

Backend: Python (FastAPI + OpenCV) — jembatan RTSP ke browser dan penyimpan
file. Frontend: React + TypeScript + Tailwind CSS (Vite) — dibangun jadi
static file dan di-serve langsung oleh backend, jadi cukup satu server yang
perlu dijalankan.

## Setup (sekali saja)

1. Backend:

   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt

   # WAJIB: ultralytics menarik "opencv-python" (versi GUI) sebagai dependency,
   # yang bentrok/overwrite "opencv-python-headless" yang kita pakai (server
   # tanpa display). Perbaiki dengan paksa balik ke headless:
   pip uninstall -y opencv-python
   pip install --force-reinstall --no-deps opencv-python-headless==4.10.0.84
   cd ..
   ```

   Verifikasi: `python3 -c "import cv2; print(cv2.__version__)"` harus print
   `4.10.0` (bukan `5.0.0` — itu tandanya versi GUI yang masih aktif).

2. Frontend:

   ```bash
   cd frontend
   npm install
   npm run build
   cd ..
   ```

3. Konfigurasi kamera:

   ```bash
   cd backend
   cp cameras.example.yaml cameras.yaml
   cd ..
   ```

   Edit `backend/cameras.yaml`, isi `rtsp_url` tiap kamera dengan URL RTSP
   asli dari owner (DVR/NVR CCTV biasanya punya user manual yang
   mencantumkan format RTSP-nya, atau tanya ke installer CCTV).

## Menjalankan (produksi/pemakaian sehari-hari)

```bash
cd backend
source venv/bin/activate
uvicorn app:app --host 0.0.0.0 --port 8000
```

Buka `http://localhost:8000` (atau `http://<ip-laptop>:8000` dari device lain
di jaringan yang sama). Backend serve API dan hasil build React sekaligus —
tidak perlu jalankan frontend terpisah.

## Mode pengembangan frontend (kalau mau ubah tampilan)

Jalankan backend seperti biasa di satu terminal, lalu di terminal lain:

```bash
cd frontend
npm run dev
```

Vite dev server (default `http://localhost:5173`) auto-reload tiap ada
perubahan kode, dan meneruskan (proxy) semua request `/api/*` dan `/stream/*`
ke backend di `localhost:8000` (lihat `frontend/vite.config.ts`). Setelah
selesai edit, jangan lupa `npm run build` ulang supaya versi produksi
(yang di-serve backend) ikut ter-update.

## Project (multi-dataset)

FrameHarvest mendukung banyak **project** sekaligus — tiap project punya
`sample/` (capture mentah), `dataset/` (hasil assign label), `split/`
(train/val/test), dan `model/` (checkpoint hasil training) sendiri-sendiri
di `backend/projects/<id>/`, terisolasi total dari project lain (cocok kalau
mau kerjakan beberapa dataset/tujuan klasifikasi berbeda dalam satu instalasi
yang sama). **Kamera (RTSP) tetap satu daftar global**, dipakai bersama
lintas project — kamera itu resource fisik, bukan data project.

- Klik **Kelola Project** di header untuk membuat/menghapus project.
- Dropdown di sebelahnya untuk berpindah project aktif — semua halaman
  (Capture, Persiapan Dataset) mengikuti project yang sedang dipilih.
- Menghapus project akan menghapus SELURUH `sample/` dan `dataset/` di
  dalamnya secara permanen.

## Alur pemakaian

- Pastikan project yang aktif sudah benar (lihat bagian Project di atas).
- Pilih kamera dari dropdown → preview live muncul.
- Isi kolom **Nama Sample** (nama batch pengambilan gambar, mis. `motor`,
  `orang`, `karyawan` — bukan label klasifikasi final, lihat bagian
  "Persiapan Dataset & Label Model" di bawah).
- **Ambil Gambar** → simpan 1 frame saat itu juga.
- **Mulai Interval** → simpan otomatis tiap N detik sampai ditekan **Stop
  Interval**. Tiap kamera punya interval job sendiri-sendiri (independen).
- Semua gambar tersimpan di `sample/<nama_sample>/<camera_id>_<timestamp>.jpg`.

## Auto-anotasi BBOX Person (YOLO)

Klik **Generate BBOX Person** di panel Galeri (bisa untuk sample yang lagi
difilter, atau "Semua Sample" sekaligus). Backend jalankan model **YOLOv8n**
pretrained (class "person" bawaan COCO) di CPU, lalu tulis file `.txt` di
sebelah tiap `.jpg` — format YOLO standar, siap dipakai training:

```
0 x_center y_center width height
```

(class id `0` = person, semua nilai ternormalisasi 0–1). Gambar yang sudah
punya `.txt` otomatis dilewati kecuali centang **"Timpa ulang yang sudah
ada"**. File `sample/classes.txt` (isi: `person`) dibuat otomatis sebagai
referensi nama class.

## Crop Object dari BBOX

Klik **Crop Semua Object** di panel Galeri, tab "Crop Object" (bisa untuk
sample yang lagi difilter, atau "Semua Sample" sekaligus). Tiap bbox pada
file `.txt` gambar dipotong jadi file gambar tersendiri, disimpan di
`sample/<nama_sample>/crops/` dengan nama `<nama_file_asli>_p<index>.jpg` —
satu gambar dengan 3 bbox person menghasilkan 3 file crop terpisah.

Gambar yang sudah punya crop dilewati kecuali centang **"Timpa ulang crop
yang sudah ada"**. Folder `crops/` tidak ikut muncul di tab "Full Frame"
(hanya gambar `.jpg` langsung di `sample/<nama_sample>/` yang ditampilkan).
Kalau bbox dikoreksi manual lewat modal gambar, crop yang sudah pernah dibuat
untuk gambar itu otomatis di-regenerasi ulang (lihat `sync_crops_for_image`
di `backend/services/person_annotator.py`).

## Persiapan Dataset & Label Model

Halaman **Persiapan Dataset** (tab terpisah dari halaman Capture) adalah
tempat mengubah crop object jadi data training siap pakai untuk model
klasifikasi (mis. ResNet lanyard classifier):

1. **Mode Model** — pilih arsitektur/model tujuan (saat ini baru tersedia
   "ResNet (Lanyard Classifier)").
2. **Dari Sample** — pilih 1 folder sample sumber crop yang mau diproses.
3. Centang crop yang relevan dari grid yang tampil, isi **Nama Label**
   (label klasifikasi sesungguhnya, mis. `ada_lanyard` / `tidak_lanyard` —
   berbeda dari "Nama Sample" di tahap capture), lalu klik **Assign ke
   Label**.
4. Crop yang dipilih **di-copy** (bukan dipindah) dari
   `sample/<sample>/crops/` ke `dataset/<label>/<filename>.jpg` — crop asli
   di `sample/` tetap ada, jadi bisa di-assign ulang/ke label lain kapan saja.

## Halaman Training

Tab terpisah **Training** (beda dari "Persiapan Dataset") selalu menampilkan
badge **"Project aktif: <nama>"** di bagian atas — semua split, konfigurasi,
dan run training di halaman ini cuma berlaku untuk project yang lagi dipilih
di dropdown header, bukan gabungan semua project. Berisi 3 bagian:

### Split Dataset (Train/Val/Test)

Isi rasio Train/Val/Test (default 70/15/15, harus berjumlah 100%) lalu klik
**Generate Split**. Semua gambar di `dataset/<label>/` di-copy (bukan
dipindah) ke struktur standar `torchvision.datasets.ImageFolder` di
`split/train|val|test/<label>/` — siap dipakai langsung oleh script training
di perangkat manapun (termasuk yang punya GPU) tanpa perlu olah data lagi.

**Catatan penting**: pembagian saat ini **acak per-label**, bukan per-
identitas orang — aplikasi ini belum punya metadata "siapa" di tiap crop.
Ini artinya risiko *overfitting terhadap identitas* yang dibahas di
`Guide-Hasil-Teori.md` (model menghafal ciri orang tertentu, bukan pola
lanyard) belum sepenuhnya teratasi oleh fitur split ini — kalau data cuma
berasal dari sedikit orang, sebaiknya validasi manual dengan foto orang baru
yang belum pernah ada di `train/` sama sekali, sesuai rekomendasi di
dokumen tersebut.

Generate ulang akan menghapus total isi folder `split/` lama dan membagi
ulang dari nol (bukan menambah) — jalankan lagi kalau ada label/gambar baru
yang perlu ikut disertakan.

### Setup Training

Atur konfigurasi (backbone ResNet-18/34, epochs, batch size, learning rate,
freeze backbone), klik **Simpan Konfigurasi** (tersimpan di
`training_config.json` per project). Config ini dipakai persis apa adanya
oleh **Training Run** di bawah — tidak ada jalur lain (dulu ada tombol
"Download Training Script" untuk dijalankan manual di perangkat lain, sudah
dihapus karena training sekarang jalan langsung di website).

### Training Run — training sungguhan, langsung di website

Bagian ini menjalankan **training sungguhan** (bukan simulasi angka palsu,
bukan subset data yang dipangkas) langsung di backend, memakai config &
**seluruh data** dari Setup Training di atas (backbone, epochs, batch_size,
learning_rate, freeze_backbone apa adanya). Device yang benar-benar dipakai
ditampilkan sebagai tag kecil di samping tombol **Mulai Training** — kuning
`CPU` kalau tidak ada GPU terdeteksi (`torch.cuda.is_available()` bernilai
False), hijau `GPU` kalau ada — bukan teks penjelasan panjang, cukup 1 label
ringkas (`GET /api/training-device`, `services/training_runner.get_device_label()`).

Karena training di CPU bisa memakan waktu (tergantung jumlah epoch & data —
di project "karyawan-lanyard" misalnya ~5-6 detik/epoch dengan config
default), tersedia tombol **Batalkan Training** yang responsif: status
dicek di setiap batch (bukan cuma di akhir epoch), jadi training
benar-benar berhenti dalam hitungan detik setelah diklik, bukan menunggu
semua epoch selesai. Checkpoint terbaik (val accuracy tertinggi dari epoch
yang SUDAH selesai) tetap disimpan ke `model/best_model.pt` di folder
project walau dibatalkan di tengah jalan — cuma progress epoch yang sedang
berjalan saat dibatalkan yang dibuang.

Tombol **Mulai Training** memicu `POST
/api/projects/{id}/training/start`, lalu frontend polling `GET
.../training/status` tiap ~1.5 detik selama status `running`, menampilkan:
- Progress bar + "Epoch X / Y"
- Kartu KPI nilai terbaru: **Accuracy, Precision, Recall, F1** (precision/
  recall/F1 dihitung macro-average antar label — netral terhadap ketimpangan
  jumlah data per kelas)
- Grafik garis Accuracy/Precision/Recall/F1 (domain-Y otomatis menyesuaikan
  rentang data asli) dan grafik Loss terpisah (skala berbeda, sengaja
  dipisah — bukan dual-axis), dengan crosshair + tooltip saat hover
- Panel penjelasan (collapsible) arti tiap metrik & dampaknya ke model,
  termasuk trade-off Precision vs Recall untuk kasus karyawan/lanyard ini

Status job disimpan in-memory per project (hilang kalau backend
di-restart) — kalau `split/train` atau `split/val` belum ada/kosong, job
langsung berhenti dengan status `error` dan pesan yang jelas di UI.

### Evaluasi Test Set (Ukuran Akhir)

Angka Accuracy/Precision/Recall/F1 yang muncul selama **Training Run** di
atas dihitung dari `split/val` — set yang ikut menentukan checkpoint mana
yang disimpan ke `model/best_model.pt`, jadi sedikit bias optimis. Bagian
ini menjalankan evaluasi terpisah terhadap `split/test`: gambar yang **tidak
pernah dilihat sama sekali** selama training maupun pemilihan checkpoint,
jadi ukuran performa paling jujur yang tersedia untuk model saat ini.

Tombol **Evaluasi ke Test Set** memicu `POST
/api/projects/{id}/training/evaluate-test`, yang me-load
`model/best_model.pt`, menjalankan forward-pass sekali terhadap seluruh
`split/test`, lalu menampilkan Accuracy/Precision/Recall/F1 hasil evaluasi
tersebut plus jumlah gambar & nama label yang dievaluasi. Butuh minimal 1
epoch training selesai (supaya `model/best_model.pt` ada) dan `split/test`
tidak kosong — kalau salah satu belum ada, muncul pesan error yang jelas di
UI.

## Struktur output

```
frame-harvest/
├── backend/                      # semua kode & data server — lihat "Setup"
│   ├── app.py                     # entrypoint FastAPI (`uvicorn app:app`) — cuma app + include_router
│   ├── state.py                   # singleton (camera_manager, project_manager) & helper lintas router
│   ├── routers/                   # 1 file per domain endpoint — projects, cameras, capture,
│   │                               # labels, split, dataset_prep, training_resnet, training_yolo, streaming
│   ├── services/                  # logika inti, satu modul per tanggung jawab
│   │   ├── camera_manager.py       # koneksi RTSP per kamera (thread background)
│   │   ├── capture_manager.py      # simpan frame ke sample/, interval capture
│   │   ├── person_annotator.py     # auto-annotate bbox YOLO + crop object
│   │   ├── label_dataset.py        # kelola dataset/ (hasil assign label)
│   │   ├── dataset_splitter.py     # generate split/ train-val-test
│   │   ├── project_manager.py      # registry project (projects.yaml)
│   │   ├── training_config.py      # baca/simpan training_config.json
│   │   └── training_runner.py      # training ResNet sungguhan + evaluasi test set
│   ├── venv/                     # virtualenv Python (jangan dipindah manual, lihat Catatan)
│   ├── requirements.txt
│   ├── cameras.yaml               # daftar kamera RTSP — global, dipakai semua project
│   ├── projects.yaml              # daftar project (id + nama)
│   ├── yolov8n.pt                 # weight YOLO, terunduh otomatis sekali
│   └── projects/
│       └── <project_id>/          # mis. "karyawan-lanyard"
│           ├── sample/            # gambar mentah hasil capture, per nama sample
│           │   ├── classes.txt     # "person" (dibuat otomatis pas annotate pertama kali)
│           │   ├── motor/
│           │   │   ├── cam1_20260824_143022_123.jpg
│           │   │   └── cam2_20260824_143025_456.jpg
│           │   └── karyawan/
│           │       ├── cam1_20260824_143301_789.jpg
│           │       ├── cam1_20260824_143301_789.txt   # bbox hasil auto-annotate
│           │       └── crops/
│           │           ├── cam1_20260824_143301_789_p0.jpg   # hasil "Crop Semua Object"
│           │           └── cam1_20260824_143301_789_p1.jpg
│           ├── dataset/           # hasil "Assign ke Label" di Persiapan Dataset
│           │   ├── ada_lanyard/
│           │   │   └── cam1_20260824_143301_789_p0.jpg   # copy dari sample/.../crops/
│           │   └── tidak_lanyard/
│           │       └── cam1_20260824_143301_789_p1.jpg
│           ├── split/             # hasil "Generate Split" — format ImageFolder
│           │   ├── train/
│           │   │   ├── ada_lanyard/
│           │   │   └── tidak_lanyard/
│           │   ├── val/
│           │   │   ├── ada_lanyard/
│           │   │   └── tidak_lanyard/
│           │   └── test/
│           │       ├── ada_lanyard/
│           │       └── tidak_lanyard/
│           ├── model/             # checkpoint hasil Training Run
│           │   └── best_model.pt
│           └── training_config.json
└── frontend/                     # kode React/Vite — lihat "Mode pengembangan frontend"
    └── src/
        ├── api/                   # request API, 1 file per domain (sama dengan routers/ di atas),
        │                           # digabung jadi 1 object `api` lewat api/index.ts
        └── components/
            ├── ui/                 # komponen generik lintas-fitur (Modal, ActionBadge, icons, dst.)
            ├── cameras/            # kamera & live capture
            ├── projects/           # switcher/pengaturan project, navigasi fase
            ├── dataset-prep/       # fase Persiapan Dataset (kedua resep)
            └── training/           # fase Training (kedua resep)
```

`sample/<project>/` = data mentah per batch capture (bukan label klasifikasi).
`dataset/<project>/` = data training final per label klasifikasi, dibangun
lewat halaman Persiapan Dataset. `split/<project>/` = hasil pembagian
train/val/test. `model/<project>/best_model.pt` = checkpoint ResNet hasil
Training Run (lihat "Halaman Training"). Tiap project terisolasi total —
nama sample atau label yang sama di 2 project berbeda tidak akan tercampur.
Struktur folder-per-label + file label `.txt` di sebelah tiap gambar
(`sample/`) ini kompatibel dengan tools dataset umum (FiftyOne, YOLOv5/v8
training, dst).

## Catatan

- Live preview dikirim sebagai MJPEG (`<img>` biasa), bukan RTSP mentah —
  browser tidak bisa memutar RTSP langsung, jadi backend yang men-transcode.
- Kalau status kamera menunjukkan "Koneksi RTSP terputus" berulang, cek:
  kabel/jaringan ke DVR, apakah RTSP URL & credential masih benar, dan apakah
  DVR membatasi jumlah koneksi stream bersamaan.
- Kalau halaman `/` menampilkan "Frontend belum di-build", jalankan
  `cd frontend && npm run build` lalu restart `uvicorn`.
- **`pip install -r requirements.txt` butuh koneksi + ruang disk lumayan**
  (torch CPU-only ~300-500MB) karena fitur auto-annotate BBOX. `requirements.txt`
  sudah diarahkan ke index CPU-only PyTorch (`--extra-index-url`) — kalau
  ini terlewat/rusak dan `torch`/`ultralytics` malah menarik build CUDA
  (~2-3GB), install jadi jauh lebih lambat dan boros disk tanpa manfaat
  (laptop ini tidak punya GPU NVIDIA).
- **Venv Python (`backend/venv/`) sensitif kalau folder induknya
  dipindah/rename.** `venv/bin/*` (uvicorn, pip, dst) dan `venv/pyvenv.cfg`
  punya absolute path hardcoded ke lokasi saat `python3 -m venv` dijalankan
  — kalau lokasi berubah, script itu rusak (`ModuleNotFoundError` walau
  paket "sudah" terinstall). **Tidak perlu install ulang dari nol** kalau
  cuma pindah lokasi di mesin/OS yang sama — cukup ganti semua path lama →
  baru di file-file itu:
  ```bash
  OLD=/path/lama/backend/venv
  NEW=/path/baru/backend/venv
  grep -rl "$OLD" backend/venv/bin/ backend/venv/pyvenv.cfg | xargs sed -i "s|$OLD|$NEW|g"
  ```
  Verifikasi setelahnya: `backend/venv/bin/python3 -c "import torch, cv2,
  ultralytics"`. Reinstall dari nol (`rm -rf venv && python3 -m venv venv
  && pip install -r requirements.txt`, lalu ulangi langkah fix opencv di
  atas) cuma perlu kalau pindah ke mesin/OS/arsitektur yang beda.
- Model `yolov8n.pt` (~6MB) otomatis diunduh sekali saat fitur annotate
  pertama kali dipakai, disimpan di working directory tempat `uvicorn`
  dijalankan (`backend/`, kalau start lewat `run-dev.sh` atau instruksi di
  atas).
