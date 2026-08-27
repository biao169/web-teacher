from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .models import TABLES, TABLE_MAP, Table, int_value, public_filter


MAX_QUERY_LIMIT = 100000


@dataclass
class Query:
    q: str = ""
    filters: dict[str, Any] | None = None
    token_filters: dict[str, Any] | None = None
    prefix_filters: dict[str, Any] | None = None
    public_only: bool = False
    visibility_scopes: tuple[str, ...] | None = None
    limit: int = 300
    offset: int = 0
    order_by: str = "sort_order"
    descending: bool = False


class Repository(Protocol):
    def list(self, table: str, query: Query | None = None) -> list[dict[str, Any]]: ...

    def count(self, table: str, query: Query | None = None) -> int: ...

    def distinct_values(self, table: str, field: str, query: Query | None = None, limit: int = 120) -> list[str]: ...

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
        query = query or Query()
        rows = self._matching_rows(table, query)
        rows.sort(key=lambda row: _sort_key(row, query.order_by), reverse=query.descending)
        limit = max(1, min(int(query.limit), MAX_QUERY_LIMIT))
        offset = max(0, int(query.offset or 0))
        return rows[offset:offset + limit]

    def count(self, table: str, query: Query | None = None) -> int:
        return len(self._matching_rows(table, query or Query()))

    def distinct_values(self, table: str, field: str, query: Query | None = None, limit: int = 120) -> list[str]:
        meta = TABLE_MAP[table]
        if field not in meta.field_names:
            return []
        values = {str(row.get(field) or "").strip() for row in self._matching_rows(table, query or Query())}
        values.discard("")
        return sorted(values)[: max(1, min(int(limit), 500))]

    def _matching_rows(self, table: str, query: Query) -> list[dict[str, Any]]:
        meta = TABLE_MAP[table]
        rows = list(self.rows.get(table, []))
        if query.public_only:
            rows = [row for row in rows if public_filter(row)]
        if query.visibility_scopes and "visibility" in meta.field_names:
            scopes = {str(item) for item in query.visibility_scopes if str(item)}
            rows = [row for row in rows if str(row.get("visibility") or "public") in scopes]
        if query.filters:
            for key, value in query.filters.items():
                if key in meta.field_names and value not in (None, ""):
                    rows = [row for row in rows if str(row.get(key, "")) == str(value)]
        if query.token_filters:
            for key, value in query.token_filters.items():
                if key in meta.field_names and value not in (None, ""):
                    needle = str(value).strip()
                    rows = [row for row in rows if needle in _split_filter_tokens(row.get(key))]
        if query.prefix_filters:
            for key, value in query.prefix_filters.items():
                if key in meta.field_names and value not in (None, ""):
                    prefix = str(value)
                    if prefix.startswith("*-") and len(prefix) == 4:
                        rows = [row for row in rows if len(str(row.get(key, ""))) >= 7 and str(row.get(key, ""))[5:7] == prefix[2:4]]
                    else:
                        rows = [row for row in rows if str(row.get(key, "")).startswith(prefix)]
        if query.q:
            needle = query.q.casefold()
            search_fields = meta.search_fields or meta.field_names
            rows = [row for row in rows if any(needle in str(row.get(field, "")).casefold() for field in search_fields)]
        return rows

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
                _invalidate_filter_distinct_cache()
                return dict(merged)
        next_id = 1 + max([int_value(row.get("id")) for row in rows] or [0])
        created = {"id": next_id, **data}
        rows.append(created)
        _invalidate_filter_distinct_cache()
        return dict(created)

    def delete(self, table: str, uid_or_id: str) -> bool:
        rows = self.rows.get(table, [])
        before = len(rows)
        self.rows[table] = [row for row in rows if str(row.get("uid")) != str(uid_or_id) and str(row.get("id")) != str(uid_or_id)]
        changed = len(self.rows[table]) != before
        if changed:
            _invalidate_filter_distinct_cache()
        return changed

    def counts(self) -> dict[str, int]:
        return {table: len(rows) for table, rows in self.rows.items()}


def _sort_key(row: dict[str, Any], order_by: str) -> tuple[int, str]:
    if order_by in row:
        return (int_value(row.get(order_by), 999999), str(row.get("title") or row.get("name") or row.get("uid") or ""))
    return (int_value(row.get("sort_order"), 999999), str(row.get("title") or row.get("name") or row.get("uid") or ""))


def _split_filter_tokens(value: Any) -> list[str]:
    text = str(value or "")
    for sep in ("；", "，", ",", "|", "、"):
        text = text.replace(sep, ";")
    return [item.strip() for item in text.split(";") if item.strip()]



def _invalidate_filter_distinct_cache() -> None:
    try:
        Path(".cache/filter_distinct.json").unlink(missing_ok=True)
    except OSError:
        return
