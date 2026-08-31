from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.person_annotator import CROPS_TOP_DIRNAME
from services.stage_resolver import final_stage_folder
from state import get_capture_manager, get_label_dataset, project_manager

router = APIRouter()


class DeleteImagesRequest(BaseModel):
    filenames: list[str]


class AssignLabelRequest(BaseModel):
    sample: str
    filenames: list[str]
    source: str = "crops"  # "crops" (full-body) atau "crops_top" (crop bagian atas)


@router.get("/api/projects/{project_id}/labels")
def list_labels(project_id: str):
    return get_label_dataset(project_id).list_labels()


@router.post("/api/projects/{project_id}/labels/{label}/assign")
def assign_label(project_id: str, label: str, req: AssignLabelRequest):
    if not label.strip():
        raise HTTPException(400, "Nama label tidak boleh kosong")
    if req.source not in ("crops", CROPS_TOP_DIRNAME):
        raise HTTPException(400, f"source harus 'crops' atau '{CROPS_TOP_DIRNAME}'")
    cm = get_capture_manager(project_id)
    if req.source == "crops":
        # "crops" sekarang berarti "ujung rantai tahap Crop saat ini" —
        # biasanya literal crops/ (checklist bawaan), tapi kalau project ini
        # sudah nambah tahap crop lebih dalam, ikut situ (lihat
        # stage_resolver.py) — bukan literal CROPS_DIRNAME lagi
        project = project_manager.get_project(project_id)
        stages = project["stages"] if project else []
        crops_dir = final_stage_folder(cm.label_dir(req.sample), stages)
    else:
        crops_dir = cm.label_dir(req.sample) / req.source
    if not crops_dir.exists():
        raise HTTPException(404, f"Sample '{req.sample}' belum punya crop di '{req.source}/'")
    assigned = get_label_dataset(project_id).assign(label, crops_dir, req.filenames)
    return {"assigned": assigned}


@router.get("/api/projects/{project_id}/labels/{label}/images")
def list_label_images(project_id: str, label: str, limit: int = 5000):
    return get_label_dataset(project_id).list_images(label, limit)


@router.delete("/api/projects/{project_id}/labels/{label}/images")
def delete_label_images(project_id: str, label: str, req: DeleteImagesRequest):
    deleted = get_label_dataset(project_id).delete_images(label, req.filenames)
    return {"deleted": deleted}


@router.delete("/api/projects/{project_id}/labels/{label}")
def delete_label(project_id: str, label: str):
    deleted = get_label_dataset(project_id).delete_label(label)
    if not deleted:
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    return {"deleted": label}
