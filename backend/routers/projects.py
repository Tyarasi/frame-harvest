from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from state import _capture_managers, _label_datasets, project_manager

router = APIRouter()


class AddProjectRequest(BaseModel):
    name: str
    dataset_target: Literal["resnet", "yolo"] = "resnet"


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
