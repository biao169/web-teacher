from __future__ import annotations

from typing import Any

from app.core.models import TABLES, TABLE_MAP
from app.core.repository import MemoryRepository


class CloudflareD1Loader:
    """Small D1 bridge isolated from the shared app.

    Python Workers expose Cloudflare bindings through ``self.env``. The exact
    object is intentionally kept behind this loader so future Python Workers
    SDK changes do not affect rendering or schema code.
    """

    def __init__(self, db: Any):
        self.db = db

    async def load_repository(self) -> MemoryRepository:
        rows: dict[str, list[dict[str, Any]]] = {}
        for table in TABLES:
            try:
                result = await self.db.prepare(f"SELECT * FROM {table.name} ORDER BY id DESC LIMIT 1000").all()
                rows[table.name] = normalize_d1_results(result)
            except Exception:
                rows[table.name] = []
        return MemoryRepository(rows)

    async def save(self, table_name: str, data: dict[str, Any]) -> None:
        meta = TABLE_MAP[table_name]
        names = [name for name in meta.field_names if name in data]
        if not names:
            return
        existing = await self.db.prepare(f"SELECT id FROM {table_name} WHERE uid = ? LIMIT 1").bind(data.get("uid")).first()
        existing_id = d1_value(existing, "id") if existing else None
        auto_publication_sort = table_name in {"publications", "projects", "patents"} and not str(data.get("sort_order") or "").strip()
        if existing:
            if auto_publication_sort and existing_id is not None:
                data["sort_order"] = existing_id
            sets = ", ".join(f"{name} = ?" for name in names)
            await self.db.prepare(f"UPDATE {table_name} SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE uid = ?").bind(*[data[name] for name in names], data.get("uid")).run()
        else:
            placeholders = ", ".join("?" for _ in names)
            result = await self.db.prepare(f"INSERT INTO {table_name} ({', '.join(names)}) VALUES ({placeholders})").bind(*[data[name] for name in names]).run()
            if auto_publication_sort:
                row_id = d1_value(result, "lastRowId") or d1_value(result, "last_row_id") or d1_value(result, "meta.last_row_id")
                if row_id is None:
                    row = await self.db.prepare(f"SELECT id FROM {table_name} WHERE uid = ? LIMIT 1").bind(data.get("uid")).first()
                    row_id = d1_value(row, "id")
                if row_id is not None:
                    await self.db.prepare(f"UPDATE {table_name} SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?").bind(row_id, data.get("uid")).run()

    async def update(self, table_name: str, uid_or_id: str, data: dict[str, Any]) -> None:
        meta = TABLE_MAP[table_name]
        names = [name for name in meta.field_names if name in data and name not in {"uid", "id"}]
        if not names:
            return
        sets = ", ".join(f"{name} = ?" for name in names)
        await self.db.prepare(f"UPDATE {table_name} SET {sets}, updated_at = CURRENT_TIMESTAMP WHERE uid = ? OR CAST(id AS TEXT) = ?").bind(*[data[name] for name in names], uid_or_id, uid_or_id).run()

    async def delete(self, table_name: str, uid_or_id: str) -> None:
        await self.db.prepare(f"DELETE FROM {table_name} WHERE uid = ? OR CAST(id AS TEXT) = ?").bind(uid_or_id, uid_or_id).run()

    async def clear_expired_media_trash(self) -> None:
        days = 30
        try:
            setting = await self.db.prepare("SELECT media_trash_retention_days FROM global_settings ORDER BY id LIMIT 1").first()
            if isinstance(setting, dict):
                days = int(setting.get("media_trash_retention_days") or 30)
            elif setting is not None:
                days = int(getattr(setting, "media_trash_retention_days", 30) or 30)
        except Exception:
            days = 30
        days = max(1, days)
        await self.db.prepare("DELETE FROM media_assets WHERE status = 'trash' AND updated_at IS NOT NULL AND datetime(updated_at) < datetime('now', ?)").bind(f"-{days} days").run()

    async def clear_media_trash(self) -> None:
        await self.db.prepare("DELETE FROM media_assets WHERE status = 'trash'").run()


def normalize_d1_results(result: Any) -> list[dict[str, Any]]:
    if result is None:
        return []
    if isinstance(result, dict):
        data = result.get("results", [])
    else:
        data = getattr(result, "results", [])
    return [dict(row) for row in data]


def d1_value(obj: Any, key: str) -> Any:
    current = obj
    for part in key.split("."):
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
    return current
