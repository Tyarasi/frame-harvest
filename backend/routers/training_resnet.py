from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from services.training_config import get_config as get_training_config_data
from services.training_config import save_config as save_training_config_data
from services.training_runner import evaluate_test_set, evaluate_uploaded_checkpoint, get_device_label
from services.training_runner import get_status as get_training_status
from services.training_runner import start_training, stop_training
from state import project_manager, require_project

router = APIRouter()


class TrainingConfigRequest(BaseModel):
    backbone: str = "resnet18"
    epochs: int = 15
    batch_size: int = 32
    learning_rate: float = 0.001
    freeze_backbone: bool = True


@router.get("/api/training-device")
def read_training_device():
    return {"device": get_device_label()}


@router.get("/api/projects/{project_id}/training-config")
def read_training_config(project_id: str):
    require_project(project_id)
    return get_training_config_data(project_manager.project_dir(project_id))


@router.put("/api/projects/{project_id}/training-config")
def write_training_config(project_id: str, req: TrainingConfigRequest):
    require_project(project_id)
    return save_training_config_data(project_manager.project_dir(project_id), req.model_dump())


@router.post("/api/projects/{project_id}/training/start")
def start_training_job(project_id: str):
    require_project(project_id)
    project_dir = project_manager.project_dir(project_id)
    config = get_training_config_data(project_dir)
    started, _ = start_training(project_id, project_dir, config)
    if not started:
        raise HTTPException(409, "Training sudah berjalan untuk project ini")
    return {"started": True}


@router.get("/api/projects/{project_id}/training/status")
def read_training_status(project_id: str):
    require_project(project_id)
    return get_training_status(project_id)


@router.post("/api/projects/{project_id}/training/stop")
def stop_training_job(project_id: str):
    require_project(project_id)
    return {"stopped": stop_training(project_id)}


@router.post("/api/projects/{project_id}/training/evaluate-test")
def evaluate_training_test_set(project_id: str):
    require_project(project_id)
    project_dir = project_manager.project_dir(project_id)
    try:
        return evaluate_test_set(project_dir)
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e


@router.post("/api/projects/{project_id}/training/evaluate-uploaded")
async def evaluate_uploaded_model(project_id: str, file: UploadFile = File(...)):
    """Evaluasi 1 file .pt yang diupload manual (mis. hasil training di
    mesin lain) terhadap split/test project ini — TIDAK PERNAH menimpa atau
    menyentuh model/best_model.pt project. Murni "coba dulu, lihat hasilnya"."""
    require_project(project_id)
    project_dir = project_manager.project_dir(project_id)
    content = await file.read()
    try:
        return evaluate_uploaded_checkpoint(project_dir, content)
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e
