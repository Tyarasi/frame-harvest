from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.person_annotator import (
    CROPS_TOP_DIRNAME,
    annotate_label_dir,
    crop_objects_label_dir,
    crop_top_label_dir,
    ensure_classes_file,
    sync_crops_for_image,
    write_boxes,
)
from services.stage_resolver import final_stage_folder, stage_folder
from state import camera_manager, get_capture_manager, get_label_dataset, project_manager

router = APIRouter()


class DeleteImagesRequest(BaseModel):
    filenames: list[str]


class CleanupRequest(BaseModel):
    older_than_days: float = 14.0


class AnnotateRequest(BaseModel):
    confidence: float = 0.4
    overwrite: bool = False


class CropRequest(BaseModel):
    overwrite: bool = False


class CropTopRequest(BaseModel):
    percent: float = 25.0
    overwrite: bool = False


class Box(BaseModel):
    x: float
    y: float
    w: float
    h: float
    # index kelas (0-based) — dulu selalu 0 ("person"), sekarang project
    # YOLO bisa punya banyak kelas, tiap kotak butuh tahu dia kelas yang mana
    class_id: int = 0


class SaveBoxesRequest(BaseModel):
    boxes: list[Box]


# ---- Tahap BBox/Crop general (bisa dirantai berkali-kali per project,
# lihat services/stage_resolver.py) — `stage_id` OPSIONAL di endpoint-endpoint
# di bawah: kalau tidak dikirim, perilaku PERSIS seperti sebelum fitur ini
# ada (folder akar sample/<label>/). Kalau dikirim, folder kerjanya dihitung
# dari checklist tahap project ini. ----


def _stages_of(project_id: str) -> list[dict]:
    project = project_manager.get_project(project_id)
    return project["stages"] if project else []


def _resolve_stage_dir(project_id: str, label: str, stage_id: str) -> Path:
    """Folder kerja untuk 1 tahap tertentu, pada 1 sample tertentu. Tahap
    'bbox' -> folder yang dia ANOTASI (index sebelum dia). Tahap 'crop' ->
    folder HASIL crop-nya sendiri (index dia)."""
    stages = _stages_of(project_id)
    idx = next((i for i, s in enumerate(stages) if s["id"] == stage_id), None)
    if idx is None:
        raise HTTPException(404, f"Tahap '{stage_id}' tidak ditemukan")
    base = get_capture_manager(project_id).label_dir(label)
    if stages[idx]["type"] == "bbox":
        return stage_folder(base, stages, idx - 1)
    return stage_folder(base, stages, idx)


def _resolve_stage_dir_all(project_id: str, stage_id: str) -> dict[str, Path]:
    """Sama seperti _resolve_stage_dir, tapi untuk SEMUA sample sekaligus —
    dipakai tampilan "Semua Sample". PENTING: tanpa ini, "Semua Sample" diam-
    diam balik baca folder akar/CROPS_DIRNAME literal (endpoint lama, tidak
    tahu stage_id) walau lagi lihat tahap yang bukan default — gambar hasil
    tahap itu jadi kelihatan "tidak ada" padahal sebenarnya ada, cuma dibaca
    dari folder yang salah."""
    cm = get_capture_manager(project_id)
    stages = _stages_of(project_id)
    idx = next((i for i, s in enumerate(stages) if s["id"] == stage_id), None)
    if idx is None:
        raise HTTPException(404, f"Tahap '{stage_id}' tidak ditemukan")
    ref_idx = idx - 1 if stages[idx]["type"] == "bbox" else idx
    return {d.name: stage_folder(d, stages, ref_idx) for d in cm.all_label_dirs()}


@router.get("/api/projects/{project_id}/status")
def project_status(project_id: str):
    cm = get_capture_manager(project_id)
    return {
        "cameras": camera_manager.list_cameras(),
        "counts": cm.count_by_label(),
        "interval_running": [
            cam["id"] for cam in camera_manager.list_cameras() if cm.is_interval_running(cam["id"])
        ],
    }


@router.get("/api/projects/{project_id}/sample/images")
def list_all_dataset_images(project_id: str, limit: int = 5000, stage_id: str | None = None):
    cm = get_capture_manager(project_id)
    if stage_id is None:
        return cm.list_all_images(limit)
    return cm.list_all_stage_images(_resolve_stage_dir_all(project_id, stage_id), limit)


@router.get("/api/projects/{project_id}/sample/{label}/images")
def list_dataset_images(project_id: str, label: str, limit: int = 5000, stage_id: str | None = None):
    cm = get_capture_manager(project_id)
    if stage_id is None:
        return cm.list_images(label, limit)
    folder = _resolve_stage_dir(project_id, label, stage_id)
    return cm.list_stage_images(folder, label, limit)


@router.delete("/api/projects/{project_id}/sample/{label}/images")
def delete_dataset_images(
    project_id: str, label: str, req: DeleteImagesRequest, stage_id: str | None = None
):
    cm = get_capture_manager(project_id)
    if stage_id is None:
        deleted = cm.delete_images(label, req.filenames)
    else:
        folder = _resolve_stage_dir(project_id, label, stage_id)
        deleted = cm.delete_images_in(folder, req.filenames)
    return {"deleted": deleted}


@router.delete("/api/projects/{project_id}/sample/{label}")
def delete_sample(project_id: str, label: str):
    deleted = get_capture_manager(project_id).delete_sample(label)
    if not deleted:
        raise HTTPException(404, f"Sample '{label}' tidak ditemukan")
    return {"deleted": label}


@router.put("/api/projects/{project_id}/sample/{label}/images/{filename}/boxes")
def save_boxes(
    project_id: str, label: str, filename: str, req: SaveBoxesRequest, stage_id: str | None = None
):
    if "/" in filename or "\\" in filename or filename in (".", ".."):
        raise HTTPException(400, "Nama file tidak valid")
    cm = get_capture_manager(project_id)
    folder = _resolve_stage_dir(project_id, label, stage_id) if stage_id else cm.label_dir(label)
    image_path = folder / filename
    if not image_path.is_file():
        raise HTTPException(404, "Gambar tidak ditemukan")
    ensure_classes_file(cm.sample_dir)
    write_boxes(image_path, [b.model_dump() for b in req.boxes])
    # auto-sync ulang crop yang SUDAH ADA cuma relevan buat alur lama (tahap
    # tunggal, folder crops/ tetap namanya) — tahap general punya aksi
    # "Jalankan Crop" eksplisit sendiri per tahap, jadi tidak perlu auto-sync
    crops_synced = 0 if stage_id else sync_crops_for_image(image_path)
    return {"boxes": len(req.boxes), "crops_synced": crops_synced}


@router.post("/api/projects/{project_id}/sample/annotate")
def annotate_all_labels(project_id: str, req: AnnotateRequest, stage_id: str | None = None):
    cm = get_capture_manager(project_id)
    ensure_classes_file(cm.sample_dir)
    stages = _stages_of(project_id) if stage_id else []
    if stage_id and (not stages or stages[0]["id"] != stage_id):
        raise HTTPException(400, "Auto-detect cuma tersedia di tahap BBox pertama")
    totals = {"total_images": 0, "processed": 0, "skipped": 0, "with_person": 0, "total_boxes": 0}
    for label_dir in cm.all_label_dirs():
        # tahap bbox pertama SELALU di folder akar (stage_folder(...,-1) tidak
        # pernah turun level), jadi label_dir apa adanya sudah benar di sini
        result = annotate_label_dir(label_dir, confidence=req.confidence, overwrite=req.overwrite)
        for key in totals:
            totals[key] += result[key]
    return totals


@router.post("/api/projects/{project_id}/sample/{label}/annotate")
def annotate_label(project_id: str, label: str, req: AnnotateRequest, stage_id: str | None = None):
    cm = get_capture_manager(project_id)
    if stage_id:
        stages = _stages_of(project_id)
        if not stages or stages[0]["id"] != stage_id:
            raise HTTPException(400, "Auto-detect cuma tersedia di tahap BBox pertama")
        folder = _resolve_stage_dir(project_id, label, stage_id)
    else:
        folder = cm.label_dir(label)
    if not folder.exists():
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    ensure_classes_file(cm.sample_dir)
    return annotate_label_dir(folder, confidence=req.confidence, overwrite=req.overwrite)


@router.get("/api/projects/{project_id}/sample/cleanup-preview")
def preview_sample_cleanup(project_id: str, older_than_days: float = 14.0):
    """Cuma HITUNG — tidak menghapus apapun. Kandidat: frame lebih tua dari
    older_than_days HARI yang sudah pernah di-crop (crop-nya sudah
    "menyelamatkan" datanya, jadi frame mentahnya aman dibuang)."""
    return get_capture_manager(project_id).preview_cleanup(older_than_days)


@router.post("/api/projects/{project_id}/sample/cleanup")
def run_sample_cleanup(project_id: str, req: CleanupRequest):
    """Eksekusi penghapusan sungguhan — HANYA dipanggil dari tombol yang
    sudah lewat dialog konfirmasi di frontend, sama seperti Reset Semua Data.
    Backend tidak pernah memanggil ini sendiri secara berkala/otomatis."""
    return get_capture_manager(project_id).run_cleanup(req.older_than_days)


@router.post("/api/projects/{project_id}/sample/reset")
def reset_all_samples(project_id: str):
    try:
        deleted = get_capture_manager(project_id).delete_all()
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return {"deleted": deleted}


@router.get("/api/projects/{project_id}/sample/crops")
def list_all_dataset_crops(
    project_id: str, limit: int = 5000, exclude_assigned: bool = False, stage_id: str | None = None
):
    cm = get_capture_manager(project_id)
    if stage_id is None:
        crops = cm.list_all_crops(limit)
    else:
        crops = cm.list_all_stage_images(_resolve_stage_dir_all(project_id, stage_id), limit)
    if exclude_assigned:
        assigned = get_label_dataset(project_id).all_assigned_filenames()
        crops = [c for c in crops if Path(c["path"]).name not in assigned]
    return crops


@router.get("/api/projects/{project_id}/sample/{label}/crops")
def list_dataset_crops(
    project_id: str, label: str, limit: int = 5000, exclude_assigned: bool = False, stage_id: str | None = None
):
    cm = get_capture_manager(project_id)
    if stage_id is None:
        crops = cm.list_crops(label, limit)
    else:
        folder = _resolve_stage_dir(project_id, label, stage_id)
        crops = cm.list_stage_images(folder, label, limit)
    if exclude_assigned:
        assigned = get_label_dataset(project_id).all_assigned_filenames()
        crops = [c for c in crops if Path(c["path"]).name not in assigned]
    return crops


@router.delete("/api/projects/{project_id}/sample/{label}/crops")
def delete_dataset_crops(
    project_id: str, label: str, req: DeleteImagesRequest, stage_id: str | None = None
):
    cm = get_capture_manager(project_id)
    if stage_id is None:
        deleted = cm.delete_crops(label, req.filenames)
    else:
        folder = _resolve_stage_dir(project_id, label, stage_id)
        deleted = cm.delete_images_in(folder, req.filenames)
    return {"deleted": deleted}


@router.post("/api/projects/{project_id}/sample/crop-objects")
def crop_all_labels(project_id: str, req: CropRequest, stage_id: str | None = None):
    cm = get_capture_manager(project_id)
    stages = _stages_of(project_id) if stage_id else []
    totals = {
        "total_images": 0,
        "processed": 0,
        "skipped": 0,
        "images_with_boxes": 0,
        "total_crops": 0,
    }
    for label_dir in cm.all_label_dirs():
        if stage_id:
            idx = next((i for i, s in enumerate(stages) if s["id"] == stage_id), None)
            if idx is None or stages[idx]["type"] != "crop":
                raise HTTPException(404, f"Tahap crop '{stage_id}' tidak ditemukan")
            src_dir = stage_folder(label_dir, stages, idx - 1)
            result = crop_objects_label_dir(src_dir, overwrite=req.overwrite, crops_dirname=stages[idx]["id"])
        else:
            result = crop_objects_label_dir(label_dir, overwrite=req.overwrite)
        for key in totals:
            totals[key] += result[key]
    return totals


@router.post("/api/projects/{project_id}/sample/{label}/crop-objects")
def crop_label(project_id: str, label: str, req: CropRequest, stage_id: str | None = None):
    cm = get_capture_manager(project_id)
    label_dir = cm.label_dir(label)
    if not label_dir.exists():
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    if stage_id is None:
        return crop_objects_label_dir(label_dir, overwrite=req.overwrite)
    stages = _stages_of(project_id)
    idx = next((i for i, s in enumerate(stages) if s["id"] == stage_id), None)
    if idx is None or stages[idx]["type"] != "crop":
        raise HTTPException(404, f"Tahap crop '{stage_id}' tidak ditemukan")
    src_dir = stage_folder(label_dir, stages, idx - 1)
    return crop_objects_label_dir(src_dir, overwrite=req.overwrite, crops_dirname=stages[idx]["id"])


@router.get("/api/projects/{project_id}/sample/{label}/crops-top")
def list_dataset_crops_top(
    project_id: str, label: str, limit: int = 5000, exclude_assigned: bool = False
):
    crops = get_capture_manager(project_id).list_crops(label, limit, dirname=CROPS_TOP_DIRNAME)
    if exclude_assigned:
        assigned = get_label_dataset(project_id).all_assigned_filenames()
        crops = [c for c in crops if Path(c["path"]).name not in assigned]
    return crops


@router.post("/api/projects/{project_id}/sample/{label}/crop-top-objects")
def crop_top_label(project_id: str, label: str, req: CropTopRequest):
    if not 0 < req.percent <= 100:
        raise HTTPException(400, "percent harus di antara 0 (eksklusif) dan 100")
    cm = get_capture_manager(project_id)
    label_dir = cm.label_dir(label)
    if not label_dir.exists():
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    # sumbernya sekarang "ujung rantai" tahap saat ini (biasanya = crops/,
    # tapi kalau project ini sudah nambah tahap crop lebih dalam, ikut situ)
    # — bukan literal CROPS_DIRNAME lagi. Tujuannya (crops_top/) tetap flat,
    # Crop Atas sengaja tidak ikut jadi bagian rantai tahap general.
    src_dir = final_stage_folder(label_dir, _stages_of(project_id))
    dest_dir = label_dir / CROPS_TOP_DIRNAME
    return crop_top_label_dir(src_dir, dest_dir, percent=req.percent, overwrite=req.overwrite)
