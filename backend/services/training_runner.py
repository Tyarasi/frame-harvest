import threading
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import models, transforms
from torchvision.datasets import ImageFolder

# Training SUNGGUHAN, jalan langsung di backend memakai config dari "Setup
# Training" (backbone, epochs, batch_size, learning_rate, freeze_backbone)
# dan seluruh data di split/train|val — bukan simulasi, bukan subset yang
# dipangkas. Sengaja dijalankan di CPU laptop dev ini atas permintaan user
# (meski lebih lambat dari GPU), makanya training di-cek status stop di
# setiap batch supaya tombol "Stop" di frontend responsif tanpa harus
# menunggu 1 epoch penuh selesai.

def get_device_label() -> str:
    """Device yang benar-benar dipakai training saat ini di mesin ini."""
    return "gpu" if torch.cuda.is_available() else "cpu"


IMAGE_SIZE = 224

_IMAGENET_MEAN = [0.485, 0.456, 0.406]
_IMAGENET_STD = [0.229, 0.224, 0.225]

TRAIN_TRANSFORM = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.RandomHorizontalFlip(),
        transforms.ToTensor(),
        transforms.Normalize(mean=_IMAGENET_MEAN, std=_IMAGENET_STD),
    ]
)

EVAL_TRANSFORM = transforms.Compose(
    [
        transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
        transforms.ToTensor(),
        transforms.Normalize(mean=_IMAGENET_MEAN, std=_IMAGENET_STD),
    ]
)


class TrainingJob:
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
            "simulated": False,
        }


_jobs: dict[str, TrainingJob] = {}


def get_status(project_id: str) -> dict:
    job = _jobs.get(project_id)
    if job is None:
        return TrainingJob().to_dict()
    return job.to_dict()


def _build_model(backbone: str, num_classes: int, freeze_backbone: bool) -> nn.Module:
    if backbone == "resnet34":
        model = models.resnet34(weights=models.ResNet34_Weights.DEFAULT)
    else:
        model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
    if freeze_backbone:
        for param in model.parameters():
            param.requires_grad = False
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def _evaluate(model: nn.Module, loader: DataLoader, device: torch.device, num_classes: int) -> dict:
    model.eval()
    correct = 0
    total = 0
    tp = [0] * num_classes
    fp = [0] * num_classes
    fn = [0] * num_classes
    with torch.no_grad():
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            preds = model(images).argmax(dim=1)
            correct += (preds == labels).sum().item()
            total += labels.size(0)
            for c in range(num_classes):
                tp[c] += int(((preds == c) & (labels == c)).sum().item())
                fp[c] += int(((preds == c) & (labels != c)).sum().item())
                fn[c] += int(((preds != c) & (labels == c)).sum().item())

    # macro-average antar kelas — netral terhadap ketimpangan jumlah data
    # per label, cocok untuk project apapun (tidak diasumsikan binary)
    precisions = [tp[c] / (tp[c] + fp[c]) if (tp[c] + fp[c]) > 0 else 0.0 for c in range(num_classes)]
    recalls = [tp[c] / (tp[c] + fn[c]) if (tp[c] + fn[c]) > 0 else 0.0 for c in range(num_classes)]
    precision = sum(precisions) / num_classes if num_classes else 0.0
    recall = sum(recalls) / num_classes if num_classes else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    accuracy = correct / total if total else 0.0
    return {"accuracy": accuracy, "precision": precision, "recall": recall, "f1": f1}


def _run_training(job: TrainingJob, project_dir: Path, config: dict) -> None:
    try:
        train_dir = project_dir / "split" / "train"
        val_dir = project_dir / "split" / "val"
        if not train_dir.exists() or not any(train_dir.iterdir()):
            raise RuntimeError(
                "Split dataset belum ada untuk project ini — jalankan 'Split Dataset' dulu"
            )
        if not val_dir.exists() or not any(val_dir.iterdir()):
            raise RuntimeError("Folder split/val kosong — jalankan ulang 'Split Dataset'")

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        train_dataset = ImageFolder(str(train_dir), transform=TRAIN_TRANSFORM)
        val_dataset = ImageFolder(str(val_dir), transform=EVAL_TRANSFORM)
        if len(train_dataset.classes) < 2:
            raise RuntimeError("Minimal 2 label dibutuhkan untuk training klasifikasi")
        if len(train_dataset) == 0 or len(val_dataset) == 0:
            raise RuntimeError("Tidak cukup gambar di split/train atau split/val untuk training")

        batch_size = max(1, int(config.get("batch_size", 32)))
        train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
        val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

        num_classes = len(train_dataset.classes)
        model = _build_model(
            config.get("backbone", "resnet18"), num_classes, bool(config.get("freeze_backbone", True))
        )
        model.to(device)

        criterion = nn.CrossEntropyLoss()
        trainable_params = [p for p in model.parameters() if p.requires_grad]
        optimizer = torch.optim.Adam(trainable_params, lr=float(config.get("learning_rate", 0.001)))

        total_epochs = max(1, int(config.get("epochs", 15)))
        job.status = "running"
        job.total_epochs = total_epochs

        best_val_acc = -1.0
        best_state: dict | None = None
        stopped_early = False

        for epoch in range(1, total_epochs + 1):
            if job._stop_event.is_set():
                stopped_early = True
                break

            model.train()
            running_loss = 0.0
            batches = 0
            for images, labels in train_loader:
                if job._stop_event.is_set():
                    stopped_early = True
                    break
                images, labels = images.to(device), labels.to(device)
                optimizer.zero_grad()
                outputs = model(images)
                loss = criterion(outputs, labels)
                loss.backward()
                optimizer.step()
                running_loss += loss.item()
                batches += 1

            if stopped_early:
                # dibatalkan di tengah epoch ini — buang progress epoch yang
                # belum selesai, tapi checkpoint terbaik dari epoch SEBELUMNYA
                # (kalau ada) tetap disimpan di bawah
                break

            avg_loss = running_loss / batches if batches else 0.0
            metrics = _evaluate(model, val_loader, device, num_classes)

            if metrics["accuracy"] >= best_val_acc:
                best_val_acc = metrics["accuracy"]
                best_state = {
                    "model_state": model.state_dict(),
                    "class_names": train_dataset.classes,
                    "backbone": config.get("backbone", "resnet18"),
                }

            job.epoch = epoch
            job.history.append(
                {
                    "epoch": epoch,
                    "loss": round(avg_loss, 4),
                    "accuracy": round(metrics["accuracy"], 4),
                    "precision": round(metrics["precision"], 4),
                    "recall": round(metrics["recall"], 4),
                    "f1": round(metrics["f1"], 4),
                }
            )

        if best_state is not None:
            model_dir = project_dir / "model"
            model_dir.mkdir(parents=True, exist_ok=True)
            torch.save(best_state, model_dir / "best_model.pt")

        job.status = "stopped" if stopped_early else "finished"
    except Exception as e:  # noqa: BLE001 — laporkan ke UI, jangan sampai thread crash diam-diam
        job.status = "error"
        job.error = str(e)


def start_training(project_id: str, project_dir: Path, config: dict) -> tuple[bool, str | None]:
    """Mulai training sungguhan (pakai config & data penuh) di background
    thread. Return (False, "already_running") kalau job masih berjalan untuk
    project ini."""
    existing = _jobs.get(project_id)
    if existing is not None and existing.status == "running":
        return False, "already_running"

    job = TrainingJob()
    _jobs[project_id] = job
    thread = threading.Thread(target=_run_training, args=(job, project_dir, config), daemon=True)
    thread.start()
    return True, None


def stop_training(project_id: str) -> bool:
    job = _jobs.get(project_id)
    if job is None or job.status != "running":
        return False
    job._stop_event.set()
    return True


def evaluate_test_set(project_dir: Path) -> dict:
    """Evaluasi best_model.pt terhadap split/test — gambar yang TIDAK PERNAH
    dilihat selama training maupun pemilihan checkpoint terbaik (beda dari
    split/val yang ikut menentukan checkpoint mana yang disimpan). Ini ukuran
    performa paling jujur yang tersedia untuk model tersimpan saat ini."""
    checkpoint_path = project_dir / "model" / "best_model.pt"
    if not checkpoint_path.exists():
        raise RuntimeError("Belum ada model tersimpan — jalankan training dulu sampai minimal 1 epoch selesai")

    test_dir = project_dir / "split" / "test"
    if not test_dir.exists() or not any(test_dir.iterdir()):
        raise RuntimeError("Folder split/test kosong — jalankan 'Split Dataset' dulu")

    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    class_names = checkpoint["class_names"]
    backbone = checkpoint.get("backbone", "resnet18")

    test_dataset = ImageFolder(str(test_dir), transform=EVAL_TRANSFORM)
    if test_dataset.classes != class_names:
        raise RuntimeError(
            "Label di split/test tidak cocok dengan model tersimpan — jalankan ulang Split Dataset & training"
        )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = _build_model(backbone, len(class_names), freeze_backbone=True)
    model.load_state_dict(checkpoint["model_state"])
    model.to(device)

    test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False)
    metrics = _evaluate(model, test_loader, device, len(class_names))

    return {
        "num_images": len(test_dataset),
        "class_names": class_names,
        "accuracy": round(metrics["accuracy"], 4),
        "precision": round(metrics["precision"], 4),
        "recall": round(metrics["recall"], 4),
        "f1": round(metrics["f1"], 4),
    }
