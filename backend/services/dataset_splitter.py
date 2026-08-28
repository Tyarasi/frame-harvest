import random
import shutil
from pathlib import Path


def split_dataset(
    label_dir: Path,
    split_dir: Path,
    train_ratio: float = 0.7,
    val_ratio: float = 0.15,
    test_ratio: float = 0.15,
    seed: int = 42,
) -> dict:
    """Bagi dataset/<label>/*.jpg jadi struktur train/val/test standar
    (kompatibel `torchvision.datasets.ImageFolder`) di split_dir — siap
    dipakai training di perangkat lain (mis. yang punya GPU) tanpa perlu
    olah ulang data.

    Split dilakukan ACAK per-label (bukan per-identitas orang — aplikasi
    ini belum punya metadata "siapa" di tiap crop, lihat catatan diversitas
    identitas di Guide-Hasil-Teori.md). Pakai seed tetap supaya hasil split
    konsisten selama komposisi data sumber belum berubah — regenerasi ulang
    (mis. setelah nambah label baru) akan menghapus split lama dan
    menghitung ulang dari nol, bukan menambah ke split yang sudah ada.
    """
    total = train_ratio + val_ratio + test_ratio
    if abs(total - 1.0) > 1e-6:
        raise ValueError(f"Rasio train+val+test harus 1.0, dapat {total}")

    if split_dir.exists():
        shutil.rmtree(split_dir)
    for part in ("train", "val", "test"):
        (split_dir / part).mkdir(parents=True, exist_ok=True)

    rng = random.Random(seed)
    summary: dict[str, dict[str, int]] = {}

    if not label_dir.exists():
        return summary

    for label_folder in sorted(label_dir.iterdir()):
        if not label_folder.is_dir():
            continue
        images = sorted(label_folder.glob("*.jpg"))
        rng.shuffle(images)

        n = len(images)
        n_train = round(n * train_ratio)
        n_val = round(n * val_ratio)
        # sisa ke test — supaya total pas walau ada pembulatan
        parts = {
            "train": images[:n_train],
            "val": images[n_train : n_train + n_val],
            "test": images[n_train + n_val :],
        }

        for part_name, files in parts.items():
            target = split_dir / part_name / label_folder.name
            target.mkdir(parents=True, exist_ok=True)
            for f in files:
                shutil.copy2(f, target / f.name)

        summary[label_folder.name] = {k: len(v) for k, v in parts.items()}

    return summary


def get_split_summary(split_dir: Path) -> dict:
    """Baca ringkasan split yang sudah ada, tanpa generate ulang."""
    summary: dict[str, dict[str, int]] = {}
    if not split_dir.exists():
        return summary
    for part in ("train", "val", "test"):
        part_dir = split_dir / part
        if not part_dir.exists():
            continue
        for label_folder in sorted(part_dir.iterdir()):
            if not label_folder.is_dir():
                continue
            count = sum(1 for _ in label_folder.glob("*.jpg"))
            summary.setdefault(label_folder.name, {"train": 0, "val": 0, "test": 0})
            summary[label_folder.name][part] = count
    return summary
