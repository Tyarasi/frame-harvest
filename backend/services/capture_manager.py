import re
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

import cv2

from services.camera_manager import CameraManager
from services.person_annotator import CROPS_DIRNAME


class CaptureManager:
    """Simpan frame ke sample/<label>/<camera_id>_<timestamp>.jpg,
    dan kelola thread interval-capture per kamera (satu kamera = satu interval job)."""

    def __init__(self, camera_manager: CameraManager, sample_dir: Path):
        self.camera_manager = camera_manager
        self.sample_dir = sample_dir
        self.sample_dir.mkdir(parents=True, exist_ok=True)

        self._interval_jobs: dict[str, threading.Event] = {}  # camera_id -> stop_event

    def save_frame(
        self,
        camera_id: str,
        label: str,
        resize_to: tuple[int, int] | None = None,
    ) -> Path | None:
        stream = self.camera_manager.get(camera_id)
        if stream is None:
            raise ValueError(f"Kamera '{camera_id}' tidak ditemukan")

        frame = stream.get_frame() if stream.is_active else stream.capture_once()
        if frame is None:
            return None

        if resize_to:
            frame = cv2.resize(frame, resize_to, interpolation=cv2.INTER_AREA)

        label_dir = self.sample_dir / self._safe_name(label)
        label_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
        filepath = label_dir / f"{camera_id}_{timestamp}.jpg"
        cv2.imwrite(str(filepath), frame)
        return filepath

    def start_interval(
        self,
        camera_id: str,
        label: str,
        interval_sec: float,
        resize_to: tuple[int, int] | None = None,
    ):
        self.stop_interval(camera_id)  # pastikan tidak dobel job untuk kamera yang sama

        stop_event = threading.Event()
        self._interval_jobs[camera_id] = stop_event

        def _loop():
            while not stop_event.is_set():
                try:
                    self.save_frame(camera_id, label, resize_to)
                except ValueError:
                    break
                stop_event.wait(interval_sec)

        threading.Thread(target=_loop, daemon=True).start()

    def stop_interval(self, camera_id: str):
        stop_event = self._interval_jobs.pop(camera_id, None)
        if stop_event:
            stop_event.set()

    def is_interval_running(self, camera_id: str) -> bool:
        return camera_id in self._interval_jobs

    def label_dir(self, label: str) -> Path:
        return self.sample_dir / self._safe_name(label)

    def all_label_dirs(self) -> list[Path]:
        if not self.sample_dir.exists():
            return []
        return [d for d in self.sample_dir.iterdir() if d.is_dir()]

    def list_images(self, label: str, limit: int = 60) -> list[dict]:
        label_dir = self.sample_dir / self._safe_name(label)
        if not label_dir.exists():
            return []
        files = sorted(label_dir.glob("*.jpg"), key=lambda p: p.stat().st_mtime, reverse=True)
        return [self._image_info(f, label_dir.name) for f in files[:limit]]

    def list_all_images(self, limit: int = 100) -> list[dict]:
        if not self.sample_dir.exists():
            return []
        entries = [
            (f, label_dir.name)
            for label_dir in self.sample_dir.iterdir()
            if label_dir.is_dir()
            for f in label_dir.glob("*.jpg")
        ]
        entries.sort(key=lambda item: item[0].stat().st_mtime, reverse=True)
        return [self._image_info(f, label) for f, label in entries[:limit]]

    @staticmethod
    def _image_info(filepath: Path, label: str) -> dict:
        txt_path = filepath.with_suffix(".txt")
        bbox_count = 0
        if txt_path.exists():
            bbox_count = sum(1 for line in txt_path.read_text().splitlines() if line.strip())
        return {
            "path": f"{label}/{filepath.name}",
            # nama file = "<camera_id>_<YYYYMMDD>_<HHMMSS>_<ms>.jpg" (lihat save_frame)
            "camera_id": re.sub(r"_\d{8}_\d{6}_\d{3}$", "", filepath.stem),
            "label": label,
            "size_bytes": filepath.stat().st_size,
            "bbox_count": bbox_count,
        }

    def list_crops(self, label: str, limit: int = 60) -> list[dict]:
        crops_dir = self.sample_dir / self._safe_name(label) / CROPS_DIRNAME
        if not crops_dir.exists():
            return []
        files = sorted(crops_dir.glob("*.jpg"), key=lambda p: p.stat().st_mtime, reverse=True)
        return [self._crop_info(f, self._safe_name(label)) for f in files[:limit]]

    def list_all_crops(self, limit: int = 100) -> list[dict]:
        if not self.sample_dir.exists():
            return []
        entries = []
        for label_dir in self.sample_dir.iterdir():
            crops_dir = label_dir / CROPS_DIRNAME
            if label_dir.is_dir() and crops_dir.exists():
                entries.extend((f, label_dir.name) for f in crops_dir.glob("*.jpg"))
        entries.sort(key=lambda item: item[0].stat().st_mtime, reverse=True)
        return [self._crop_info(f, label) for f, label in entries[:limit]]

    @staticmethod
    def _crop_info(filepath: Path, label: str) -> dict:
        # nama file = "<source_stem>_p<index>.jpg" (lihat person_annotator.crop_objects_label_dir)
        source_stem = re.sub(r"_p\d+$", "", filepath.stem)
        return {
            "path": f"{label}/{CROPS_DIRNAME}/{filepath.name}",
            "camera_id": re.sub(r"_\d{8}_\d{6}_\d{3}$", "", source_stem),
            "label": label,
            "size_bytes": filepath.stat().st_size,
        }

    def delete_crops(self, label: str, filenames: list[str]) -> int:
        crops_dir = self.sample_dir / self._safe_name(label) / CROPS_DIRNAME
        deleted = 0
        for filename in filenames:
            if "/" in filename or "\\" in filename or filename in (".", ".."):
                continue
            filepath = crops_dir / filename
            if filepath.is_file():
                filepath.unlink()
                deleted += 1
        return deleted

    def delete_images(self, label: str, filenames: list[str]) -> int:
        label_dir = self.sample_dir / self._safe_name(label)
        deleted = 0
        for filename in filenames:
            # nama file saja, bukan path — cegah keluar dari label_dir (mis. "../../..")
            if "/" in filename or "\\" in filename or filename in (".", ".."):
                continue
            filepath = label_dir / filename
            if filepath.is_file():
                filepath.unlink()
                deleted += 1
                # buang juga file label YOLO pasangannya (kalau ada) — cegah
                # .txt yatim tanpa .jpg yang bisa mengacaukan training
                txt_path = filepath.with_suffix(".txt")
                if txt_path.is_file():
                    txt_path.unlink()
        return deleted

    def delete_all(self) -> int:
        """Hapus SEMUA data sample (gambar frame, bbox .txt, crops) — reset total
        supaya bisa capture ulang dari nol. Tidak menyentuh dataset/ (hasil assign
        label) atau cameras.yaml. Raise kalau masih ada interval job jalan, supaya
        tidak reset di tengah capture yang masih aktif."""
        if self._interval_jobs:
            raise RuntimeError("Masih ada interval capture yang jalan — stop dulu sebelum reset")
        deleted = sum(1 for _ in self.sample_dir.rglob("*.jpg")) if self.sample_dir.exists() else 0
        if self.sample_dir.exists():
            shutil.rmtree(self.sample_dir)
        self.sample_dir.mkdir(parents=True, exist_ok=True)
        return deleted

    def delete_sample(self, label: str) -> bool:
        """Hapus SATU sample (folder) beserta seluruh isinya (gambar, bbox
        .txt, crops) — dipakai untuk membuang kategori sample yang tidak
        dipakai lagi supaya tidak terus muncul sebagai chip. Tidak menyentuh
        dataset/ (hasil assign label)."""
        target_dir = self.sample_dir / self._safe_name(label)
        if not target_dir.exists():
            return False
        shutil.rmtree(target_dir)
        return True

    def count_by_label(self) -> dict[str, int]:
        counts = {}
        if not self.sample_dir.exists():
            return counts
        for label_dir in self.sample_dir.iterdir():
            if label_dir.is_dir():
                counts[label_dir.name] = sum(1 for _ in label_dir.glob("*.jpg"))
        return counts

    @staticmethod
    def _safe_name(name: str) -> str:
        name = name.strip().lower().replace(" ", "_")
        return "".join(c for c in name if c.isalnum() or c in "_-") or "tanpa_label"
