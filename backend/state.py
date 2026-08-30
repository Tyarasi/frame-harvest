import re
from pathlib import Path

import yaml
from fastapi import HTTPException

from services.camera_manager import CameraManager
from services.capture_manager import CaptureManager
from services.label_dataset import LabelDataset
from services.project_manager import ProjectManager, migrate_legacy_data

# State & helper global yang dipakai LINTAS semua router — dipisah dari
# app.py (bukan didefinisikan di sana) supaya routers/*.py bisa import dari
# sini tanpa circular import balik ke app.py (app.py sendiri yang import
# semua routers).

BASE_DIR = Path(__file__).parent
CAMERAS_CONFIG_PATH = BASE_DIR / "cameras.yaml"
PROJECTS_DIR = BASE_DIR / "projects"
PROJECTS_CONFIG_PATH = BASE_DIR / "projects.yaml"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"


def load_cameras_config() -> list[dict]:
    if not CAMERAS_CONFIG_PATH.exists():
        print(
            f"[peringatan] {CAMERAS_CONFIG_PATH} tidak ditemukan — server tetap jalan "
            "tanpa kamera. Salin cameras.example.yaml jadi cameras.yaml dan isi RTSP "
            "URL kamera, lalu restart server."
        )
        return []
    with open(CAMERAS_CONFIG_PATH) as f:
        config = yaml.safe_load(f)
    return config["cameras"]


def save_cameras_config():
    with open(CAMERAS_CONFIG_PATH, "w") as f:
        yaml.safe_dump(
            {"cameras": camera_manager.export_config()},
            f,
            allow_unicode=True,
            sort_keys=False,
        )


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "kamera"


# Kamera tetap GLOBAL/shared lintas project (resource fisik, bukan data project).
camera_manager = CameraManager(load_cameras_config())

project_manager = ProjectManager(PROJECTS_DIR, PROJECTS_CONFIG_PATH)
migrate_legacy_data(project_manager, BASE_DIR)

# CaptureManager & LabelDataset dibuat per-project, lazy + di-cache di sini —
# tiap project isolasi sample/ dan dataset/ sendiri-sendiri.
_capture_managers: dict[str, CaptureManager] = {}
_label_datasets: dict[str, LabelDataset] = {}


def require_project(project_id: str) -> None:
    if not project_manager.exists(project_id):
        raise HTTPException(404, f"Project '{project_id}' tidak ditemukan")


def get_capture_manager(project_id: str) -> CaptureManager:
    require_project(project_id)
    if project_id not in _capture_managers:
        pdir = project_manager.project_dir(project_id)
        _capture_managers[project_id] = CaptureManager(camera_manager, pdir / "sample")
    return _capture_managers[project_id]


def get_label_dataset(project_id: str) -> LabelDataset:
    require_project(project_id)
    if project_id not in _label_datasets:
        pdir = project_manager.project_dir(project_id)
        _label_datasets[project_id] = LabelDataset(pdir / "dataset")
    return _label_datasets[project_id]
