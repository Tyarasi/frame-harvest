import re
import shutil
import uuid
from pathlib import Path

import yaml

from services.stage_resolver import can_add_stage


def _default_stages(dataset_target: str) -> list[dict]:
    """Checklist tahap BBox/Crop bawaan tiap project baru — SAMA PERSIS
    dengan alur resep lama (resnet: bbox->crop, yolo: bbox saja) supaya
    nambah fitur ini tidak mengubah perilaku project yang sudah ada sama
    sekali. Id 'root'/'crops' literal (bukan uuid) SENGAJA — lihat catatan
    di stage_resolver.py soal kenapa tahap crop pertama harus id="crops"."""
    if dataset_target == "yolo":
        return [{"id": "root", "type": "bbox", "name": "Frame & BBox"}]
    return [
        {"id": "root", "type": "bbox", "name": "Frame & BBox Person"},
        {"id": "crops", "type": "crop", "name": "Crop Object"},
    ]


class ProjectManager:
    """Kelola daftar project (dataset terpisah) — tiap project punya folder
    sendiri projects/<id>/ berisi sample/ (raw capture) dan dataset/ (hasil
    assign label) sendiri-sendiri, saling terisolasi. Kamera (cameras.yaml)
    TETAP global/shared lintas project — kamera itu resource fisik, bukan
    data project."""

    def __init__(self, projects_dir: Path, registry_path: Path):
        self.projects_dir = projects_dir
        self.registry_path = registry_path
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def _load(self) -> list[dict]:
        if not self.registry_path.exists():
            return []
        with open(self.registry_path) as f:
            data = yaml.safe_load(f) or {}
        projects = data.get("projects", [])
        # project lama (dibuat sebelum field ini ada) belum punya dataset_target
        # di projects.yaml — isi default "resnet" biar frontend tidak dapat
        # undefined, TANPA menulis ulang file (cuma dilengkapi saat dibaca)
        for p in projects:
            p.setdefault("dataset_target", "resnet")
            # project lama (dibuat sebelum fitur tahap general ini ada) belum
            # punya "stages" di projects.yaml — isi checklist bawaan yang
            # merepresentasikan PERSIS alur lama, tanpa menyentuh file di
            # disk sama sekali (murni field baru yang dilengkapi saat baca)
            p.setdefault("stages", _default_stages(p["dataset_target"]))
        return projects

    def _save(self, projects: list[dict]) -> None:
        with open(self.registry_path, "w") as f:
            yaml.safe_dump({"projects": projects}, f, allow_unicode=True, sort_keys=False)

    def list_projects(self) -> list[dict]:
        return self._load()

    def exists(self, project_id: str) -> bool:
        return any(p["id"] == project_id for p in self._load())

    def add_project(self, name: str, dataset_target: str = "resnet") -> dict:
        """`dataset_target` menentukan "resep" persiapan dataset yang dipakai
        project ini (lihat recipes.ts di frontend) — mis. resnet: BBox->Crop->
        Label->Split, nanti yolo: BBox->Split langsung. Sengaja TIDAK ada
        endpoint untuk mengubahnya setelah dibuat: sama seperti id project,
        nilai ini dikunci dari awal supaya tidak ada project yang navigasi
        alurnya berubah di tengah jalan setelah sudah mulai punya data."""
        name = name.strip()
        projects = self._load()
        base_id = self._slugify(name)
        project_id = base_id
        existing_ids = {p["id"] for p in projects}
        n = 2
        while project_id in existing_ids:
            project_id = f"{base_id}-{n}"
            n += 1

        project = {
            "id": project_id,
            "name": name,
            "dataset_target": dataset_target,
            "stages": _default_stages(dataset_target),
        }
        projects.append(project)
        self._save(projects)
        self.project_dir(project_id).mkdir(parents=True, exist_ok=True)
        return project

    def get_project(self, project_id: str) -> dict | None:
        return next((p for p in self._load() if p["id"] == project_id), None)

    def rename_project(self, project_id: str, new_name: str) -> dict | None:
        """Ganti nama tampilan project — id/folder-nya TIDAK ikut berubah
        (menghindari perlu migrasi/pindah folder cuma karena ganti nama)."""
        new_name = new_name.strip()
        projects = self._load()
        for project in projects:
            if project["id"] == project_id:
                project["name"] = new_name
                self._save(projects)
                return project
        return None

    def delete_project(self, project_id: str) -> bool:
        projects = self._load()
        remaining = [p for p in projects if p["id"] != project_id]
        if len(remaining) == len(projects):
            return False
        self._save(remaining)
        target = self.projects_dir / project_id
        if target.exists():
            shutil.rmtree(target)
        return True

    def add_stage(self, project_id: str, stage_type: str, name: str) -> dict:
        """Tambah 1 tahap BBox/Crop ke akhir checklist project — BOLEH kapan
        saja selama project sudah jalan (beda dari dataset_target yang
        dikunci dari awal), karena kebutuhan crop-berlapis (mis. deteksi
        object DI DALAM crop object sebelumnya) sering baru ketahuan setelah
        lihat hasil tahap sebelumnya."""
        name = name.strip()
        if not name:
            raise ValueError("Nama tahap tidak boleh kosong")
        projects = self._load()
        for project in projects:
            if project["id"] == project_id:
                error = can_add_stage(project["stages"], stage_type)
                if error:
                    raise ValueError(error)
                stage = {"id": uuid.uuid4().hex[:8], "type": stage_type, "name": name}
                project["stages"].append(stage)
                self._save(projects)
                return project
        raise ValueError(f"Project '{project_id}' tidak ditemukan")

    def remove_last_stage(self, project_id: str) -> dict:
        """Hapus tahap TERAKHIR saja (bukan tahap sembarang di tengah — itu
        akan merusak rantai bbox->crop tahap setelahnya). Tidak boleh hapus
        sampai di bawah checklist bawaan (lihat _default_stages) — itu
        anggapan dasar yang dipakai Label/Split, bukan sekadar 1 tahap biasa.
        TIDAK menyentuh disk (folder/txt) — itu tanggung jawab pemanggil
        (router), karena butuh tahu path sample-nya, bukan cuma project."""
        projects = self._load()
        for project in projects:
            if project["id"] == project_id:
                minimum = 1 if project["dataset_target"] == "yolo" else 2
                if len(project["stages"]) <= minimum:
                    raise ValueError("Tidak bisa hapus tahap dasar (bawaan) project ini")
                project["stages"].pop()
                self._save(projects)
                return project
        raise ValueError(f"Project '{project_id}' tidak ditemukan")

    def project_dir(self, project_id: str) -> Path:
        return self.projects_dir / project_id

    @staticmethod
    def _slugify(name: str) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
        return slug or "project"


def migrate_legacy_data(project_manager: ProjectManager, base_dir: Path) -> None:
    """Migrasi satu kali: kalau belum ada project sama sekali TAPI folder
    sample/ atau dataset/ lama (struktur single-dataset sebelum multi-project)
    masih ada di root project, pindahkan jadi 1 project default supaya tidak
    ada data yang hilang."""
    legacy_sample = base_dir / "sample"
    legacy_dataset = base_dir / "dataset"
    if project_manager.list_projects():
        return
    if not legacy_sample.exists() and not legacy_dataset.exists():
        return

    project = project_manager.add_project("Karyawan Lanyard")
    target_dir = project_manager.project_dir(project["id"])

    if legacy_sample.exists():
        shutil.move(str(legacy_sample), str(target_dir / "sample"))
    if legacy_dataset.exists():
        shutil.move(str(legacy_dataset), str(target_dir / "dataset"))

    print(
        f"[migrasi] Data lama (sample/, dataset/) dipindah jadi project "
        f"'{project['name']}' ({project['id']})"
    )
