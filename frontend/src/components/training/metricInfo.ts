// Penjelasan tiap metrik (arti + dampaknya) — dipakai bersama oleh halaman
// Training Run & Evaluasi, resep ResNet maupun YOLO, lewat blok <details>
// "Apa artinya angka-angka ini?" di tiap halaman itu. Dikumpulkan di satu
// file (bukan didefinisikan ulang tiap komponen) supaya kata-katanya tidak
// perlahan beda sendiri antara halaman Training Run vs halaman Evaluasi.

export interface MetricInfo {
  key: string
  label: string
  color: string
  direction: 'up' | 'down'
  meaning: string
  impact: string
}

// ---- ResNet — klasifikasi (Accuracy/Precision/Recall/F1) ----

export const RESNET_METRIC_INFO: MetricInfo[] = [
  {
    key: 'accuracy',
    label: 'Accuracy',
    color: '#3987e5',
    direction: 'up',
    meaning:
      'Persentase total tebakan yang benar dari seluruh data validasi — baik "karyawan" maupun "bukan_karyawan" yang ditebak tepat.',
    impact:
      'Gampang dibaca tapi bisa menipu kalau jumlah 2 kelas timpang. Kalau 90% data adalah "karyawan", model yang selalu menebak "karyawan" pun sudah dapat accuracy 90% padahal tidak berguna sama sekali.',
  },
  {
    key: 'precision',
    label: 'Precision',
    color: '#d95926',
    direction: 'up',
    meaning: 'Dari semua crop yang ditebak model sebagai "karyawan", berapa persen yang memang benar karyawan.',
    impact:
      'Rendah = banyak false positive — orang yang bukan karyawan malah dianggap karyawan. Berbahaya kalau dipakai untuk kontrol akses, karena orang luar bisa lolos.',
  },
  {
    key: 'recall',
    label: 'Recall',
    color: '#199e70',
    direction: 'up',
    meaning: 'Dari semua karyawan asli di data, berapa persen yang berhasil dikenali model sebagai "karyawan".',
    impact:
      'Rendah = banyak false negative — karyawan asli malah tidak dikenali sistem, mengganggu operasional (mis. akses/notifikasi otomatis gagal jalan untuk orang yang sah).',
  },
  {
    key: 'f1',
    label: 'F1',
    color: '#c98500',
    direction: 'up',
    meaning:
      'Rata-rata harmonis Precision dan Recall — 1 angka ringkas yang cuma tinggi kalau keduanya sama-sama bagus.',
    impact:
      'Dipakai sebagai patokan utama saat precision & recall harus sama-sama diperhatikan, karena menaikkan salah satu biasanya menurunkan yang lain — beda dari Accuracy yang bisa menipu di data timpang.',
  },
]

export const RESNET_LOSS_INFO: MetricInfo = {
  key: 'loss',
  label: 'Loss',
  color: '#3987e5',
  direction: 'down',
  meaning: 'Seberapa jauh prediksi model dari label sebenarnya secara matematis — bukan persentase seperti 4 metrik lain.',
  impact:
    'Idealnya terus turun mendekati 0 tiap epoch; kalau berhenti turun (plateau) berarti model sudah "mentok" belajar dari epoch & data yang tersedia saat ini.',
}

export const RESNET_METRIC_FOOTNOTE =
  'Precision dan Recall biasanya tarik-menarik — menaikkan salah satu lewat pengaturan threshold cenderung menurunkan yang lain. Untuk kasus karyawan/lanyard ini: precision rendah berarti orang luar bisa lolos dianggap karyawan (risiko keamanan), sedangkan recall rendah berarti karyawan asli malah ditolak sistem (mengganggu operasional). F1 dipakai supaya keduanya tetap jadi perhatian bersama, bukan cuma salah satu.'

// ---- YOLO — deteksi objek (Precision/Recall/mAP50/mAP50-95) ----

export const YOLO_METRIC_INFO: MetricInfo[] = [
  {
    key: 'precision',
    label: 'Precision',
    color: '#d95926',
    direction: 'up',
    meaning:
      'Dari semua bbox yang DITEMUKAN model, berapa persen yang beneran tepat (posisi & kelasnya cocok object asli).',
    impact:
      'Rendah = model banyak "berhalusinasi" — nandain ada object di tempat yang sebenarnya kosong, atau bbox-nya meleset jauh dari posisi asli.',
  },
  {
    key: 'recall',
    label: 'Recall',
    color: '#199e70',
    direction: 'up',
    meaning: 'Dari semua object yang SEBENARNYA ada di gambar, berapa persen yang berhasil ketemu model.',
    impact:
      'Rendah = banyak object asli yang lolos/tidak terdeteksi sama sekali — berbahaya kalau tujuannya deteksi kepatuhan (mis. lanyard) karena pelanggaran bisa tidak ketahuan.',
  },
  {
    key: 'map50',
    label: 'mAP50',
    color: '#3987e5',
    direction: 'up',
    meaning:
      'Rata-rata Precision di semua kelas, dengan bbox dianggap "benar" kalau tumpang-tindihnya (IoU) dengan posisi asli minimal 50% — toleransi cukup longgar.',
    impact: 'Metrik ringkas paling umum dipakai buat lihat "apakah model ini kerja secara keseluruhan atau tidak".',
  },
  {
    key: 'map50_95',
    label: 'mAP50-95',
    color: '#c98500',
    direction: 'up',
    meaning:
      'Sama seperti mAP50, tapi dirata-rata di banyak ambang tumpang-tindih sekaligus (50% sampai 95%, makin naik makin ketat) — bukan cuma "ketemu atau tidak", tapi seberapa PAS posisi bbox-nya.',
    impact:
      'Wajar angkanya jauh lebih rendah dari mAP50 — itu bukan tanda model buruk, standarnya memang lebih ketat. Metrik ini yang paling jujur soal presisi lokasi, bukan cuma keberadaan object.',
  },
]

export const YOLO_LOSS_INFO: MetricInfo[] = [
  {
    key: 'box_loss',
    label: 'Box Loss',
    color: '#3987e5',
    direction: 'down',
    meaning: 'Seberapa meleset posisi & ukuran kotak (bbox) yang diprediksi dibanding kotak asli.',
    impact: 'Turun berarti model makin akurat naruh & mengukur bbox-nya, bukan cuma soal nemu-tidaknya object.',
  },
  {
    key: 'cls_loss',
    label: 'Class Loss',
    color: '#d95926',
    direction: 'down',
    meaning: 'Seberapa sering model salah menebak KELAS object di dalam bbox yang sudah ditemukan.',
    impact:
      'Kalau project cuma 1 kelas, ini lebih ke "yakin ada object atau tidak"; makin banyak kelas, makin merepresentasikan salah-tebak antar kelas.',
  },
  {
    key: 'dfl_loss',
    label: 'DFL Loss',
    color: '#199e70',
    direction: 'down',
    meaning:
      'Loss teknis (Distribution Focal Loss) yang mempertajam ketepatan TEPI/BATAS kotak — pelengkap Box Loss, bukan penggantinya.',
    impact: 'Turun berarti tepi bbox makin presisi menempel ke batas object asli, bukan cuma "kira-kira benar".',
  },
]

export const YOLO_METRIC_FOOTNOTE =
  'Precision dan Recall di deteksi objek juga tarik-menarik seperti di klasifikasi: precision rendah = banyak deteksi palsu (halusinasi), recall rendah = banyak object asli terlewat. mAP50 & mAP50-95 keduanya arah "makin tinggi makin baik" — mAP50-95 biasanya jauh lebih rendah karena standarnya lebih ketat, bandingkan sesama mAP50-95 antar epoch, jangan dibandingkan langsung dengan mAP50.'
