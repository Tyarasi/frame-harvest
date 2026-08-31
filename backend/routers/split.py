import io
import zipfile
from datetime import datetime

from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel

from services.dataset_splitter import get_split_summary, split_dataset
from services.yolo_splitter import get_yolo_split_summary, split_yolo_dataset
from state import project_manager, require_project

router = APIRouter()


class SplitRequest(BaseModel):
    train_ratio: float = 0.7
    val_ratio: float = 0.15
    test_ratio: float = 0.15
    seed: int = 42


class YoloSplitRequest(SplitRequest):
    # daftar nama kelas buat data.yaml — boleh lebih dari 1 sekarang, index
    # di list ini HARUS sinkron dengan class_id yang ditulis tiap bbox
    class_names: list[str] = ["object"]


@router.post("/api/projects/{project_id}/split")
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


@router.get("/api/projects/{project_id}/split")
def read_split(project_id: str):
    require_project(project_id)
    return get_split_summary(project_manager.project_dir(project_id) / "split")


@router.post("/api/projects/{project_id}/yolo-split")
def create_yolo_split(project_id: str, req: YoloSplitRequest):
    """Resep YOLO — split FRAME PENUH + bbox-nya (bukan crop per-label
    seperti split ResNet), ke split_yolo/ (folder terpisah total dari
    split/ ResNet, tidak akan pernah tertukar struktur)."""
    require_project(project_id)
    pdir = project_manager.project_dir(project_id)
    project = project_manager.get_project(project_id)
    class_names = [c.strip() for c in req.class_names if c.strip()] or ["object"]
    try:
        return split_yolo_dataset(
            pdir / "sample",
            pdir / "split_yolo",
            req.train_ratio,
            req.val_ratio,
            req.test_ratio,
            req.seed,
            class_names,
            # ambil gambar+bbox dari UJUNG RANTAI tahap saat ini — bisa dari
            # dalam crop (mis. bbox lanyard di crop person), bukan cuma frame
            # penuh lagi (lihat stage_resolver.py & yolo_splitter.py)
            stages=project["stages"] if project else None,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/api/projects/{project_id}/yolo-split")
def read_yolo_split(project_id: str):
    require_project(project_id)
    return get_yolo_split_summary(project_manager.project_dir(project_id) / "split_yolo")


@router.get("/api/projects/{project_id}/split/export")
def export_split(project_id: str):
    """Bungkus split/train|val|test jadi 1 file .zip untuk backup atau
    dipindah ke perangkat lain (mis. training di GPU) — struktur folder di
    dalam zip PERSIS sama dengan split/ (train/<label>/*.jpg dst.), jadi
    begitu di-extract langsung bisa dibaca torchvision.ImageFolder tanpa
    olah data apapun lagi."""
    require_project(project_id)
    project = next((p for p in project_manager.list_projects() if p["id"] == project_id), None)
    split_dir = project_manager.project_dir(project_id) / "split"

    files = list(split_dir.rglob("*.jpg")) if split_dir.exists() else []
    if not files:
        raise HTTPException(404, "Belum ada split — jalankan 'Generate Split' dulu di Persiapan Dataset")

    summary = get_split_summary(split_dir)
    info_lines = [
        f"Project        : {project['name'] if project else project_id} ({project_id})",
        f"Tujuan dataset : {project.get('dataset_target', 'resnet') if project else 'resnet'}",
        f"Diekspor       : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"Total gambar   : {len(files)}",
        "",
        "Ringkasan per label (train / val / test):",
    ]
    for label, counts in summary.items():
        info_lines.append(f"  {label}: {counts['train']} / {counts['val']} / {counts['test']}")

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("_export_info.txt", "\n".join(info_lines) + "\n")
        for file_path in files:
            zf.write(file_path, arcname=str(file_path.relative_to(split_dir)))

    filename = f"{project_id}-split-{datetime.now().strftime('%Y%m%d')}.zip"
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
