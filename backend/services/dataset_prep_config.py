import json
from pathlib import Path

DEFAULT_CONFIG = {
    "top_crop_percent": 25.0,
    "use_top_crops": False,
    # setup langkah Label (sample dipilih, mode Grid/Swipe, nama label yang
    # diketik) — disimpan juga supaya refresh browser tidak memaksa user
    # ngetik ulang semuanya dari nol tiap kali
    "selected_sample": "",
    "label_mode": "grid",
    "label_name": "",
    "swipe_left_label": "",
    "swipe_right_label": "",
    # ambang umur (hari) buat pratinjau "Bersihkan Sample Lama" — cuma
    # dipakai isi default form-nya, PENGHAPUSAN NYATA tetap selalu manual
    # lewat tombol + konfirmasi, tidak pernah otomatis dari nilai ini saja
    "retention_days": 14.0,
    # nama kelas buat resep YOLO (data.yaml) — cuma disimpan di sini supaya
    # tidak perlu diketik ulang tiap buka Split Dataset; nilai yang BENAR-
    # BENAR dipakai saat generate split selalu dikirim eksplisit lewat
    # body request /yolo-split, bukan dibaca ulang dari sini oleh backend
    "yolo_class_name": "object",
}

CONFIG_FILENAME = "dataset_prep_config.json"


def get_config(project_dir: Path) -> dict:
    config_path = project_dir / CONFIG_FILENAME
    if not config_path.exists():
        return DEFAULT_CONFIG.copy()
    with open(config_path) as f:
        saved = json.load(f)
    return {**DEFAULT_CONFIG, **saved}


def save_config(project_dir: Path, config: dict) -> dict:
    """Merge di atas file yang SUDAH TERSIMPAN (bukan cuma DEFAULT_CONFIG) —
    penting karena file ini sekarang ditulis dari 2 tempat independen
    (setup Persiapan Dataset di satu sisi, panel "Bersihkan Sample Lama" di
    sisi lain). Kalau merge cuma ke DEFAULT_CONFIG, `config` HARUS berisi
    semua field co-writer lain atau field itu ke-reset ke default — merge ke
    file tersimpan berarti pemanggil cukum kirim field yang benar-benar mau
    diubah (partial update), field lain otomatis ikut nilai tersimpan
    terakhir, tidak saling menimpa."""
    current = get_config(project_dir)
    merged = {**current, **config}
    project_dir.mkdir(parents=True, exist_ok=True)
    with open(project_dir / CONFIG_FILENAME, "w") as f:
        json.dump(merged, f, indent=2)
    return merged
