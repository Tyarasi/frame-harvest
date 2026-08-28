import threading
from pathlib import Path

import cv2

PERSON_CLASS_ID = 0  # id class "person" di model COCO bawaan YOLOv8
CROPS_DIRNAME = "crops"

_model = None
_model_lock = threading.Lock()


def _get_model():
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from ultralytics import YOLO

                _model = YOLO("yolov8n.pt")
    return _model


def ensure_classes_file(dataset_dir: Path):
    classes_path = dataset_dir / "classes.txt"
    if not classes_path.exists():
        classes_path.write_text("person\n")


def write_boxes(image_path: Path, boxes: list[dict]) -> None:
    """Tulis ulang file .txt YOLO di sebelah image_path dari daftar bbox
    {x, y, w, h} (pusat + ukuran, ternormalisasi 0-1) — dipakai koreksi manual."""
    txt_path = image_path.with_suffix(".txt")
    lines = [f"0 {b['x']:.6f} {b['y']:.6f} {b['w']:.6f} {b['h']:.6f}" for b in boxes]
    txt_path.write_text("\n".join(lines) + ("\n" if lines else ""))


def annotate_label_dir(label_dir: Path, confidence: float = 0.4, overwrite: bool = False) -> dict:
    """Deteksi orang di semua .jpg dalam label_dir, tulis file .txt format YOLO
    (satu baris per orang: "0 x_center y_center width height", ternormalisasi 0-1)
    di sebelah tiap gambar — konvensi label YOLO standar (nama file sama, ekstensi beda).
    Gambar yang sudah punya .txt dilewati kecuali overwrite=True.
    """
    model = _get_model()
    images = sorted(label_dir.glob("*.jpg"))

    processed = 0
    skipped = 0
    with_person = 0
    total_boxes = 0

    for img_path in images:
        txt_path = img_path.with_suffix(".txt")
        if txt_path.exists() and not overwrite:
            skipped += 1
            continue

        result = model.predict(
            str(img_path), classes=[PERSON_CLASS_ID], conf=confidence, verbose=False
        )[0]

        lines = []
        for box in result.boxes:
            x, y, w, h = box.xywhn[0].tolist()
            lines.append(f"0 {x:.6f} {y:.6f} {w:.6f} {h:.6f}")

        txt_path.write_text("\n".join(lines) + ("\n" if lines else ""))

        processed += 1
        if lines:
            with_person += 1
            total_boxes += len(lines)

    return {
        "total_images": len(images),
        "processed": processed,
        "skipped": skipped,
        "with_person": with_person,
        "total_boxes": total_boxes,
    }


def _write_crops_from_lines(img_path: Path, lines: list[str], crops_dir: Path) -> int:
    """Tulis file crop dari daftar baris bbox YOLO (mentah, belum diparse) untuk
    satu gambar. Mengembalikan jumlah crop yang berhasil ditulis."""
    img = cv2.imread(str(img_path))
    if img is None:
        return 0
    img_h, img_w = img.shape[:2]

    crop_count = 0
    for i, line in enumerate(lines):
        parts = line.split()
        if len(parts) != 5:
            continue
        _, x, y, w, h = (float(p) for p in parts)

        x1 = max(0, int((x - w / 2) * img_w))
        y1 = max(0, int((y - h / 2) * img_h))
        x2 = min(img_w, int((x + w / 2) * img_w))
        y2 = min(img_h, int((y + h / 2) * img_h))
        if x2 <= x1 or y2 <= y1:
            continue

        crop = img[y1:y2, x1:x2]
        cv2.imwrite(str(crops_dir / f"{img_path.stem}_p{i}.jpg"), crop)
        crop_count += 1

    return crop_count


def sync_crops_for_image(image_path: Path) -> int:
    """Regenerasi ulang crop untuk 1 gambar dari isi .txt-nya saat ini — dipanggil
    setelah koreksi bbox manual disimpan, supaya crop tidak stale terhadap bbox
    lama. Hanya berlaku kalau gambar ini SUDAH pernah di-crop sebelumnya — tidak
    membuat crop baru untuk gambar yang belum pernah di-crop (crop pertama kali
    tetap harus dipicu manual lewat "Crop Semua Object")."""
    crops_dir = image_path.parent / CROPS_DIRNAME
    existing_crops = list(crops_dir.glob(f"{image_path.stem}_p*.jpg"))
    if not existing_crops:
        return 0

    for crop_path in existing_crops:
        crop_path.unlink()

    txt_path = image_path.with_suffix(".txt")
    if not txt_path.exists():
        return 0
    lines = [line for line in txt_path.read_text().splitlines() if line.strip()]
    if not lines:
        return 0

    return _write_crops_from_lines(image_path, lines, crops_dir)


def crop_objects_label_dir(label_dir: Path, overwrite: bool = False) -> dict:
    """Crop tiap bbox dari file .txt YOLO di sebelah gambar dalam label_dir jadi
    gambar terpisah (satu crop per baris bbox), disimpan di label_dir/crops/
    dengan nama "<nama_file_asli>_p<index>.jpg" — dipakai untuk siapkan dataset
    klasifikasi lanjutan (mis. ada/tidak lanyard) dari crop per-orang.
    Gambar yang sudah punya crop dilewati kecuali overwrite=True.
    """
    images = sorted(label_dir.glob("*.jpg"))
    crops_dir = label_dir / CROPS_DIRNAME
    crops_dir.mkdir(exist_ok=True)

    processed = 0
    skipped = 0
    images_with_boxes = 0
    total_crops = 0

    for img_path in images:
        txt_path = img_path.with_suffix(".txt")
        if not txt_path.exists():
            continue
        lines = [line for line in txt_path.read_text().splitlines() if line.strip()]
        if not lines:
            continue

        existing_crops = list(crops_dir.glob(f"{img_path.stem}_p*.jpg"))
        if existing_crops and not overwrite:
            skipped += 1
            continue
        for crop_path in existing_crops:
            crop_path.unlink()

        crop_count = _write_crops_from_lines(img_path, lines, crops_dir)

        processed += 1
        if crop_count:
            images_with_boxes += 1
            total_crops += crop_count

    return {
        "total_images": len(images),
        "processed": processed,
        "skipped": skipped,
        "images_with_boxes": images_with_boxes,
        "total_crops": total_crops,
    }
