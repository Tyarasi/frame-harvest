from fastapi import APIRouter
from pydantic import BaseModel

from services.dataset_prep_config import get_config as get_dataset_prep_config_data
from services.dataset_prep_config import save_config as save_dataset_prep_config_data
from state import project_manager, require_project

router = APIRouter()


class DatasetPrepConfigRequest(BaseModel):
    # semua Optional/None (bukan default konkret) — supaya field yang TIDAK
    # dikirim pemanggil (mis. panel "Bersihkan Sample Lama" cuma kirim
    # retention_days) tidak ikut nimpa balik field lain jadi default,
    # dan tidak diketahui sudah "sengaja dikirim" atau "dilewati" begitu
    # Pydantic isi otomatis dengan nilai default konkret
    top_crop_percent: float | None = None
    use_top_crops: bool | None = None
    selected_sample: str | None = None
    label_mode: str | None = None
    label_name: str | None = None
    swipe_left_label: str | None = None
    swipe_right_label: str | None = None
    retention_days: float | None = None
    yolo_class_names: list[str] | None = None


@router.get("/api/projects/{project_id}/dataset-prep-config")
def read_dataset_prep_config(project_id: str):
    require_project(project_id)
    return get_dataset_prep_config_data(project_manager.project_dir(project_id))


@router.put("/api/projects/{project_id}/dataset-prep-config")
def write_dataset_prep_config(project_id: str, req: DatasetPrepConfigRequest):
    require_project(project_id)
    # exclude_none: cuma field yang BENAR-BENAR dikirim pemanggil yang
    # dipakai buat merge — lihat catatan di dataset_prep_config.save_config
    updates = req.model_dump(exclude_none=True)
    return save_dataset_prep_config_data(project_manager.project_dir(project_id), updates)
