import shutil
import threading
from pathlib import Path

from ultralytics import YOLO

# Bobot awal buat fine-tune — file yang SAMA dipakai person_annotator.py
# untuk deteksi bbox otomatis (sudah ada di disk, tidak perlu download lagi).
YOLO_BASE_WEIGHTS = Path(__file__).parent.parent / "yolov8n.pt"


def get_device_label() -> str:
    import torch

    return "gpu" if torch.cuda.is_available() else "cpu"


class StopTraining(Exception):
    """Dipakai buat interupsi model.train() ultralytics dari dalam callback
    on_fit_epoch_end. Ultralytics tidak expose API "stop sekarang" yang
    stabil lintas versi (beda dari loop PyTorch manual di training_runner.py
    yang bisa dicek tiap batch) — exception yang di-raise dari callback
    DIVERIFIKASI LANGSUNG (bukan asumsi) berhasil menghentikan model.train()
    di batas epoch terdekat, checkpoint sejauh itu tetap tersimpan."""


class YoloTrainingJob:
    def __init__(self):
        self.status = "idle"  # idle | running | finished | stopped | error
        self.epoch = 0
        self.total_epochs = 0
        self.history: list[dict] = []
        self.error: str | None = None
        self._stop_event = threading.Event()

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "epoch": self.epoch,
            "total_epochs": self.total_epochs,
            "history": self.history,
            "error": self.error,
        }


_jobs: dict[str, YoloTrainingJob] = {}


def get_status(project_id: str) -> dict:
    job = _jobs.get(project_id)
    if job is None:
        return YoloTrainingJob().to_dict()
    return job.to_dict()


def _run_training(job: YoloTrainingJob, project_dir: Path, config: dict) -> None:
    data_yaml = project_dir / "split_yolo" / "data.yaml"
    try:
        if not data_yaml.exists():
            raise RuntimeError("Split YOLO belum ada untuk project ini — jalankan 'Split Dataset' dulu")

        epochs = max(1, int(config.get("epochs", 30)))
        batch = max(1, int(config.get("batch_size", 16)))
        imgsz = max(32, int(config.get("imgsz", 640)))

        job.status = "running"
        job.total_epochs = epochs

        model = YOLO(str(YOLO_BASE_WEIGHTS))

        def on_fit_epoch_end(trainer):
            # panggilan TERAKHIR (trainer.epoch == trainer.epochs) itu
            # revalidasi akhir setelah training selesai, BUKAN epoch
            # sungguhan — diverifikasi langsung lewat tes manual, metrics
            # dict-nya pun cuma berisi 4 key metrics/... tanpa val/box_loss
            if trainer.epoch >= trainer.epochs:
                return

            job.epoch = trainer.epoch + 1
            # trainer.tloss itu dict berkunci NAMA loss (mis. {"box_loss":
            # tensor(...)}), BUKAN list terindeks angka — diverifikasi
            # langsung, keliru pakai tloss[i] meledak KeyError.
            tloss = trainer.tloss
            loss_names = trainer.loss_names
            if isinstance(tloss, dict):
                train_losses = {name: round(float(tloss.get(name, 0.0)), 4) for name in loss_names}
            elif tloss is not None:
                train_losses = {name: round(float(tloss[i]), 4) for i, name in enumerate(loss_names)}
            else:
                train_losses = {}
            m = trainer.metrics or {}
            job.history.append(
                {
                    "epoch": job.epoch,
                    **train_losses,
                    "precision": round(float(m.get("metrics/precision(B)", 0.0)), 4),
                    "recall": round(float(m.get("metrics/recall(B)", 0.0)), 4),
                    "map50": round(float(m.get("metrics/mAP50(B)", 0.0)), 4),
                    "map50_95": round(float(m.get("metrics/mAP50-95(B)", 0.0)), 4),
                }
            )

            if job._stop_event.is_set():
                raise StopTraining("Dibatalkan oleh user")

        model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

        run_dir = project_dir / "model_yolo_runs"
        stopped_early = False
        try:
            model.train(
                data=str(data_yaml),
                epochs=epochs,
                batch=batch,
                imgsz=imgsz,
                project=str(run_dir),
                name="run",
                exist_ok=True,
                verbose=False,
            )
        except StopTraining:
            stopped_early = True

        best_weights = run_dir / "run" / "weights" / "best.pt"
        if best_weights.exists():
            model_dir = project_dir / "model"
            model_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(best_weights, model_dir / "best_yolo.pt")

        job.status = "stopped" if stopped_early else "finished"
    except Exception as e:  # noqa: BLE001 — laporkan ke UI, jangan sampai thread crash diam-diam
        job.status = "error"
        job.error = str(e)


def start_training(project_id: str, project_dir: Path, config: dict) -> tuple[bool, str | None]:
    existing = _jobs.get(project_id)
    if existing is not None and existing.status == "running":
        return False, "already_running"

    job = YoloTrainingJob()
    _jobs[project_id] = job
    thread = threading.Thread(target=_run_training, args=(job, project_dir, config), daemon=True)
    thread.start()
    return True, None


def stop_training(project_id: str) -> bool:
    """Best-effort — berhenti di batas EPOCH terdekat (bukan per-batch),
    karena ultralytics tidak expose hook aman di tengah 1 epoch. Untuk
    dataset kecil/epoch cepat, jedanya tetap terasa responsif."""
    job = _jobs.get(project_id)
    if job is None or job.status != "running":
        return False
    job._stop_event.set()
    return True


def evaluate_test_set(project_dir: Path) -> dict:
    """Evaluasi model/best_yolo.pt terhadap split_yolo/images/test — held-out,
    tidak pernah dilihat selama training. mAP50/mAP50-95/precision/recall
    dihitung langsung oleh ultralytics (bukan manual seperti classifier
    ResNet), sudah macro-average bawaan lintas kelas."""
    weights_path = project_dir / "model" / "best_yolo.pt"
    if not weights_path.exists():
        raise RuntimeError("Belum ada model YOLO tersimpan — jalankan training dulu sampai minimal 1 epoch selesai")

    data_yaml = project_dir / "split_yolo" / "data.yaml"
    if not data_yaml.exists():
        raise RuntimeError("Split YOLO belum ada — jalankan 'Split Dataset' dulu")

    test_images_dir = project_dir / "split_yolo" / "images" / "test"
    if not test_images_dir.exists() or not any(test_images_dir.glob("*.jpg")):
        raise RuntimeError("Folder split_yolo/images/test kosong — jalankan ulang 'Split Dataset'")

    model = YOLO(str(weights_path))
    # project=/name= WAJIB diisi eksplisit — kalau tidak, ultralytics nulis
    # ke ./runs/detect/val relatif working directory backend (diverifikasi
    # langsung: tanpa ini, folder "runs/" nyasar ke dalam backend/).
    val_dir = project_dir / "model_yolo_runs"
    result = model.val(
        data=str(data_yaml), split="test", project=str(val_dir), name="eval", exist_ok=True, verbose=False
    )

    return {
        "num_images": sum(1 for _ in test_images_dir.glob("*.jpg")),
        "precision": round(float(result.box.mp), 4),
        "recall": round(float(result.box.mr), 4),
        "map50": round(float(result.box.map50), 4),
        "map50_95": round(float(result.box.map), 4),
    }
