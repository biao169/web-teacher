from __future__ import annotations

import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from app.core.models import TABLES, TABLE_MAP, Field, Table
from app.core.repository import MAX_QUERY_LIMIT, Query


SQLITE_INDEXES = (
    ("idx_navigation_enabled_location_sort", "navigation_items", ('enabled', 'location', 'sort_order')),
    ("idx_navigation_kind_location", "navigation_items", ('kind', 'location')),
    ("idx_profiles_admin_sort", "profiles", ('is_active', 'is_featured', 'sort_order')),
    ("idx_profiles_role_title", "profiles", ('role', 'title', 'organization', 'lab')),
    ("idx_research_visibility_sort", "research_interests", ('visibility', 'sort_order')),
    ("idx_publications_admin_filters", "publications", ('visibility', 'year', 'publication_type', 'author_role', 'index_type')),
    ("idx_publications_venue_year", "publications", ('venue', 'year')),
    ("idx_publications_featured_year", "publications", ('is_featured', 'year')),
    ("idx_projects_admin_filters", "projects", ('visibility', 'status', 'source', 'is_featured', 'sort_order')),
    ("idx_projects_fund_sort", "projects", ('fund_name', 'sort_order')),
    ("idx_patents_admin_filters", "patents", ('visibility', 'patent_type', 'legal_status', 'is_featured', 'sort_order')),
    ("idx_patents_country_sort", "patents", ('country', 'sort_order')),
    ("idx_students_admin_filters", "students", ('visibility', 'degree', 'category', 'grade', 'status', 'sort_order')),
    ("idx_students_featured_sort", "students", ('is_featured', 'sort_order')),
    ("idx_student_category_enabled_order", "student_category_displays", ('enabled', 'display_order')),
    ("idx_news_admin_filters", "news", ('visibility', 'category', 'content_format', 'is_featured', 'published_at')),
    ("idx_news_slug", "news", ('slug',)),
    ("idx_courses_admin_filters", "courses", ('visibility', 'semester', 'audience', 'is_featured', 'sort_order')),
    ("idx_courses_material_visibility", "courses", ('material_visibility', 'sort_order')),
    ("idx_messages_admin_filters", "messages", ('visibility', 'message_type', 'status', 'updated_at')),
    ("idx_media_assets_storage_status", "media_assets", ('storage_kind', 'status', 'updated_at')),
    ("idx_media_assets_status_updated", "media_assets", ('status', 'updated_at')),
    ("idx_media_assets_status_mime", "media_assets", ('status', 'mime_type')),
    ("idx_media_assets_mime_status", "media_assets", ('mime_type', 'status')),
    ("idx_translation_cache_lookup", "translation_cache", ('source_ref_key', 'target_lang', 'is_current')),
    ("idx_translation_cache_status_updated", "translation_cache", ('status', 'updated_at')),
    ("idx_auth_roles_level", "auth_roles", ('is_active', 'level')),
    ("idx_auth_permissions_module", "auth_permissions", ('module', 'sort_order')),
)


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
            self.ensure_indexes()
            self.conn.commit()

    def ensure_indexes(self) -> None:
        existing_tables = {row["name"] for row in self.conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for name, table, columns in SQLITE_INDEXES:
            if table not in existing_tables:
                continue
            existing_columns = {row["name"] for row in self.conn.execute(f"PRAGMA table_info({table})")}
            if all(column in existing_columns for column in columns):
                column_sql = ", ".join(columns)
                self.conn.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {table}({column_sql})")

    def list(self, table: str, query: Query | None = None) -> list[dict[str, Any]]:
        meta = TABLE_MAP[table]
        query = query or Query()
        where, params = query_where(meta, query)
        order = safe_order(meta, query.order_by)
        direction = "DESC" if query.descending else "ASC"
        limit = max(1, min(int(query.limit), MAX_QUERY_LIMIT))
        offset = max(0, int(query.offset or 0))
        sql = f"SELECT * FROM {table}"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += f" ORDER BY {order} {direction}, id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        with self.lock:
            return [dict(row) for row in self.conn.execute(sql, params)]

    def count(self, table: str, query: Query | None = None) -> int:
        meta = TABLE_MAP[table]
        where, params = query_where(meta, query or Query())
        sql = f"SELECT COUNT(*) FROM {table}"
        if where:
            sql += " WHERE " + " AND ".join(where)
        with self.lock:
            return int(self.conn.execute(sql, params).fetchone()[0])

    def distinct_values(self, table: str, field: str, query: Query | None = None, limit: int = 120) -> list[str]:
        meta = TABLE_MAP[table]
        if field not in meta.field_names:
            return []
        where, params = query_where(meta, query or Query())
        max_items = max(1, min(int(limit), 500))
        sql = f"SELECT DISTINCT CAST({field} AS TEXT) AS value FROM {table}"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY value COLLATE NOCASE LIMIT ?"
        params.append(max_items)
        with self.lock:
            return [str(row["value"]).strip() for row in self.conn.execute(sql, params) if str(row["value"] or "").strip()]

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
        invalidate_filter_distinct_cache()
        return self.get(table, str(data["uid"])) or data

    def delete(self, table: str, uid_or_id: str) -> bool:
        row = self.get(table, uid_or_id)
        if not row:
            return False
        with self.lock:
            self.conn.execute(f"DELETE FROM {table} WHERE id = ?", [row["id"]])
            self.conn.commit()
        invalidate_filter_distinct_cache()
        return True

    def counts(self) -> dict[str, int]:
        with self.lock:
            return {table.name: int(self.conn.execute(f"SELECT COUNT(*) FROM {table.name}").fetchone()[0]) for table in TABLES}


def invalidate_filter_distinct_cache() -> None:
    try:
        Path(".cache/filter_distinct.json").unlink(missing_ok=True)
    except OSError:
        return


def query_where(meta: Table, query: Query) -> tuple[list[str], list[Any]]:
    where: list[str] = []
    params: list[Any] = []
    if query.public_only and "visibility" in meta.field_names:
        where.append("COALESCE(NULLIF(visibility, ''), 'public') = 'public'")
    if query.visibility_scopes and "visibility" in meta.field_names:
        scopes = [str(item) for item in query.visibility_scopes if str(item)]
        if scopes:
            placeholders = ", ".join("?" for _ in scopes)
            where.append(f"COALESCE(NULLIF(visibility, ''), 'public') IN ({placeholders})")
            params.extend(scopes)
    if query.filters:
        for key, value in query.filters.items():
            if key in meta.field_names and value not in (None, ""):
                where.append(f"CAST({key} AS TEXT) = ?")
                params.append(str(value))
    if query.token_filters:
        for key, value in query.token_filters.items():
            if key in meta.field_names and value not in (None, ""):
                where.append(token_filter_sql(key))
                params.append(f";{normalize_filter_token(value)};")
    if query.prefix_filters:
        for key, value in query.prefix_filters.items():
            if key in meta.field_names and value not in (None, ""):
                text_value = str(value)
                if text_value.startswith("*-") and len(text_value) == 4:
                    where.append(f"substr(CAST({key} AS TEXT), 6, 2) = ?")
                    params.append(text_value[2:4])
                else:
                    where.append(f"CAST({key} AS TEXT) LIKE ?")
                    params.append(f"{text_value}%")
    if query.q:
        search = meta.search_fields or meta.field_names
        like_parts = [f"COALESCE(CAST({field} AS TEXT), '') LIKE ?" for field in search]
        where.append("(" + " OR ".join(like_parts) + ")")
        params.extend([f"%{query.q}%"] * len(search))
    return where, params


def normalize_filter_token(value: Any) -> str:
    return str(value or "").strip().replace(" ", "").replace("\u3000", "")


def token_filter_sql(field: str) -> str:
    normalized = f"replace(replace(replace(replace(replace(replace(CAST({field} AS TEXT), '；', ';'), '，', ';'), ',', ';'), '|', ';'), '、', ';'), ' ', '')"
    return f"instr(';' || {normalized} || ';', ?) > 0"


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
