from pathlib import Path

# "Tahap" (stage) = 1 langkah BBox atau Crop yang bisa dirantai berkali-kali
# per project (bbox->crop->bbox->crop->...), menggantikan resep BBox/Crop
# yang dulu kaku (sekali per project). Modul ini murni hitung-hitungan path
# — tidak menyentuh disk sama sekali, supaya gampang dites tanpa I/O nyata.
#
# Aturan folder: tahap 'bbox' TIDAK bikin folder baru (dia cuma nulis file
# .txt bbox di folder yang SUDAH ada). Tahap 'crop' bikin folder baru persis
# bernama id-nya sendiri, DI DALAM folder tempat dia baca bbox-nya. Karena
# stage default project ResNet id-nya literal "crops" (lihat
# project_manager.py), tahap crop PERTAMA di project MANAPUN selalu resolve
# ke "<label_dir>/crops" — sama persis dengan CROPS_DIRNAME yang sudah
# dipakai person_annotator.py & Crop Atas sebelum fitur ini ada. Nol migrasi
# data untuk project lama.


def stage_folder(label_dir: Path, stages: list[dict], upto_index: int) -> Path:
    """Folder aktif setelah tahap ke `upto_index` (0-based, inklusif)
    diterapkan ke `label_dir`. `upto_index = -1` => folder akar (sebelum
    tahap manapun, `label_dir` apa adanya)."""
    folder = label_dir
    for i in range(upto_index + 1):
        if stages[i]["type"] == "crop":
            folder = folder / stages[i]["id"]
    return folder


def final_stage_folder(label_dir: Path, stages: list[dict]) -> Path:
    """Folder "ujung rantai" checklist tahapan saat ini — dipakai Label
    (ResNet) & Split (YOLO) untuk tahu harus baca gambar+bbox dari mana."""
    return stage_folder(label_dir, stages, len(stages) - 1)


def can_add_stage(stages: list[dict], stage_type: str) -> str | None:
    """None kalau `stage_type` valid ditambahkan sebagai tahap berikutnya,
    atau pesan error (Indonesia, siap tampil ke user) kalau tidak. Aturan:
    checklist WAJIB alternating, mulai dari 'bbox' (crop tidak bisa jalan
    tanpa bbox pasangannya tepat sebelum dia)."""
    if stage_type not in ("bbox", "crop"):
        return f"Tipe tahap tidak dikenal: '{stage_type}'"
    if not stages:
        if stage_type != "bbox":
            return "Tahap pertama harus BBox — Crop butuh bbox dulu sebagai sumbernya"
        return None
    last_type = stages[-1]["type"]
    if stage_type == last_type:
        return (
            f"Tahap sebelumnya juga '{last_type}' — harus bergantian "
            "(BBox, lalu Crop, lalu BBox lagi, dst)"
        )
    return None
