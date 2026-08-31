# ---- Training resep YOLO — jalur terpisah total dari training ResNet
# (routers/training_resnet.py): data, config, job registry, checkpoint
# semuanya beda file/folder, sengaja tidak digabung 1 router ----

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.yolo_training_config import get_config as get_yolo_training_config_data
from services.yolo_training_config import save_config as save_yolo_training_config_data
from services.yolo_training_runner import evaluate_test_set as evaluate_yolo_test_set
from services.yolo_training_runner import get_status as get_yolo_training_status
from services.yolo_training_runner import start_training as start_yolo_training
from services.yolo_training_runner import stop_training as stop_yolo_training
from state import project_manager, require_project

router = APIRouter()


class YoloTrainingConfigRequest(BaseModel):
    epochs: int = 30
    batch_size: int = 16
    imgsz: int = 640
    patience: int = 100
    freeze: int = 0
    mosaic: bool = True
    fliplr: float = 0.5
    flipud: float = 0.0
    degrees: float = 0.0
    cache: Literal["none", "ram", "disk"] = "none"


@router.get("/api/projects/{project_id}/yolo-training-config")
def read_yolo_training_config(project_id: str):
    require_project(project_id)
    return get_yolo_training_config_data(project_manager.project_dir(project_id))


@router.put("/api/projects/{project_id}/yolo-training-config")
def write_yolo_training_config(project_id: str, req: YoloTrainingConfigRequest):
    require_project(project_id)
    return save_yolo_training_config_data(project_manager.project_dir(project_id), req.model_dump())


@router.post("/api/projects/{project_id}/yolo-training/start")
def start_yolo_training_job(project_id: str):
    require_project(project_id)
    project_dir = project_manager.project_dir(project_id)
    config = get_yolo_training_config_data(project_dir)
    started, _ = start_yolo_training(project_id, project_dir, config)
    if not started:
        raise HTTPException(409, "Training YOLO sudah berjalan untuk project ini")
    return {"started": True}


@router.get("/api/projects/{project_id}/yolo-training/status")
def read_yolo_training_status(project_id: str):
    require_project(project_id)
    return get_yolo_training_status(project_id)


@router.post("/api/projects/{project_id}/yolo-training/stop")
def stop_yolo_training_job(project_id: str):
    require_project(project_id)
    return {"stopped": stop_yolo_training(project_id)}


@router.post("/api/projects/{project_id}/yolo-training/evaluate-test")
def evaluate_yolo_training_test_set(project_id: str):
    require_project(project_id)
    project_dir = project_manager.project_dir(project_id)
    try:
        return evaluate_yolo_test_set(project_dir)
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e
