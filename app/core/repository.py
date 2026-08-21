from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any, Protocol

from .models import TABLES, TABLE_MAP, Table, int_value, public_filter


@dataclass
class Query:
    q: str = ""
    filters: dict[str, Any] | None = None
    public_only: bool = False
    limit: int = 300
    order_by: str = "sort_order"
    descending: bool = False


class Repository(Protocol):
    def list(self, table: str, query: Query | None = None) -> list[dict[str, Any]]: ...

    def get(self, table: str, uid_or_id: str) -> dict[str, Any] | None: ...

    def save(self, table: str, data: dict[str, Any]) -> dict[str, Any]: ...

    def delete(self, table: str, uid_or_id: str) -> bool: ...

    def counts(self) -> dict[str, int]: ...

    def table_names(self) -> list[str]: ...


class MemoryRepository:
    def __init__(self, rows: dict[str, Iterable[dict[str, Any]]] | None = None):
        self.rows: dict[str, list[dict[str, Any]]] = {table.name: [] for table in TABLES}
        for table, table_rows in (rows or {}).items():
            self.rows[table] = [dict(row) for row in table_rows]

    def table_names(self) -> list[str]:
        return list(self.rows)

    def list(self, table: str, query: Query | None = None) -> list[dict[str, Any]]:
        meta = TABLE_MAP[table]
        query = query or Query()
        rows = list(self.rows.get(table, []))
        if query.public_only:
            rows = [row for row in rows if public_filter(row)]
        if query.filters:
            for key, value in query.filters.items():
                if value not in (None, ""):
                    rows = [row for row in rows if str(row.get(key, "")) == str(value)]
        if query.q:
            needle = query.q.casefold()
            search_fields = meta.search_fields or meta.field_names
            rows = [row for row in rows if any(needle in str(row.get(field, "")).casefold() for field in search_fields)]
        rows.sort(key=lambda row: _sort_key(row, query.order_by), reverse=query.descending)
        return rows[: max(1, min(query.limit, 1000))]

    def get(self, table: str, uid_or_id: str) -> dict[str, Any] | None:
        for row in self.rows.get(table, []):
            if str(row.get("uid")) == str(uid_or_id) or str(row.get("id")) == str(uid_or_id) or str(row.get("slug")) == str(uid_or_id):
                return dict(row)
        return None

    def save(self, table: str, data: dict[str, Any]) -> dict[str, Any]:
        rows = self.rows.setdefault(table, [])
        key = str(data.get("uid") or data.get("id") or "")
        if not key:
            raise ValueError("save requires uid or id")
        for index, row in enumerate(rows):
            if str(row.get("uid") or row.get("id")) == key:
                merged = {**row, **data}
                rows[index] = merged
                return dict(merged)
        next_id = 1 + max([int_value(row.get("id")) for row in rows] or [0])
        created = {"id": next_id, **data}
        rows.append(created)
        return dict(created)

    def delete(self, table: str, uid_or_id: str) -> bool:
        rows = self.rows.get(table, [])
        before = len(rows)
        self.rows[table] = [row for row in rows if str(row.get("uid")) != str(uid_or_id) and str(row.get("id")) != str(uid_or_id)]
        return len(self.rows[table]) != before

    def counts(self) -> dict[str, int]:
        return {table: len(rows) for table, rows in self.rows.items()}


def _sort_key(row: dict[str, Any], order_by: str) -> tuple[int, str]:
    if order_by in row:
        return (int_value(row.get(order_by), 999999), str(row.get("title") or row.get("name") or row.get("uid") or ""))
    return (int_value(row.get("sort_order"), 999999), str(row.get("title") or row.get("name") or row.get("uid") or ""))

