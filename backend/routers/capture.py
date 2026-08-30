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
from state import camera_manager, get_capture_manager, get_label_dataset

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
def list_all_dataset_images(project_id: str, limit: int = 5000):
    return get_capture_manager(project_id).list_all_images(limit)


@router.get("/api/projects/{project_id}/sample/{label}/images")
def list_dataset_images(project_id: str, label: str, limit: int = 5000):
    return get_capture_manager(project_id).list_images(label, limit)


@router.delete("/api/projects/{project_id}/sample/{label}/images")
def delete_dataset_images(project_id: str, label: str, req: DeleteImagesRequest):
    deleted = get_capture_manager(project_id).delete_images(label, req.filenames)
    return {"deleted": deleted}


@router.delete("/api/projects/{project_id}/sample/{label}")
def delete_sample(project_id: str, label: str):
    deleted = get_capture_manager(project_id).delete_sample(label)
    if not deleted:
        raise HTTPException(404, f"Sample '{label}' tidak ditemukan")
    return {"deleted": label}


@router.put("/api/projects/{project_id}/sample/{label}/images/{filename}/boxes")
def save_boxes(project_id: str, label: str, filename: str, req: SaveBoxesRequest):
    if "/" in filename or "\\" in filename or filename in (".", ".."):
        raise HTTPException(400, "Nama file tidak valid")
    cm = get_capture_manager(project_id)
    image_path = cm.label_dir(label) / filename
    if not image_path.is_file():
        raise HTTPException(404, "Gambar tidak ditemukan")
    ensure_classes_file(cm.sample_dir)
    write_boxes(image_path, [b.model_dump() for b in req.boxes])
    crops_synced = sync_crops_for_image(image_path)
    return {"boxes": len(req.boxes), "crops_synced": crops_synced}


@router.post("/api/projects/{project_id}/sample/annotate")
def annotate_all_labels(project_id: str, req: AnnotateRequest):
    cm = get_capture_manager(project_id)
    ensure_classes_file(cm.sample_dir)
    totals = {"total_images": 0, "processed": 0, "skipped": 0, "with_person": 0, "total_boxes": 0}
    for label_dir in cm.all_label_dirs():
        result = annotate_label_dir(label_dir, confidence=req.confidence, overwrite=req.overwrite)
        for key in totals:
            totals[key] += result[key]
    return totals


@router.post("/api/projects/{project_id}/sample/{label}/annotate")
def annotate_label(project_id: str, label: str, req: AnnotateRequest):
    cm = get_capture_manager(project_id)
    label_dir = cm.label_dir(label)
    if not label_dir.exists():
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    ensure_classes_file(cm.sample_dir)
    return annotate_label_dir(label_dir, confidence=req.confidence, overwrite=req.overwrite)


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
def list_all_dataset_crops(project_id: str, limit: int = 5000, exclude_assigned: bool = False):
    crops = get_capture_manager(project_id).list_all_crops(limit)
    if exclude_assigned:
        assigned = get_label_dataset(project_id).all_assigned_filenames()
        crops = [c for c in crops if Path(c["path"]).name not in assigned]
    return crops


@router.get("/api/projects/{project_id}/sample/{label}/crops")
def list_dataset_crops(project_id: str, label: str, limit: int = 5000, exclude_assigned: bool = False):
    crops = get_capture_manager(project_id).list_crops(label, limit)
    if exclude_assigned:
        assigned = get_label_dataset(project_id).all_assigned_filenames()
        crops = [c for c in crops if Path(c["path"]).name not in assigned]
    return crops


@router.delete("/api/projects/{project_id}/sample/{label}/crops")
def delete_dataset_crops(project_id: str, label: str, req: DeleteImagesRequest):
    deleted = get_capture_manager(project_id).delete_crops(label, req.filenames)
    return {"deleted": deleted}


@router.post("/api/projects/{project_id}/sample/crop-objects")
def crop_all_labels(project_id: str, req: CropRequest):
    cm = get_capture_manager(project_id)
    totals = {
        "total_images": 0,
        "processed": 0,
        "skipped": 0,
        "images_with_boxes": 0,
        "total_crops": 0,
    }
    for label_dir in cm.all_label_dirs():
        result = crop_objects_label_dir(label_dir, overwrite=req.overwrite)
        for key in totals:
            totals[key] += result[key]
    return totals


@router.post("/api/projects/{project_id}/sample/{label}/crop-objects")
def crop_label(project_id: str, label: str, req: CropRequest):
    cm = get_capture_manager(project_id)
    label_dir = cm.label_dir(label)
    if not label_dir.exists():
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    return crop_objects_label_dir(label_dir, overwrite=req.overwrite)


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
    return crop_top_label_dir(label_dir, percent=req.percent, overwrite=req.overwrite)
