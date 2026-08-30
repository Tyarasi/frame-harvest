import random
import shutil
from pathlib import Path

import yaml

DEFAULT_CLASS_NAMES = ["object"]


def split_yolo_dataset(
    sample_dir: Path,
    split_dir: Path,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
    class_names: list[str] | None = None,
) -> dict:
    """Bagi frame PENUH (bukan crop per-objek) + file bbox .txt-nya jadi
    struktur standar ultralytics YOLO: split_dir/images/{train,val,test}/ dan
    split_dir/labels/{train,val,test}/, plus data.yaml yang menunjuk ke situ
    — siap dipakai langsung sebagai argumen `data=` saat training YOLO.

    Cuma frame yang SUDAH dianotasi (ada file .txt pasangannya) yang ikut
    displit — file .txt kosong (0 baris) tetap dihitung sebagai contoh
    negatif "tidak ada orang" yang sah, bukan dilewati. Frame yang belum
    pernah di-generate BBOX-nya sama sekali tidak ikut sampai bbox-nya ada.

    Nama folder sengaja `images/labels` (bukan `train/val/test/<label>/`
    seperti split ResNet) — ini konvensi yang dipahami ultralytics langsung
    lewat data.yaml, dan sekaligus penanda struktur di disk sudah beda total
    dari split klasifikasi, tidak akan pernah tertukar terbaca sebagai
    satu sama lain.

    `class_names`: daftar nama kelas (index list = index kelas di data.yaml,
    HARUS sinkron dengan class_id yang ditulis di file .txt tiap bbox lewat
    ImageModal saat koreksi manual — lihat write_boxes di person_annotator.py).
    Boleh lebih dari 1 sekarang — bukan lagi 1 nama untuk kelas index 0 saja."""
    class_names = class_names or DEFAULT_CLASS_NAMES
    total = train_ratio + val_ratio + test_ratio
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"Rasio train+val+test harus 1.0, dapat {total}")

    if split_dir.exists():
        shutil.rmtree(split_dir)
    for part in ("train", "val", "test"):
        (split_dir / "images" / part).mkdir(parents=True, exist_ok=True)
        (split_dir / "labels" / part).mkdir(parents=True, exist_ok=True)

    if not sample_dir.exists():
        return {"train": 0, "val": 0, "test": 0}

    images: list[Path] = []
    for label_dir in sorted(sample_dir.iterdir()):
        if not label_dir.is_dir():
            continue
        for img_path in sorted(label_dir.glob("*.jpg")):
            if img_path.with_suffix(".txt").exists():
                images.append(img_path)

    rng = random.Random(seed)
    rng.shuffle(images)

    n = len(images)
    n_train = round(n * train_ratio)
    n_val = round(n * val_ratio)
    parts = {
        "train": images[:n_train],
        "val": images[n_train : n_train + n_val],
        "test": images[n_train + n_val :],
    }

    counts: dict[str, int] = {}
    for part_name, files in parts.items():
        for img_path in files:
            shutil.copy2(img_path, split_dir / "images" / part_name / img_path.name)
            txt_path = img_path.with_suffix(".txt")
            shutil.copy2(txt_path, split_dir / "labels" / part_name / txt_path.name)
        counts[part_name] = len(files)

    data_yaml = {
        "path": str(split_dir.resolve()),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
        "names": {i: name for i, name in enumerate(class_names)},
    }
    with open(split_dir / "data.yaml", "w") as f:
        yaml.safe_dump(data_yaml, f, sort_keys=False)

    return counts


def get_yolo_split_summary(split_dir: Path) -> dict:
    """Baca ringkasan split YOLO yang sudah ada, tanpa generate ulang."""
    summary = {"train": 0, "val": 0, "test": 0}
    if not split_dir.exists():
        return summary
    for part in ("train", "val", "test"):
        img_dir = split_dir / "images" / part
        if img_dir.exists():
            summary[part] = sum(1 for _ in img_dir.glob("*.jpg"))
    return summary
