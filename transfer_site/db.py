from __future__ import annotations

import os
import sqlite3
import time
from pathlib import Path
from typing import Any

from app.core.security import stable_uid


DEFAULT_CONTROL: dict[str, Any] = {
    "uid": "transfer-control",
    "enabled": 1,
    "shutdown_policy": "graceful",
    "lan_acceleration_enabled": 1,
    "relay_enabled": 1,
    "cloud_relay_enabled": 0,
    "lan_only": 0,
    "auto_fallback_enabled": 1,
    "temp_storage_enabled": 1,
    "temp_storage_mode": "local",
    "temp_expire_follow_code": 1,
    "temp_expire_minutes": 60,
    "code_expire_minutes": 30,
    "max_bandwidth_kbps": 0,
    "max_bandwidth_per_session_kbps": 0,
    "max_bandwidth_per_user_kbps": 0,
    "daily_traffic_quota_gb": 0,
    "weekly_traffic_quota_gb": 0,
    "monthly_traffic_quota_gb": 0,
    "yearly_traffic_quota_gb": 0,
    "daily_traffic_quota_per_user_gb": 0,
    "weekly_traffic_quota_per_user_gb": 0,
    "monthly_traffic_quota_per_user_gb": 0,
    "yearly_traffic_quota_per_user_gb": 0,
    "disk_monitor_enabled": 1,
    "min_free_disk_gb": 10,
    "min_free_disk_percent": 10,
    "local_temp_total_quota_gb": 50,
    "local_temp_per_session_quota_gb": 10,
    "cloud_temp_total_quota_gb": 0,
    "cloud_temp_per_session_quota_gb": 0,
    "warning_threshold_percent": 80,
    "critical_threshold_percent": 95,
    "quota_exceeded_policy": "block_new",
    "disk_pressure_policy": "block_temp_storage",
    "allow_anonymous_by_code": 1,
    "allow_authenticated_without_permission": 0,
    "require_login": 1,
    "require_receiver_confirm": 1,
    "server_buffer_mb": 32,
    "admin_can_pause_session": 1,
    "admin_can_stop_session": 1,
    "admin_can_force_cleanup": 1,
    "admin_can_disable_feature_remotely": 1,
    "show_frontend_warnings": 1,
    "notify_admin_on_quota_warning": 1,
    "notify_admin_on_disk_warning": 1,
}


CONTROL_COLUMNS = {
    "uid": "TEXT UNIQUE",
    "enabled": "INTEGER",
    "shutdown_policy": "TEXT",
    "lan_acceleration_enabled": "INTEGER",
    "relay_enabled": "INTEGER",
    "cloud_relay_enabled": "INTEGER",
    "lan_only": "INTEGER",
    "auto_fallback_enabled": "INTEGER",
    "temp_storage_enabled": "INTEGER",
    "temp_storage_mode": "TEXT",
    "temp_expire_follow_code": "INTEGER",
    "temp_expire_minutes": "INTEGER",
    "code_expire_minutes": "INTEGER",
    "max_bandwidth_kbps": "INTEGER",
    "max_bandwidth_per_session_kbps": "INTEGER",
    "max_bandwidth_per_user_kbps": "INTEGER",
    "daily_traffic_quota_gb": "INTEGER",
    "weekly_traffic_quota_gb": "INTEGER",
    "monthly_traffic_quota_gb": "INTEGER",
    "yearly_traffic_quota_gb": "INTEGER",
    "daily_traffic_quota_per_user_gb": "INTEGER",
    "weekly_traffic_quota_per_user_gb": "INTEGER",
    "monthly_traffic_quota_per_user_gb": "INTEGER",
    "yearly_traffic_quota_per_user_gb": "INTEGER",
    "disk_monitor_enabled": "INTEGER",
    "min_free_disk_gb": "INTEGER",
    "min_free_disk_percent": "INTEGER",
    "local_temp_total_quota_gb": "INTEGER",
    "local_temp_per_session_quota_gb": "INTEGER",
    "cloud_temp_total_quota_gb": "INTEGER",
    "cloud_temp_per_session_quota_gb": "INTEGER",
    "warning_threshold_percent": "INTEGER",
    "critical_threshold_percent": "INTEGER",
    "quota_exceeded_policy": "TEXT",
    "disk_pressure_policy": "TEXT",
    "allow_anonymous_by_code": "INTEGER",
    "allow_authenticated_without_permission": "INTEGER",
    "require_login": "INTEGER",
    "require_receiver_confirm": "INTEGER",
    "server_buffer_mb": "INTEGER",
    "admin_can_pause_session": "INTEGER",
    "admin_can_stop_session": "INTEGER",
    "admin_can_force_cleanup": "INTEGER",
    "admin_can_disable_feature_remotely": "INTEGER",
    "show_frontend_warnings": "INTEGER",
    "notify_admin_on_quota_warning": "INTEGER",
    "notify_admin_on_disk_warning": "INTEGER",
}


def sqlite_connection(repo: Any) -> sqlite3.Connection:
    conn = getattr(repo, "conn", None)
    if not isinstance(conn, sqlite3.Connection):
        raise RuntimeError("The transfer tool currently supports only the local SQLite/Ubuntu runtime.")
    return conn


def repo_lock(repo: Any):
    return getattr(repo, "lock", None)


def ensure_schema(repo: Any) -> None:
    conn = sqlite_connection(repo)
    lock = repo_lock(repo)
    if lock:
        with lock:
            _ensure_schema(conn)
    else:
        _ensure_schema(conn)


def _ensure_schema(conn: sqlite3.Connection) -> None:
    control_cols = ", ".join(["id INTEGER PRIMARY KEY AUTOINCREMENT", *[f"{name} {kind}" for name, kind in CONTROL_COLUMNS.items()], "created_at TEXT DEFAULT CURRENT_TIMESTAMP", "updated_at TEXT DEFAULT CURRENT_TIMESTAMP"])
    conn.execute(f"CREATE TABLE IF NOT EXISTS transfer_control ({control_cols})")
    ensure_columns(conn, "transfer_control", CONTROL_COLUMNS | {"created_at": "TEXT", "updated_at": "TEXT"})

    conn.execute(
        """CREATE TABLE IF NOT EXISTS transfer_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        room_id TEXT UNIQUE NOT NULL,
        access_code TEXT,
        created_by TEXT,
        status TEXT,
        requested_mode TEXT,
        effective_mode TEXT,
        sender_ip TEXT,
        receiver_ip TEXT,
        total_bytes INTEGER DEFAULT 0,
        transferred_bytes INTEGER DEFAULT 0,
        traffic_counted_bytes INTEGER DEFAULT 0,
        access_failures INTEGER DEFAULT 0,
        access_locked_until TEXT,
        expires_at TEXT,
        code_expires_at TEXT,
        stopped_by TEXT,
        stop_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    ensure_columns(conn, "transfer_sessions", {"access_failures": "INTEGER DEFAULT 0", "access_locked_until": "TEXT"})
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transfer_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        session_uid TEXT NOT NULL,
        object_type TEXT,
        relative_path TEXT,
        display_name TEXT,
        size_bytes INTEGER DEFAULT 0,
        checksum TEXT,
        status TEXT,
        transferred_bytes INTEGER DEFAULT 0,
        storage_backend TEXT,
        temp_key TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transfer_temp_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        session_uid TEXT NOT NULL,
        object_uid TEXT NOT NULL,
        storage_backend TEXT,
        temp_key TEXT,
        size_bytes INTEGER DEFAULT 0,
        checksum TEXT,
        status TEXT,
        owner_user TEXT,
        expires_at TEXT,
        deleted_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transfer_usage_periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        period_type TEXT,
        period_start TEXT,
        period_end TEXT,
        user_uid TEXT,
        total_bytes INTEGER DEFAULT 0,
        relay_bytes INTEGER DEFAULT 0,
        cloud_relay_bytes INTEGER DEFAULT 0,
        local_temp_bytes INTEGER DEFAULT 0,
        cloud_temp_bytes INTEGER DEFAULT 0,
        direct_estimated_bytes INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transfer_resource_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        active_sessions INTEGER DEFAULT 0,
        total_upload_kbps INTEGER DEFAULT 0,
        total_download_kbps INTEGER DEFAULT 0,
        free_disk_bytes INTEGER DEFAULT 0,
        free_disk_percent INTEGER DEFAULT 0,
        local_temp_used_bytes INTEGER DEFAULT 0,
        cloud_temp_used_bytes INTEGER DEFAULT 0,
        daily_traffic_bytes INTEGER DEFAULT 0,
        weekly_traffic_bytes INTEGER DEFAULT 0,
        monthly_traffic_bytes INTEGER DEFAULT 0,
        yearly_traffic_bytes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transfer_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        actor_uid TEXT,
        action TEXT,
        session_uid TEXT,
        object_uid TEXT,
        ip_address TEXT,
        message TEXT,
        metadata_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS transfer_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT UNIQUE NOT NULL,
        room_id TEXT NOT NULL,
        sender_uid TEXT,
        signal_type TEXT,
        payload_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_transfer_sessions_room ON transfer_sessions(room_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_transfer_objects_session ON transfer_objects(session_uid)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_transfer_temp_expires ON transfer_temp_objects(expires_at, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_transfer_usage_period ON transfer_usage_periods(period_type, period_start, user_uid)")
    seed_defaults(conn)
    conn.commit()


def ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, kind in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {kind}")


def seed_defaults(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT id FROM transfer_control WHERE uid = ?", [DEFAULT_CONTROL["uid"]]).fetchone()
    if not row:
        names = list(DEFAULT_CONTROL)
        values = [DEFAULT_CONTROL[name] for name in names]
        conn.execute(f"INSERT INTO transfer_control ({', '.join(names)}) VALUES ({', '.join('?' for _ in names)})", values)

    conn.execute(
        """INSERT OR IGNORE INTO navigation_items
        (uid, title, title_en, kind, url_name, path, fragment, icon, style, location, visibility, enabled, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        ("nav-transfer-site", "文件传输", "File Transfer", "route", "transfer", "/transfer", "", "send", "link", "header", "authenticated", 1, 95),
    )
    conn.execute(
        """INSERT OR IGNORE INTO navigation_items
        (uid, title, title_en, kind, url_name, path, fragment, icon, style, location, visibility, enabled, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        ("nav-admin-transfer-site", "文件传输控制", "Transfer Control", "route", "admin-transfer", "/admin/transfer", "", "upload-cloud", "link", "admin_sidebar", "staff", 1, 95),
    )

    permission_defaults = {
        "role-super-admin": (1, 1, 1, 1, 1, 90),
        "role-admin": (1, 1, 1, 1, 0, 90),
        "role-staff": (1, 1, 0, 0, 0, 90),
        "role-visitor": (0, 0, 0, 0, 0, 90),
    }
    for role_uid, flags in permission_defaults.items():
        uid = stable_uid("perm", f"{role_uid}:transfer_site")
        conn.execute(
            """INSERT OR IGNORE INTO auth_permissions
            (uid, role_uid, module, can_view, can_create, can_edit, can_delete, can_export, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (uid, role_uid, "transfer_site", *flags),
        )


def connection_context(repo: Any):
    conn = sqlite_connection(repo)
    lock = repo_lock(repo)
    return conn, lock


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def temp_root(env: dict[str, str]) -> Path:
    configured = str(env.get("TEACHER_SITE_TRANSFER_TMP") or os.environ.get("TEACHER_SITE_TRANSFER_TMP") or "").strip()
    root = Path(configured) if configured else Path("var") / "transfer_site" / "tmp"
    root.mkdir(parents=True, exist_ok=True)
    return root


def cloud_root(env: dict[str, str]) -> Path | None:
    configured = str(env.get("TEACHER_SITE_TRANSFER_CLOUD_DIR") or os.environ.get("TEACHER_SITE_TRANSFER_CLOUD_DIR") or "").strip()
    if not configured:
        return None
    root = Path(configured)
    root.mkdir(parents=True, exist_ok=True)
    return root

