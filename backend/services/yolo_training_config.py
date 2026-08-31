import json
from pathlib import Path

DEFAULT_CONFIG = {
    "epochs": 30,
    "batch_size": 16,
    "imgsz": 640,
    # early stopping — berhenti kalau tidak ada perbaikan mAP selama N epoch
    # berturut-turut. 100 = default ultralytics sendiri, jadi project yang
    # sudah ada perilakunya TIDAK berubah sampai user sengaja ubah nilainya.
    "patience": 100,
    # jumlah layer AWAL (dari bobot pretrained yolov8n.pt) yang dibekukan —
    # 0 = tidak ada yang dibekukan (default ultralytics juga). Makin besar
    # makin "menahan" fitur pretrained supaya dataset kecil/custom (mis.
    # cuma 1 kelas "lanyard") tidak merusaknya (catastrophic forgetting).
    "freeze": 0,
    # augmentasi — 4 default di bawah SAMA PERSIS dengan default ultralytics
    # sendiri (mosaic ON, fliplr 0.5, flipud & degrees 0 alias OFF).
    "mosaic": True,
    "fliplr": 0.5,
    "flipud": 0.0,
    "degrees": 0.0,
    # cache gambar ke RAM/disk biar tidak baca ulang file .jpg dari disk
    # tiap epoch — signifikan mempercepat training di CPU untuk dataset yang
    # muat di memori. "none" = default ultralytics (tidak cache).
    "cache": "none",
}

CONFIG_FILENAME = "yolo_training_config.json"


def get_config(project_dir: Path) -> dict:
    config_path = project_dir / CONFIG_FILENAME
    if not config_path.exists():
        return DEFAULT_CONFIG.copy()
    with open(config_path) as f:
        saved = json.load(f)
    return {**DEFAULT_CONFIG, **saved}


def save_config(project_dir: Path, config: dict) -> dict:
    merged = {**DEFAULT_CONFIG, **config}
    project_dir.mkdir(parents=True, exist_ok=True)
    with open(project_dir / CONFIG_FILENAME, "w") as f:
        json.dump(merged, f, indent=2)
    return merged
