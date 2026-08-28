import threading
import time

import cv2


class CameraStream:
    """Baca RTSP di thread terpisah, selalu simpan frame TERBARU saja.

    Kalau baca RTSP langsung tiap request, frame ketinggalan buffer decoder
    OS/ffmpeg lama-lama jadi delay (stream "ngelag" makin lama makin telat).
    Baca terus-menerus di background lalu overwrite frame terakhir menghindari itu.
    """

    def __init__(self, camera_id: str, name: str, rtsp_url: str):
        self.camera_id = camera_id
        self.name = name
        self.rtsp_url = rtsp_url

        self._cap: cv2.VideoCapture | None = None
        self._frame = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: threading.Thread | None = None
        self._last_error: str | None = None

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        if self._cap:
            self._cap.release()

    def _loop(self):
        while self._running:
            self._cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
            if not self._cap.isOpened():
                self._last_error = f"Tidak bisa konek ke {self.rtsp_url}"
                time.sleep(5)
                continue

            self._last_error = None
            while self._running:
                ok, frame = self._cap.read()
                if not ok:
                    self._last_error = "Koneksi RTSP terputus, mencoba ulang..."
                    break
                with self._lock:
                    self._frame = frame

            self._cap.release()
            if self._running:
                time.sleep(2)  # jeda sebelum reconnect

    def get_frame(self):
        with self._lock:
            return None if self._frame is None else self._frame.copy()

    def capture_once(self, attempts: int = 5):
        """Buka koneksi RTSP sesaat untuk ambil 1 frame, dipakai saat stream
        sedang nonaktif (tidak mengubah status aktif/nonaktif stream)."""
        cap = cv2.VideoCapture(self.rtsp_url, cv2.CAP_FFMPEG)
        if not cap.isOpened():
            cap.release()
            return None
        frame = None
        for _ in range(attempts):
            ok, f = cap.read()
            if ok:
                frame = f
                break
        cap.release()
        return frame

    @property
    def is_active(self) -> bool:
        return self._running

    @property
    def status(self) -> str:
        if not self._running:
            return "Nonaktif"
        if self._last_error:
            return self._last_error
        if self._frame is None:
            return "Menyambung..."
        return "OK"


class CameraManager:
    def __init__(self, cameras_config: list[dict]):
        self.streams: dict[str, CameraStream] = {
            cam["id"]: CameraStream(cam["id"], cam["name"], cam["rtsp_url"])
            for cam in cameras_config
        }

    def stop_all(self):
        for stream in self.streams.values():
            stream.stop()

    def get(self, camera_id: str) -> CameraStream | None:
        return self.streams.get(camera_id)

    def add(self, camera_id: str, name: str, rtsp_url: str) -> CameraStream:
        # stream default nonaktif — user aktifkan manual lewat tombol di frontend
        stream = CameraStream(camera_id, name, rtsp_url)
        self.streams[camera_id] = stream
        return stream

    def remove(self, camera_id: str):
        stream = self.streams.pop(camera_id, None)
        if stream:
            stream.stop()

    def list_cameras(self) -> list[dict]:
        return [
            {
                "id": s.camera_id,
                "name": s.name,
                "status": s.status,
                "active": s.is_active,
            }
            for s in self.streams.values()
        ]

    def export_config(self) -> list[dict]:
        return [
            {"id": s.camera_id, "name": s.name, "rtsp_url": s.rtsp_url}
            for s in self.streams.values()
        ]
