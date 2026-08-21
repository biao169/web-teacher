from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from app.core.models import TABLES, TABLE_MAP, Field, Table
from app.core.repository import Query


class SQLiteRepository:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.ensure_schema()

    def close(self) -> None:
        with self.lock:
            self.conn.close()

    def table_names(self) -> list[str]:
        return [table.name for table in TABLES]

    def ensure_schema(self) -> None:
        with self.lock:
            for table in TABLES:
                columns = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
                for field in table.fields:
                    if field.name == "id":
                        continue
                    columns.append(f"{field.name} {sql_type(field)}")
                columns.extend(["created_at TEXT DEFAULT CURRENT_TIMESTAMP", "updated_at TEXT DEFAULT CURRENT_TIMESTAMP"])
                self.conn.execute(f"CREATE TABLE IF NOT EXISTS {table.name} ({', '.join(columns)})")
                existing = {row["name"] for row in self.conn.execute(f"PRAGMA table_info({table.name})")}
                for field in table.fields:
                    if field.name not in existing:
                        self.conn.execute(f"ALTER TABLE {table.name} ADD COLUMN {field.name} {sql_type(field)}")
                if "updated_at" not in existing:
                    self.conn.execute(f"ALTER TABLE {table.name} ADD COLUMN updated_at TEXT")
                if table.name == "global_settings":
                    self.conn.execute("UPDATE global_settings SET media_trash_retention_days = 30 WHERE media_trash_retention_days IS NULL OR media_trash_retention_days = ''")
                if table.name == "media_assets":
                    self.conn.execute("UPDATE media_assets SET status = 'active' WHERE status IS NULL OR status = ''")
            self.conn.commit()

    def list(self, table: str, query: Query | None = None) -> list[dict[str, Any]]:
        meta = TABLE_MAP[table]
        query = query or Query()
        where: list[str] = []
        params: list[Any] = []
        if query.public_only and "visibility" in meta.field_names:
            where.append("COALESCE(visibility, 'public') = 'public'")
        if query.filters:
            for key, value in query.filters.items():
                if key in meta.field_names and value not in (None, ""):
                    where.append(f"CAST({key} AS TEXT) = ?")
                    params.append(str(value))
        if query.q:
            search = meta.search_fields or meta.field_names
            like_parts = [f"COALESCE(CAST({field} AS TEXT), '') LIKE ?" for field in search]
            where.append("(" + " OR ".join(like_parts) + ")")
            params.extend([f"%{query.q}%"] * len(search))
        order = safe_order(meta, query.order_by)
        direction = "DESC" if query.descending else "ASC"
        limit = max(1, min(int(query.limit), 1000))
        sql = f"SELECT * FROM {table}"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += f" ORDER BY {order} {direction}, id DESC LIMIT ?"
        params.append(limit)
        with self.lock:
            return [dict(row) for row in self.conn.execute(sql, params)]

    def get(self, table: str, uid_or_id: str) -> dict[str, Any] | None:
        meta = TABLE_MAP[table]
        clauses = ["CAST(id AS TEXT) = ?"]
        params: list[Any] = [str(uid_or_id)]
        if "uid" in meta.field_names:
            clauses.append("uid = ?")
            params.append(uid_or_id)
        if "slug" in meta.field_names:
            clauses.append("slug = ?")
            params.append(uid_or_id)
        with self.lock:
            row = self.conn.execute(f"SELECT * FROM {table} WHERE {' OR '.join(clauses)} LIMIT 1", params).fetchone()
        return dict(row) if row else None

    def save(self, table: str, data: dict[str, Any]) -> dict[str, Any]:
        meta = TABLE_MAP[table]
        data = {key: value for key, value in data.items() if key in meta.field_names}
        if not data.get("uid"):
            raise ValueError("save requires a uid")
        existing = self.get(table, str(data["uid"]))
        now = time.strftime("%Y-%m-%d %H:%M:%S")
        with self.lock:
            if existing:
                names = list(data)
                sets = ", ".join(f"{name} = ?" for name in names)
                self.conn.execute(f"UPDATE {table} SET {sets}, updated_at = ? WHERE id = ?", [data[name] for name in names] + [now, existing["id"]])
            else:
                names = list(data)
                placeholders = ", ".join("?" for _ in names)
                self.conn.execute(f"INSERT INTO {table} ({', '.join(names)}) VALUES ({placeholders})", [data[name] for name in names])
            self.conn.commit()
        return self.get(table, str(data["uid"])) or data

    def delete(self, table: str, uid_or_id: str) -> bool:
        row = self.get(table, uid_or_id)
        if not row:
            return False
        with self.lock:
            self.conn.execute(f"DELETE FROM {table} WHERE id = ?", [row["id"]])
            self.conn.commit()
        return True

    def counts(self) -> dict[str, int]:
        with self.lock:
            return {table.name: int(self.conn.execute(f"SELECT COUNT(*) FROM {table.name}").fetchone()[0]) for table in TABLES}


def sql_type(field: Field) -> str:
    if field.kind in {"number", "bool"}:
        return "INTEGER"
    return "TEXT"


def safe_order(meta: Table, requested: str) -> str:
    if requested in meta.field_names or requested in {"id", "created_at", "updated_at"}:
        return requested
    if "sort_order" in meta.field_names:
        return "sort_order"
    return "id"
