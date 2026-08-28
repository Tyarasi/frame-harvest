import re
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from services.camera_manager import CameraManager
from services.capture_manager import CaptureManager
from services.dataset_splitter import get_split_summary, split_dataset
from services.label_dataset import LabelDataset
from services.person_annotator import (
    CROPS_DIRNAME,
    annotate_label_dir,
    crop_objects_label_dir,
    ensure_classes_file,
    sync_crops_for_image,
    write_boxes,
)
from services.project_manager import ProjectManager, migrate_legacy_data
from services.training_config import get_config as get_training_config_data
from services.training_config import save_config as save_training_config_data
from services.training_runner import evaluate_test_set, get_device_label, get_status as get_training_status
from services.training_runner import start_training, stop_training

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
# tiap project py isolasi sample/ dan dataset/ sendiri-sendiri.
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # kamera default nonaktif saat startup — user aktifkan manual per kamera
    yield
    camera_manager.stop_all()


app = FastAPI(lifespan=lifespan)
if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
app.mount("/projects", StaticFiles(directory=PROJECTS_DIR), name="projects")


class AddProjectRequest(BaseModel):
    name: str


class CaptureRequest(BaseModel):
    project_id: str
    camera_id: str
    label: str
    width: int | None = None
    height: int | None = None


class IntervalRequest(BaseModel):
    project_id: str
    camera_id: str
    label: str
    interval_sec: float
    width: int | None = None
    height: int | None = None


class AddCameraRequest(BaseModel):
    name: str
    rtsp_url: str


class DeleteImagesRequest(BaseModel):
    filenames: list[str]


class AnnotateRequest(BaseModel):
    confidence: float = 0.4
    overwrite: bool = False


class CropRequest(BaseModel):
    overwrite: bool = False


class Box(BaseModel):
    x: float
    y: float
    w: float
    h: float


class SaveBoxesRequest(BaseModel):
    boxes: list[Box]


class AssignLabelRequest(BaseModel):
    sample: str
    filenames: list[str]


class SplitRequest(BaseModel):
    train_ratio: float = 0.7
    val_ratio: float = 0.15
    test_ratio: float = 0.15
    seed: int = 42


class TrainingConfigRequest(BaseModel):
    backbone: str = "resnet18"
    epochs: int = 15
    batch_size: int = 32
    learning_rate: float = 0.001
    freeze_backbone: bool = True


@app.get("/")
def index():
    index_path = FRONTEND_DIST / "index.html"
    if not index_path.exists():
        return HTMLResponse(
            "<h1>Frontend belum di-build</h1>"
            "<p>Jalankan <code>cd frontend && npm install && npm run build</code> "
            "lalu restart server ini.</p>",
            status_code=503,
        )
    return FileResponse(index_path)


@app.get("/api/projects")
def list_projects():
    return project_manager.list_projects()


@app.post("/api/projects")
def add_project(req: AddProjectRequest):
    if not req.name.strip():
        raise HTTPException(400, "Nama project tidak boleh kosong")
    return project_manager.add_project(req.name)


@app.put("/api/projects/{project_id}")
def rename_project(project_id: str, req: AddProjectRequest):
    if not req.name.strip():
        raise HTTPException(400, "Nama project tidak boleh kosong")
    project = project_manager.rename_project(project_id, req.name)
    if project is None:
        raise HTTPException(404, f"Project '{project_id}' tidak ditemukan")
    return project


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    deleted = project_manager.delete_project(project_id)
    if not deleted:
        raise HTTPException(404, f"Project '{project_id}' tidak ditemukan")
    _capture_managers.pop(project_id, None)
    _label_datasets.pop(project_id, None)
    return {"deleted": project_id}


@app.get("/api/cameras")
def list_cameras():
    return camera_manager.list_cameras()


@app.post("/api/cameras")
def add_camera(req: AddCameraRequest):
    name = req.name.strip()
    rtsp_url = req.rtsp_url.strip()
    if not name:
        raise HTTPException(400, "Nama kamera tidak boleh kosong")
    if not rtsp_url.startswith("rtsp://"):
        raise HTTPException(400, "URL harus diawali rtsp://")

    base_id = slugify(name)
    camera_id = base_id
    n = 2
    while camera_manager.get(camera_id) is not None:
        camera_id = f"{base_id}-{n}"
        n += 1

    camera_manager.add(camera_id, name, rtsp_url)
    save_cameras_config()
    return {"id": camera_id, "name": name}


@app.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: str):
    if camera_manager.get(camera_id) is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")
    # kamera ini bisa saja punya interval job jalan di project manapun
    for cm in _capture_managers.values():
        cm.stop_interval(camera_id)
    camera_manager.remove(camera_id)
    save_cameras_config()
    return {"deleted": camera_id}


@app.post("/api/cameras/{camera_id}/start")
def start_camera_stream(camera_id: str):
    stream = camera_manager.get(camera_id)
    if stream is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")
    stream.start()
    return {"active": True}


@app.post("/api/cameras/{camera_id}/stop")
def stop_camera_stream(camera_id: str):
    stream = camera_manager.get(camera_id)
    if stream is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")
    for cm in _capture_managers.values():
        cm.stop_interval(camera_id)
    stream.stop()
    return {"active": False}


@app.get("/api/projects/{project_id}/status")
def project_status(project_id: str):
    cm = get_capture_manager(project_id)
    return {
        "cameras": camera_manager.list_cameras(),
        "counts": cm.count_by_label(),
        "interval_running": [
            cam["id"] for cam in camera_manager.list_cameras() if cm.is_interval_running(cam["id"])
        ],
    }


@app.get("/api/projects/{project_id}/sample/images")
def list_all_dataset_images(project_id: str, limit: int = 5000):
    return get_capture_manager(project_id).list_all_images(limit)


@app.get("/api/projects/{project_id}/sample/{label}/images")
def list_dataset_images(project_id: str, label: str, limit: int = 5000):
    return get_capture_manager(project_id).list_images(label, limit)


@app.delete("/api/projects/{project_id}/sample/{label}/images")
def delete_dataset_images(project_id: str, label: str, req: DeleteImagesRequest):
    deleted = get_capture_manager(project_id).delete_images(label, req.filenames)
    return {"deleted": deleted}


@app.delete("/api/projects/{project_id}/sample/{label}")
def delete_sample(project_id: str, label: str):
    deleted = get_capture_manager(project_id).delete_sample(label)
    if not deleted:
        raise HTTPException(404, f"Sample '{label}' tidak ditemukan")
    return {"deleted": label}


@app.put("/api/projects/{project_id}/sample/{label}/images/{filename}/boxes")
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


@app.post("/api/projects/{project_id}/sample/annotate")
def annotate_all_labels(project_id: str, req: AnnotateRequest):
    cm = get_capture_manager(project_id)
    ensure_classes_file(cm.sample_dir)
    totals = {"total_images": 0, "processed": 0, "skipped": 0, "with_person": 0, "total_boxes": 0}
    for label_dir in cm.all_label_dirs():
        result = annotate_label_dir(label_dir, confidence=req.confidence, overwrite=req.overwrite)
        for key in totals:
            totals[key] += result[key]
    return totals


@app.post("/api/projects/{project_id}/sample/{label}/annotate")
def annotate_label(project_id: str, label: str, req: AnnotateRequest):
    cm = get_capture_manager(project_id)
    label_dir = cm.label_dir(label)
    if not label_dir.exists():
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    ensure_classes_file(cm.sample_dir)
    return annotate_label_dir(label_dir, confidence=req.confidence, overwrite=req.overwrite)


@app.post("/api/projects/{project_id}/sample/reset")
def reset_all_samples(project_id: str):
    try:
        deleted = get_capture_manager(project_id).delete_all()
    except RuntimeError as e:
        raise HTTPException(409, str(e))
    return {"deleted": deleted}


@app.get("/api/projects/{project_id}/sample/crops")
def list_all_dataset_crops(project_id: str, limit: int = 5000, exclude_assigned: bool = False):
    crops = get_capture_manager(project_id).list_all_crops(limit)
    if exclude_assigned:
        assigned = get_label_dataset(project_id).all_assigned_filenames()
        crops = [c for c in crops if Path(c["path"]).name not in assigned]
    return crops


@app.get("/api/projects/{project_id}/sample/{label}/crops")
def list_dataset_crops(project_id: str, label: str, limit: int = 5000, exclude_assigned: bool = False):
    crops = get_capture_manager(project_id).list_crops(label, limit)
    if exclude_assigned:
        assigned = get_label_dataset(project_id).all_assigned_filenames()
        crops = [c for c in crops if Path(c["path"]).name not in assigned]
    return crops


@app.delete("/api/projects/{project_id}/sample/{label}/crops")
def delete_dataset_crops(project_id: str, label: str, req: DeleteImagesRequest):
    deleted = get_capture_manager(project_id).delete_crops(label, req.filenames)
    return {"deleted": deleted}


@app.post("/api/projects/{project_id}/sample/crop-objects")
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


@app.post("/api/projects/{project_id}/sample/{label}/crop-objects")
def crop_label(project_id: str, label: str, req: CropRequest):
    cm = get_capture_manager(project_id)
    label_dir = cm.label_dir(label)
    if not label_dir.exists():
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    return crop_objects_label_dir(label_dir, overwrite=req.overwrite)


@app.get("/api/projects/{project_id}/labels")
def list_labels(project_id: str):
    return get_label_dataset(project_id).list_labels()


@app.post("/api/projects/{project_id}/labels/{label}/assign")
def assign_label(project_id: str, label: str, req: AssignLabelRequest):
    if not label.strip():
        raise HTTPException(400, "Nama label tidak boleh kosong")
    cm = get_capture_manager(project_id)
    crops_dir = cm.label_dir(req.sample) / CROPS_DIRNAME
    if not crops_dir.exists():
        raise HTTPException(404, f"Sample '{req.sample}' belum punya crop object")
    assigned = get_label_dataset(project_id).assign(label, crops_dir, req.filenames)
    return {"assigned": assigned}


@app.get("/api/projects/{project_id}/labels/{label}/images")
def list_label_images(project_id: str, label: str, limit: int = 5000):
    return get_label_dataset(project_id).list_images(label, limit)


@app.delete("/api/projects/{project_id}/labels/{label}/images")
def delete_label_images(project_id: str, label: str, req: DeleteImagesRequest):
    deleted = get_label_dataset(project_id).delete_images(label, req.filenames)
    return {"deleted": deleted}


@app.delete("/api/projects/{project_id}/labels/{label}")
def delete_label(project_id: str, label: str):
    deleted = get_label_dataset(project_id).delete_label(label)
    if not deleted:
        raise HTTPException(404, f"Label '{label}' tidak ditemukan")
    return {"deleted": label}


@app.post("/api/projects/{project_id}/split")
def create_split(project_id: str, req: SplitRequest):
    require_project(project_id)
    pdir = project_manager.project_dir(project_id)
    try:
        return split_dataset(
            pdir / "dataset",
            pdir / "split",
            req.train_ratio,
            req.val_ratio,
            req.test_ratio,
            req.seed,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/api/projects/{project_id}/split")
def read_split(project_id: str):
    require_project(project_id)
    return get_split_summary(project_manager.project_dir(project_id) / "split")


@app.get("/api/training-device")
def read_training_device():
    return {"device": get_device_label()}


@app.get("/api/projects/{project_id}/training-config")
def read_training_config(project_id: str):
    require_project(project_id)
    return get_training_config_data(project_manager.project_dir(project_id))


@app.put("/api/projects/{project_id}/training-config")
def write_training_config(project_id: str, req: TrainingConfigRequest):
    require_project(project_id)
    return save_training_config_data(project_manager.project_dir(project_id), req.model_dump())


@app.post("/api/projects/{project_id}/training/start")
def start_training_job(project_id: str):
    require_project(project_id)
    project_dir = project_manager.project_dir(project_id)
    config = get_training_config_data(project_dir)
    started, _ = start_training(project_id, project_dir, config)
    if not started:
        raise HTTPException(409, "Training sudah berjalan untuk project ini")
    return {"started": True}


@app.get("/api/projects/{project_id}/training/status")
def read_training_status(project_id: str):
    require_project(project_id)
    return get_training_status(project_id)


@app.post("/api/projects/{project_id}/training/stop")
def stop_training_job(project_id: str):
    require_project(project_id)
    return {"stopped": stop_training(project_id)}


@app.post("/api/projects/{project_id}/training/evaluate-test")
def evaluate_training_test_set(project_id: str):
    require_project(project_id)
    project_dir = project_manager.project_dir(project_id)
    try:
        return evaluate_test_set(project_dir)
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e


@app.get("/stream/{camera_id}")
def stream(camera_id: str):
    stream = camera_manager.get(camera_id)
    if stream is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")

    def generate():
        import time

        while True:
            frame = stream.get_frame()
            if frame is not None:
                ok, buf = cv2.imencode(".jpg", frame)
                if ok:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
                    )
            time.sleep(1 / 12)  # ~12 fps, cukup untuk preview

    return StreamingResponse(
        generate(), media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.post("/api/capture")
def capture(req: CaptureRequest):
    if camera_manager.get(req.camera_id) is None:
        raise HTTPException(404, f"Kamera '{req.camera_id}' tidak ditemukan")

    cm = get_capture_manager(req.project_id)
    resize_to = (req.width, req.height) if req.width and req.height else None
    # kalau stream nonaktif, save_frame otomatis konek RTSP sesaat untuk ambil 1 frame
    filepath = cm.save_frame(req.camera_id, req.label, resize_to)
    if filepath is None:
        raise HTTPException(503, "Gagal ambil frame dari kamera (cek koneksi RTSP)")
    return {"saved": str(filepath.relative_to(BASE_DIR))}


@app.post("/api/interval/start")
def start_interval(req: IntervalRequest):
    if camera_manager.get(req.camera_id) is None:
        raise HTTPException(404, f"Kamera '{req.camera_id}' tidak ditemukan")
    cm = get_capture_manager(req.project_id)
    resize_to = (req.width, req.height) if req.width and req.height else None
    # stream boleh nonaktif — tiap tick otomatis konek RTSP sesaat (lihat save_frame)
    cm.start_interval(req.camera_id, req.label, req.interval_sec, resize_to)
    return {"running": True}


@app.post("/api/interval/stop")
def stop_interval(project_id: str, camera_id: str):
    get_capture_manager(project_id).stop_interval(camera_id)
    return {"running": False}
