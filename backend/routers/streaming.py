import time

import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from state import BASE_DIR, camera_manager, get_capture_manager

router = APIRouter()


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


@router.get("/stream/{camera_id}")
def stream(camera_id: str):
    stream = camera_manager.get(camera_id)
    if stream is None:
        raise HTTPException(404, f"Kamera '{camera_id}' tidak ditemukan")

    def generate():
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


@router.post("/api/capture")
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


@router.post("/api/interval/start")
def start_interval(req: IntervalRequest):
    if camera_manager.get(req.camera_id) is None:
        raise HTTPException(404, f"Kamera '{req.camera_id}' tidak ditemukan")
    cm = get_capture_manager(req.project_id)
    resize_to = (req.width, req.height) if req.width and req.height else None
    # stream boleh nonaktif — tiap tick otomatis konek RTSP sesaat (lihat save_frame)
    cm.start_interval(req.camera_id, req.label, req.interval_sec, resize_to)
    return {"running": True}


@router.post("/api/interval/stop")
def stop_interval(project_id: str, camera_id: str):
    get_capture_manager(project_id).stop_interval(camera_id)
    return {"running": False}
