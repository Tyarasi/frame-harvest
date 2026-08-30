from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from state import _capture_managers, camera_manager, save_cameras_config, slugify

router = APIRouter()


class AddCameraRequest(BaseModel):
    name: str
    rtsp_url: str


@router.get("/api/cameras")
def list_cameras():
    return camera_manager.list_cameras()


@router.post("/api/cameras")
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


@router.delete("/api/cameras/{camera_id}")
def delete_camera(camera_id: str):
    if camera_manager.get(camera_id) is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")
    # kamera ini bisa saja punya interval job jalan di project manapun
    for cm in _capture_managers.values():
        cm.stop_interval(camera_id)
    camera_manager.remove(camera_id)
    save_cameras_config()
    return {"deleted": camera_id}


@router.post("/api/cameras/{camera_id}/start")
def start_camera_stream(camera_id: str):
    stream = camera_manager.get(camera_id)
    if stream is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")
    stream.start()
    return {"active": True}


@router.post("/api/cameras/{camera_id}/stop")
def stop_camera_stream(camera_id: str):
    stream = camera_manager.get(camera_id)
    if stream is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")
    for cm in _capture_managers.values():
        cm.stop_interval(camera_id)
    stream.stop()
    return {"active": False}
