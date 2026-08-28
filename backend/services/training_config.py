import json
from pathlib import Path

DEFAULT_CONFIG = {
    "backbone": "resnet18",
    "epochs": 15,
    "batch_size": 32,
    "learning_rate": 0.001,
    "freeze_backbone": True,
}

CONFIG_FILENAME = "training_config.json"


def get_config(project_dir: Path) -> dict:
    config_path = project_dir / CONFIG_FILENAME
    if not config_path.exists():
        return DEFAULT_CONFIG.copy()
    with open(config_path) as f:
        saved = json.load(f)
    return {**DEFAULT_CONFIG, **saved}


def save_config(project_dir: Path, config: dict) -> dict:
    merged = {**DEFAULT_CONFIG, **config}
    project_dir.mkdir(parents=True, exist_ok=True)
    with open(project_dir / CONFIG_FILENAME, "w") as f:
        json.dump(merged, f, indent=2)
    return merged
