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
        self.load_errors: dict[str, str] = {}

    async def load_repository(self) -> MemoryRepository:
        rows: dict[str, list[dict[str, Any]]] = {}
        self.load_errors = {}
        for table in TABLES:
            rows[table.name] = await self._load_table_rows(table.name, table.field_names)
        return MemoryRepository(rows)

    async def _load_table_rows(self, table_name: str, field_names: list[str]) -> list[dict[str, Any]]:
        columns = unique_columns(["id", *field_names, "created_at", "updated_at"])
        column_sql = ", ".join(columns)
        attempts = (
            f"SELECT {column_sql} FROM {table_name} ORDER BY id DESC LIMIT 1000",
            f"SELECT {column_sql} FROM {table_name} LIMIT 1000",
            f"SELECT * FROM {table_name} ORDER BY id DESC LIMIT 1000",
            f"SELECT * FROM {table_name} LIMIT 1000",
        )
        last_error = ""
        for sql in attempts:
            try:
                result = await self.db.prepare(sql).all()
                rows = normalize_d1_results(result, columns)
                self.load_errors.pop(table_name, None)
                return rows
            except Exception as error:
                last_error = str(error)
        self.load_errors[table_name] = last_error or "unknown D1 load error"
        return []

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


def normalize_d1_results(result: Any, columns: list[str] | None = None) -> list[dict[str, Any]]:
    if result is None:
        return []
    if isinstance(result, dict):
        data = result.get("results", [])
    else:
        data = getattr(result, "results", [])
    rows: list[dict[str, Any]] = []
    for row in data or []:
        try:
            rows.append(dict(row))
            continue
        except Exception:
            pass
        if columns:
            rows.append({column: d1_value(row, column) for column in columns})
    return rows


def unique_columns(columns: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for column in columns:
        if column and column not in seen:
            seen.add(column)
            result.append(column)
    return result


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
