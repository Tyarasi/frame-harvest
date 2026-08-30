from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from routers import (
    cameras,
    capture,
    dataset_prep,
    labels,
    projects,
    split,
    streaming,
    training_resnet,
    training_yolo,
)
from state import FRONTEND_DIST, PROJECTS_DIR, camera_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    # kamera default nonaktif saat startup — user aktifkan manual per kamera
    yield
    camera_manager.stop_all()


app = FastAPI(lifespan=lifespan)
if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")
app.mount("/projects", StaticFiles(directory=PROJECTS_DIR), name="projects")

# Setiap domain endpoint hidup di routers/<domain>.py sendiri — app.py cuma
# menyatukan (include_router), bukan lagi tempat definisi endpoint. Nambah
# domain baru di masa depan = tambah 1 file router baru + 1 baris di sini,
# tidak perlu sentuh file domain lain.
app.include_router(projects.router)
app.include_router(cameras.router)
app.include_router(capture.router)
app.include_router(labels.router)
app.include_router(split.router)
app.include_router(dataset_prep.router)
app.include_router(training_resnet.router)
app.include_router(training_yolo.router)
app.include_router(streaming.router)


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
