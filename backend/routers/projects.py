import shutil
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.stage_resolver import stage_folder
from state import _capture_managers, _label_datasets, project_manager, require_project

router = APIRouter()


class AddProjectRequest(BaseModel):
    name: str
    dataset_target: Literal["resnet", "yolo"] = "resnet"


class AddStageRequest(BaseModel):
    type: Literal["bbox", "crop"]
    name: str


@router.get("/api/projects")
def list_projects():
    return project_manager.list_projects()


@router.post("/api/projects")
def add_project(req: AddProjectRequest):
    if not req.name.strip():
        raise HTTPException(400, "Nama project tidak boleh kosong")
    return project_manager.add_project(req.name, req.dataset_target)


@router.put("/api/projects/{project_id}")
def rename_project(project_id: str, req: AddProjectRequest):
    if not req.name.strip():
        raise HTTPException(400, "Nama project tidak boleh kosong")
    project = project_manager.rename_project(project_id, req.name)
    if project is None:
        raise HTTPException(404, f"Project '{project_id}' tidak ditemukan")
    return project


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    deleted = project_manager.delete_project(project_id)
    if not deleted:
        raise HTTPException(404, f"Project '{project_id}' tidak ditemukan")
    _capture_managers.pop(project_id, None)
    _label_datasets.pop(project_id, None)
    return {"deleted": project_id}


@router.post("/api/projects/{project_id}/stages")
def add_stage(project_id: str, req: AddStageRequest):
    """Tambah 1 tahap BBox/Crop ke checklist project — boleh kapan saja,
    tidak dikunci sekali di awal seperti dataset_target (lihat catatan di
    ProjectManager.add_project)."""
    require_project(project_id)
    try:
        return project_manager.add_stage(project_id, req.type, req.name)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/api/projects/{project_id}/stages/last")
def remove_last_stage(project_id: str):
    """Hapus tahap TERAKHIR (undo) — sekaligus bersihkan hasil disk-nya
    (folder crop-nya kalau type='crop', file .txt bbox-nya kalau type='bbox')
    supaya tidak ada sisa yatim yang membingungkan kalau tahap yang sama
    ditambah lagi nanti dengan id baru."""
    require_project(project_id)
    project = project_manager.get_project(project_id)
    stages = project["stages"] if project else []
    if not stages:
        raise HTTPException(400, "Tidak ada tahap untuk dihapus")
    minimum = 1 if project["dataset_target"] == "yolo" else 2
    if len(stages) <= minimum:
        raise HTTPException(400, "Tidak bisa hapus tahap dasar (bawaan) project ini")

    removed = stages[-1]
    sample_root = project_manager.project_dir(project_id) / "sample"
    if sample_root.exists():
        for sample_dir in sample_root.iterdir():
            if not sample_dir.is_dir():
                continue
            if removed["type"] == "crop":
                # hapus folder crop yang dihasilkan tahap ini (stage TERAKHIR
                # dalam list = index len(stages)-1, itu resolve ke folder-nya sendiri)
                target = stage_folder(sample_dir, stages, len(stages) - 1)
                if target.exists():
                    shutil.rmtree(target)
            else:
                # bbox — hapus semua .txt yang dia tulis di folder yang dia
                # anotasi (index sebelum dia), JANGAN sentuh gambar .jpg-nya
                target = stage_folder(sample_dir, stages, len(stages) - 2)
                if target.exists():
                    for txt in target.glob("*.txt"):
                        txt.unlink()

    try:
        return project_manager.remove_last_stage(project_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
