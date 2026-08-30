import re
import shutil
from pathlib import Path


class LabelDataset:
    """Kelola dataset klasifikasi berlabel di label_dir/<label>/<filename>.jpg —
    hasil "assign" dari crop object di sample/<sample>/crops/, dipakai sebagai
    data training model (mis. ResNet lanyard classifier). Terpisah dari
    CaptureManager (yang mengelola sample/ mentah hasil capture)."""

    def __init__(self, label_dir: Path):
        self.label_dir = label_dir
        self.label_dir.mkdir(parents=True, exist_ok=True)

    def assign(self, label: str, source_dir: Path, filenames: list[str]) -> int:
        """Copy tiap file di filenames dari source_dir ke label_dir/<label>/.
        Copy (bukan move) supaya crop asli di sample/ tetap ada dan bisa
        di-assign ulang/ke label lain kalau perlu.

        Sengaja pakai shutil.copy (BUKAN copy2): copy2 ikut menyalin metadata
        termasuk mtime dari file sumbernya — hasilnya file di dataset/ punya
        mtime waktu crop itu di-CAPTURE, bukan waktu dia di-assign/dilabel.
        list_images() di bawah mengurutkan berdasarkan mtime terbaru dulu
        (asumsinya "baru dilabel"), jadi kalau ikut copy2 urutannya jadi
        salah (baru DI-CAPTURE duluan, bukan baru DILABEL duluan). shutil.copy
        polos otomatis kasih mtime = waktu copy = waktu assign ini terjadi."""
        target_dir = self.label_dir / self._safe_name(label)
        target_dir.mkdir(parents=True, exist_ok=True)

        assigned = 0
        for filename in filenames:
            if "/" in filename or "\\" in filename or filename in (".", ".."):
                continue
            src = source_dir / filename
            if src.is_file():
                shutil.copy(src, target_dir / filename)
                assigned += 1
        return assigned

    def all_assigned_filenames(self) -> set[str]:
        """Kumpulan nama file yang sudah pernah di-assign ke label manapun —
        dipakai untuk menyaring crop di sample/ supaya yang sudah dilabel
        tidak muncul lagi di Mode Grid/Swipe (cegah dobel label)."""
        if not self.label_dir.exists():
            return set()
        return {
            f.name
            for d in self.label_dir.iterdir()
            if d.is_dir()
            for f in d.glob("*.jpg")
        }

    def list_labels(self) -> list[dict]:
        if not self.label_dir.exists():
            return []
        return [
            {"name": d.name, "count": sum(1 for _ in d.glob("*.jpg"))}
            for d in sorted(self.label_dir.iterdir())
            if d.is_dir()
        ]

    def list_images(self, label: str, limit: int = 200) -> list[dict]:
        target_dir = self.label_dir / self._safe_name(label)
        if not target_dir.exists():
            return []
        files = sorted(target_dir.glob("*.jpg"), key=lambda p: p.stat().st_mtime, reverse=True)
        return [
            {
                "path": f"{self._safe_name(label)}/{f.name}",
                "label": self._safe_name(label),
                "size_bytes": f.stat().st_size,
            }
            for f in files[:limit]
        ]

    def delete_label(self, label: str) -> bool:
        """Hapus SATU label (folder) beserta seluruh gambarnya — dipakai untuk
        membuang kategori label yang tidak dipakai lagi (mis. label kosong
        sisa salah ketik) supaya tidak terus muncul sebagai chip."""
        target_dir = self.label_dir / self._safe_name(label)
        if not target_dir.exists():
            return False
        shutil.rmtree(target_dir)
        return True

    def delete_images(self, label: str, filenames: list[str]) -> int:
        target_dir = self.label_dir / self._safe_name(label)
        deleted = 0
        for filename in filenames:
            if "/" in filename or "\\" in filename or filename in (".", ".."):
                continue
            filepath = target_dir / filename
            if filepath.is_file():
                filepath.unlink()
                deleted += 1
        return deleted

    @staticmethod
    def _safe_name(name: str) -> str:
        name = name.strip().lower().replace(" ", "_")
        return re.sub(r"[^a-z0-9_-]", "", name)
