from __future__ import annotations

import json
import zipfile
from pathlib import Path
from typing import Any

from .models import TABLES
from .repository import Repository


def import_bundle(repo: Repository, source: str | Path) -> dict[str, int]:
    source_path = Path(source)
    if source_path.suffix.lower() == ".json":
        payload = json.loads(source_path.read_text(encoding="utf-8"))
        tables = payload.get("tables", payload)
        return import_tables(repo, tables)
    with zipfile.ZipFile(source_path, "r") as archive:
        tables: dict[str, list[dict[str, Any]]] = {}
        for table in TABLES:
            name = f"content/{table.name}.json"
            if name in archive.namelist():
                tables[table.name] = json.loads(archive.read(name).decode("utf-8"))
    return import_tables(repo, tables)


def import_tables(repo: Repository, tables: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    imported: dict[str, int] = {}
    for table in TABLES:
        count = 0
        for row in tables.get(table.name, []):
            if row.get("uid"):
                repo.save(table.name, row)
                count += 1
        imported[table.name] = count
    return imported

