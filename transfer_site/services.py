from __future__ import annotations

import json
import os
import random
import re
import secrets
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app.core.models import int_value
from app.core.security import stable_uid, text_only

from .db import DEFAULT_CONTROL, cloud_root, connection_context, ensure_schema, now_text, temp_root


CHUNK_LIMIT = 8 * 1024 * 1024
ACCESS_CODE_DIGITS = "0123456789"
ACCESS_CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"
ACCESS_FAILURE_LIMIT = 5
ACCESS_LOCK_SECONDS = 10 * 60


def truthy(value: Any, default: bool = False) -> bool:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on", "y"}


def control(repo: Any) -> dict[str, Any]:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def read() -> dict[str, Any]:
        row = conn.execute("SELECT * FROM transfer_control WHERE uid = ?", [DEFAULT_CONTROL["uid"]]).fetchone()
        return {**DEFAULT_CONTROL, **dict(row or {})}
    if lock:
        with lock:
            return read()
    return read()


def save_control(repo: Any, data: dict[str, Any]) -> dict[str, Any]:
    ensure_schema(repo)
    allowed = set(DEFAULT_CONTROL) - {"uid"}
    cleaned: dict[str, Any] = {}
    for key in allowed:
        if key not in data:
            continue
        default = DEFAULT_CONTROL.get(key)
        if isinstance(default, int):
            cleaned[key] = int_value(data.get(key), default)
        else:
            cleaned[key] = text_only(data.get(key), 120)
    if not cleaned:
        return control(repo)
    names = list(cleaned)
    conn, lock = connection_context(repo)
    def write() -> None:
        conn.execute(
            f"UPDATE transfer_control SET {', '.join(f'{name} = ?' for name in names)}, updated_at = ? WHERE uid = ?",
            [cleaned[name] for name in names] + [now_text(), DEFAULT_CONTROL["uid"]],
        )
        conn.commit()
    if lock:
        with lock:
            write()
    else:
        write()
    return control(repo)


def access_code() -> str:
    digits = "".join(secrets.choice(ACCESS_CODE_DIGITS) for _ in range(4))
    letters = "".join(secrets.choice(ACCESS_CODE_LETTERS) for _ in range(2))
    return f"{digits}{letters}"


def normalize_access_code(value: Any) -> str:
    return text_only(value, 40).strip().upper().replace("-", "").replace(" ", "")


def room_id() -> str:
    return stable_uid("room", f"{time.time_ns()}-{random.random()}")[:18]


def safe_relative_path(path: str) -> str:
    clean = str(path or "").replace("\\", "/").strip().strip("/")
    clean = re.sub(r"/+", "/", clean)
    parts = []
    for part in clean.split("/"):
        part = part.strip()
        if not part:
            continue
        if part in {".", ".."} or ":" in part or "\x00" in part:
            raise ValueError("Unsafe file path.")
        parts.append(text_only(part, 180))
    if not parts:
        raise ValueError("File name is required.")
    return "/".join(parts)


def create_session(repo: Any, env: dict[str, str], user_uid: str, requested_mode: str = "auto") -> dict[str, Any]:
    cfg = control(repo)
    guard = guard_new_session(repo, env, user_uid, cfg)
    if guard["blocked"]:
        raise ValueError(guard["message"])
    rid = room_id()
    code = access_code()
    now = datetime.now()
    code_minutes = max(1, int_value(cfg.get("code_expire_minutes"), 30))
    expires_at = now + timedelta(minutes=code_minutes)
    uid = stable_uid("transfer-session", f"{rid}-{time.time_ns()}")
    effective_mode = choose_effective_mode(cfg, requested_mode)
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute(
            """INSERT INTO transfer_sessions
            (uid, room_id, access_code, created_by, status, requested_mode, effective_mode, sender_ip, total_bytes,
             transferred_bytes, traffic_counted_bytes, expires_at, code_expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
            [uid, rid, code, user_uid, "waiting", requested_mode, effective_mode, env.get("_REMOTE_ADDR", ""), text_time(expires_at), text_time(expires_at)],
        )
        conn.commit()
        row = conn.execute("SELECT * FROM transfer_sessions WHERE uid = ?", [uid]).fetchone()
        return dict(row)
    session = locked(lock, write)
    audit(repo, user_uid, "session_created", session.get("uid", ""), "", env, f"Created transfer task {rid}", {"mode": effective_mode})
    return session


def choose_effective_mode(cfg: dict[str, Any], requested: str) -> str:
    requested = requested if requested in {"auto", "lan", "relay", "cloud_relay", "temp_local", "temp_cloud"} else "auto"
    if truthy(cfg.get("lan_only")):
        return "lan"
    if requested != "auto":
        return requested
    if truthy(cfg.get("lan_acceleration_enabled"), True):
        return "lan"
    if truthy(cfg.get("relay_enabled"), True):
        return "relay"
    if truthy(cfg.get("cloud_relay_enabled")):
        return "cloud_relay"
    if truthy(cfg.get("temp_storage_enabled"), True):
        return "temp_local" if str(cfg.get("temp_storage_mode")) in {"local", "local_and_cloud"} else "temp_cloud"
    return "lan"


def get_session(repo: Any, room_or_uid: str) -> dict[str, Any]:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def read() -> dict[str, Any]:
        row = conn.execute("SELECT * FROM transfer_sessions WHERE room_id = ? OR uid = ? LIMIT 1", [room_or_uid, room_or_uid]).fetchone()
        return dict(row) if row else {}
    return locked(lock, read)


def session_owner(session: dict[str, Any], user_uid: str) -> bool:
    return bool(user_uid and session and user_uid == str(session.get("created_by") or ""))


def access_wait_seconds(session: dict[str, Any]) -> int:
    locked_until = str(session.get("access_locked_until") or "")
    if not locked_until:
        return 0
    try:
        until = datetime.strptime(locked_until[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return 0
    return max(0, int((until - datetime.now()).total_seconds()))


def access_lock_message(session: dict[str, Any]) -> str:
    wait = access_wait_seconds(session)
    if wait <= 0:
        return "Too many invalid access code attempts. Please try again later."
    minutes = max(1, (wait + 59) // 60)
    return f"Too many invalid access code attempts. Please try again in about {minutes} minute(s)."


def record_access_failure(repo: Any, session: dict[str, Any], env: dict[str, str] | None = None) -> None:
    if not session:
        return
    failures = int_value(session.get("access_failures"), 0) + 1
    locked_until = ""
    if failures >= ACCESS_FAILURE_LIMIT:
        locked_until = text_time(datetime.now() + timedelta(seconds=ACCESS_LOCK_SECONDS))
    conn, lock = connection_context(repo)
    def write() -> None:
        conn.execute(
            "UPDATE transfer_sessions SET access_failures = ?, access_locked_until = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?",
            [failures, locked_until, session["uid"]],
        )
        conn.commit()
    locked(lock, write)


def clear_access_failures(repo: Any, session: dict[str, Any]) -> None:
    if not session:
        return
    if int_value(session.get("access_failures"), 0) <= 0 and not str(session.get("access_locked_until") or ""):
        return
    conn, lock = connection_context(repo)
    def write() -> None:
        conn.execute(
            "UPDATE transfer_sessions SET access_failures = 0, access_locked_until = '', updated_at = CURRENT_TIMESTAMP WHERE uid = ?",
            [session["uid"]],
        )
        conn.commit()
    locked(lock, write)


def verify_session_access(repo: Any, session: dict[str, Any], code: str, user_uid: str, cfg: dict[str, Any]) -> bool:
    if not session:
        return False
    if session_owner(session, user_uid):
        return True
    if user_uid and not truthy(cfg.get("require_login"), True):
        return True
    provided_code = normalize_access_code(code)
    stored_code = normalize_access_code(session.get("access_code"))
    if truthy(cfg.get("allow_anonymous_by_code"), True) and provided_code and stored_code and provided_code == stored_code:
        return not expired(session.get("code_expires_at"))
    return False


def join_session(repo: Any, env: dict[str, str], room: str, code: str, user_uid: str) -> dict[str, Any]:
    cfg = control(repo)
    session = get_session(repo, room)
    if session and not session_owner(session, user_uid) and not (user_uid and not truthy(cfg.get("require_login"), True)) and access_wait_seconds(session) > 0:
        raise ValueError(access_lock_message(session))
    if not verify_session_access(repo, session, code, user_uid, cfg):
        record_access_failure(repo, session, env)
        raise ValueError("The access code is invalid, expired, or this account cannot access the transfer task.")
    clear_access_failures(repo, session)
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute("UPDATE transfer_sessions SET status = ?, receiver_ip = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", ["connected", env.get("_REMOTE_ADDR", ""), session["uid"]])
        conn.commit()
        row = conn.execute("SELECT * FROM transfer_sessions WHERE uid = ?", [session["uid"]]).fetchone()
        return dict(row)
    return locked(lock, write)


def create_object(repo: Any, env: dict[str, str], session: dict[str, Any], data: dict[str, Any], user_uid: str) -> dict[str, Any]:
    cfg = control(repo)
    size_bytes = int_value(data.get("size_bytes"), 0)
    if size_bytes < 0:
        raise ValueError("File size cannot be negative.")
    guard = guard_upload(repo, env, session, user_uid, cfg, size_bytes)
    if guard["blocked"]:
        raise ValueError(guard["message"])
    relative = safe_relative_path(str(data.get("relative_path") or data.get("display_name") or "file"))
    object_uid = stable_uid("transfer-object", f"{session.get('uid')}-{relative}-{time.time_ns()}")
    backend = storage_backend(cfg, env)
    temp_key = f"{session['uid']}/{object_uid}.data"
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute(
            """INSERT INTO transfer_objects
            (uid, session_uid, object_type, relative_path, display_name, size_bytes, status, transferred_bytes, storage_backend, temp_key, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
            [object_uid, session["uid"], text_only(data.get("object_type") or "file", 30), relative, relative.split("/")[-1], size_bytes, "uploading", backend, temp_key],
        )
        conn.commit()
        return dict(conn.execute("SELECT * FROM transfer_objects WHERE uid = ?", [object_uid]).fetchone())
    return locked(lock, write)


def storage_backend(cfg: dict[str, Any], env: dict[str, str]) -> str:
    if not truthy(cfg.get("temp_storage_enabled"), True):
        return "relay"
    mode = str(cfg.get("temp_storage_mode") or "local")
    if mode in {"cloud", "local_and_cloud"} and cloud_root(env):
        return "cloud"
    return "local"


def object_path(env: dict[str, str], obj: dict[str, Any]) -> Path:
    key = str(obj.get("temp_key") or "")
    if str(obj.get("storage_backend") or "local") == "cloud":
        root = cloud_root(env)
        if root:
            path = safe_join(root, key)
            if path:
                return path
    root = temp_root(env)
    path = safe_join(root, key)
    if not path:
        raise ValueError("Unsafe temporary storage path.")
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def write_chunk(repo: Any, env: dict[str, str], session: dict[str, Any], object_uid: str, offset: int, body: bytes, user_uid: str) -> dict[str, Any]:
    if offset < 0:
        raise ValueError("Chunk offset cannot be negative.")
    if len(body) > CHUNK_LIMIT:
        raise ValueError("Chunk is too large.")
    obj = get_object(repo, session["uid"], object_uid)
    if not obj:
        raise ValueError("Transfer object not found.")
    declared_size = int_value(obj.get("size_bytes"), 0)
    if declared_size < 0:
        raise ValueError("Declared file size is invalid.")
    end_offset = offset + len(body)
    if len(body) and declared_size <= 0:
        raise ValueError("A positive file size is required before uploading chunks.")
    if end_offset > declared_size:
        raise ValueError("Chunk exceeds the declared file size.")
    cfg = control(repo)
    path = object_path(env, obj)
    path.parent.mkdir(parents=True, exist_ok=True)
    current_size = path.stat().st_size if path.exists() else 0
    if current_size > declared_size:
        raise ValueError("Temporary file is larger than the declared file size.")
    incoming_growth = max(0, end_offset - current_size)
    guard = guard_upload(repo, env, session, user_uid, cfg, incoming_growth)
    if guard["blocked"]:
        raise ValueError(guard["message"])
    with path.open("r+b" if path.exists() else "w+b") as handle:
        handle.seek(offset)
        handle.write(body)
    actual_size = path.stat().st_size
    if actual_size > declared_size:
        raise ValueError("Chunk write exceeded the declared file size.")
    transferred = min(actual_size, declared_size)
    status = "ready" if declared_size and transferred >= declared_size else "uploading"
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute("UPDATE transfer_objects SET transferred_bytes = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", [transferred, status, object_uid])
        conn.execute("UPDATE transfer_sessions SET status = ?, transferred_bytes = transferred_bytes + ?, traffic_counted_bytes = traffic_counted_bytes + ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", ["transferring", incoming_growth, len(body), session["uid"]])
        if status == "ready":
            expires = temp_expiry(cfg, session)
            conn.execute(
                """INSERT OR IGNORE INTO transfer_temp_objects
                (uid, session_uid, object_uid, storage_backend, temp_key, size_bytes, status, owner_user, expires_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
                [stable_uid("transfer-temp", object_uid), session["uid"], object_uid, obj.get("storage_backend") or "local", obj.get("temp_key") or "", transferred, "ready", user_uid, expires],
            )
        conn.commit()
        return get_object_unlocked(conn, session["uid"], object_uid)
    updated = locked(lock, write)
    record_usage(repo, len(body), user_uid, str(obj.get("storage_backend") or "local"))
    return updated


def get_object(repo: Any, session_uid: str, object_uid: str) -> dict[str, Any]:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    return locked(lock, lambda: get_object_unlocked(conn, session_uid, object_uid))


def get_object_unlocked(conn: Any, session_uid: str, object_uid: str) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM transfer_objects WHERE session_uid = ? AND uid = ?", [session_uid, object_uid]).fetchone()
    return dict(row) if row else {}


def list_objects(repo: Any, session_uid: str) -> list[dict[str, Any]]:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def read() -> list[dict[str, Any]]:
        return [dict(row) for row in conn.execute("SELECT * FROM transfer_objects WHERE session_uid = ? ORDER BY relative_path", [session_uid])]
    return locked(lock, read)


def read_object_chunk(repo: Any, env: dict[str, str], obj: dict[str, Any], offset: int, limit: int, user_uid: str = "") -> bytes:
    if offset < 0:
        raise ValueError("Chunk offset cannot be negative.")
    path = object_path(env, obj)
    if not path.exists():
        raise ValueError("The temporary file is missing or has already been cleaned up.")
    limit = max(1, min(limit or (1024 * 1024), CHUNK_LIMIT))
    with path.open("rb") as handle:
        handle.seek(offset)
        data = handle.read(limit)
    if data:
        record_usage(repo, len(data), user_uid, str(obj.get("storage_backend") or "local"))
    return data


def finish_session(repo: Any, session_uid: str, user_uid: str, env: dict[str, str]) -> dict[str, Any]:
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute("UPDATE transfer_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", ["done", session_uid])
        conn.commit()
        row = conn.execute("SELECT * FROM transfer_sessions WHERE uid = ?", [session_uid]).fetchone()
        return dict(row)
    session = locked(lock, write)
    audit(repo, user_uid, "session_finished", session_uid, "", env, "Transfer task completed.", {})
    return session


def stop_session(repo: Any, room_or_uid: str, user_uid: str, env: dict[str, str], reason: str = "Stopped by administrator") -> dict[str, Any]:
    session = get_session(repo, room_or_uid)
    if not session:
        raise ValueError("Transfer task not found.")
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute("UPDATE transfer_sessions SET status = ?, stopped_by = ?, stop_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", ["stopped", user_uid, reason, session["uid"]])
        conn.commit()
        return dict(conn.execute("SELECT * FROM transfer_sessions WHERE uid = ?", [session["uid"]]).fetchone())
    updated = locked(lock, write)
    audit(repo, user_uid, "session_stopped", session["uid"], "", env, reason, {})
    return updated


def delete_session(repo: Any, room_or_uid: str, user_uid: str, env: dict[str, str], reason: str = "Deleted by administrator") -> dict[str, Any]:
    session = get_session(repo, room_or_uid)
    if not session:
        raise ValueError("Transfer task not found.")
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute("UPDATE transfer_sessions SET status = ?, stopped_by = ?, stop_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", ["deleted", user_uid, reason, session["uid"]])
        conn.commit()
        row = conn.execute("SELECT * FROM transfer_sessions WHERE uid = ?", [session["uid"]]).fetchone()
        return dict(row)
    updated = locked(lock, write)
    audit(repo, user_uid, "session_deleted", session["uid"], "", env, reason, {})
    return updated


def destroy_session(repo: Any, room_or_uid: str, user_uid: str, env: dict[str, str], reason: str = "Destroyed by administrator") -> dict[str, Any]:
    session = get_session(repo, room_or_uid)
    if not session:
        raise ValueError("Transfer task not found.")
    objects = list_objects(repo, session["uid"])
    removed = 0
    for obj in objects:
        try:
            path = object_path(env, obj)
            if path.exists() and path.is_file():
                path.unlink()
                removed += 1
        except (OSError, ValueError):
            continue
    conn, lock = connection_context(repo)
    def write() -> dict[str, Any]:
        conn.execute("UPDATE transfer_objects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE session_uid = ?", ["deleted", session["uid"]])
        conn.execute("UPDATE transfer_temp_objects SET status = ?, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE session_uid = ?", ["deleted", session["uid"]])
        conn.execute("UPDATE transfer_sessions SET status = ?, stopped_by = ?, stop_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", ["destroyed", user_uid, reason, session["uid"]])
        conn.commit()
        row = conn.execute("SELECT * FROM transfer_sessions WHERE uid = ?", [session["uid"]]).fetchone()
        return dict(row)
    updated = locked(lock, write)
    audit(repo, user_uid, "session_destroyed", session["uid"], "", env, reason, {"removed_files": removed})
    return updated


def admin_sessions(repo: Any) -> list[dict[str, Any]]:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def read() -> list[dict[str, Any]]:
        query = (
            "SELECT s.*, COUNT(o.uid) AS object_count, "
            "COALESCE(SUM(o.size_bytes), 0) AS object_bytes, "
            "COALESCE(SUM(CASE WHEN o.status = 'ready' THEN 1 ELSE 0 END), 0) AS ready_count, "
            "COALESCE(SUM(CASE WHEN o.status = 'uploading' THEN 1 ELSE 0 END), 0) AS uploading_count, "
            "COALESCE(GROUP_CONCAT(DISTINCT o.storage_backend), '') AS storage_backends "
            "FROM transfer_sessions s "
            "LEFT JOIN transfer_objects o ON o.session_uid = s.uid "
            "GROUP BY s.uid ORDER BY s.id DESC LIMIT 200"
        )
        return [dict(row) for row in conn.execute("".join(query))]
    return locked(lock, read)

def guard_new_session(repo: Any, env: dict[str, str], user_uid: str, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = cfg or control(repo)
    if not truthy(cfg.get("enabled"), True):
        return block("File transfer is currently disabled.")
    resources = resource_state(repo, env, cfg)
    blocker = first_blocker(resources)
    if blocker:
        return blocker
    return ok(resources.get("warnings", []))


def guard_upload(repo: Any, env: dict[str, str], session: dict[str, Any], user_uid: str, cfg: dict[str, Any] | None, incoming_bytes: int) -> dict[str, Any]:
    cfg = cfg or control(repo)
    if str(session.get("status") or "") in {"stopped", "expired", "failed", "deleted", "destroyed"}:
        return block("This transfer task has already stopped.")
    resources = resource_state(repo, env, cfg)
    blocker = first_blocker(resources)
    if blocker:
        return blocker
    per_session_gb = int_value(cfg.get("local_temp_per_session_quota_gb"), 0)
    if per_session_gb > 0 and int_value(session.get("transferred_bytes"), 0) + incoming_bytes > gb(per_session_gb):
        return block("This task exceeds the per-task temporary storage quota.")
    return ok(resources.get("warnings", []))


def resource_state(repo: Any, env: dict[str, str], cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = cfg or control(repo)
    usage = usage_summary(repo)
    disk = disk_summary(env)
    warnings: list[str] = []
    blockers: list[str] = []
    warn_pct = max(1, int_value(cfg.get("warning_threshold_percent"), 80))
    critical_pct = max(warn_pct, int_value(cfg.get("critical_threshold_percent"), 95))
    for period in ("daily", "weekly", "monthly", "yearly"):
        quota = gb(int_value(cfg.get(f"{period}_traffic_quota_gb"), 0))
        used = int_value(usage.get(f"{period}_bytes"), 0)
        if quota and used >= quota * critical_pct / 100:
            blockers.append(f"{period_label(period)} traffic quota is exhausted.")
        elif quota and used >= quota * warn_pct / 100:
            warnings.append(f"{period_label(period)} traffic quota is almost exhausted.")
    if truthy(cfg.get("disk_monitor_enabled"), True):
        min_free_gb = gb(int_value(cfg.get("min_free_disk_gb"), 0))
        min_free_percent = int_value(cfg.get("min_free_disk_percent"), 0)
        if min_free_gb and disk["free_bytes"] < min_free_gb:
            blockers.append("Server free disk space is below the configured limit.")
        elif min_free_percent and disk["free_percent"] < min_free_percent:
            blockers.append("Server free disk percentage is below the configured limit.")
        local_quota = gb(int_value(cfg.get("local_temp_total_quota_gb"), 0))
        if local_quota and disk["local_temp_used_bytes"] >= local_quota:
            blockers.append("Local temporary storage quota has been exhausted.")
        elif local_quota and disk["local_temp_used_bytes"] >= local_quota * warn_pct / 100:
            warnings.append("Local temporary storage quota is almost exhausted.")
    return {"ok": not blockers, "warnings": warnings, "blockers": blockers, "usage": usage, "disk": disk, "cloud_available": cloud_root(env) is not None}


def first_blocker(resources: dict[str, Any]) -> dict[str, Any] | None:
    blockers = resources.get("blockers") or []
    if blockers:
        return block(str(blockers[0]), resources.get("warnings", []), blockers)
    return None


def ok(warnings: list[str] | None = None) -> dict[str, Any]:
    return {"blocked": False, "message": "", "warnings": warnings or []}


def block(message: str, warnings: list[str] | None = None, blockers: list[str] | None = None) -> dict[str, Any]:
    return {"blocked": True, "message": message, "warnings": warnings or [], "blockers": blockers or [message]}


def usage_summary(repo: Any) -> dict[str, int]:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def read() -> dict[str, int]:
        result: dict[str, int] = {}
        for period in ("day", "week", "month", "year"):
            start, _end = period_bounds(period)
            row = conn.execute("SELECT SUM(total_bytes) AS total FROM transfer_usage_periods WHERE period_type = ? AND period_start = ? AND COALESCE(user_uid, '') = ''", [period, start]).fetchone()
            result[f"{period_name(period)}_bytes"] = int(row["total"] or 0) if row else 0
        return result
    return locked(lock, read)


def record_usage(repo: Any, byte_count: int, user_uid: str, backend: str) -> None:
    if byte_count <= 0:
        return
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    category = {
        "cloud": "cloud_temp_bytes",
        "cloud_relay": "cloud_relay_bytes",
        "relay": "relay_bytes",
        "lan": "direct_estimated_bytes",
    }.get(backend, "local_temp_bytes")
    def write() -> None:
        for period in ("day", "week", "month", "year"):
            start, end = period_bounds(period)
            upsert_usage(conn, period, start, end, "", byte_count, category)
            if user_uid:
                upsert_usage(conn, period, start, end, user_uid, byte_count, category)
        conn.commit()
    locked(lock, write)


def upsert_usage(conn: Any, period: str, start: str, end: str, user_uid: str, byte_count: int, category: str) -> None:
    row = conn.execute("SELECT uid FROM transfer_usage_periods WHERE period_type = ? AND period_start = ? AND COALESCE(user_uid, '') = ?", [period, start, user_uid]).fetchone()
    if row:
        conn.execute(f"UPDATE transfer_usage_periods SET total_bytes = total_bytes + ?, {category} = {category} + ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", [byte_count, byte_count, row["uid"]])
    else:
        uid = stable_uid("transfer-usage", f"{period}:{start}:{user_uid}")
        values = {"relay_bytes": 0, "cloud_relay_bytes": 0, "local_temp_bytes": 0, "cloud_temp_bytes": 0, "direct_estimated_bytes": 0}
        values[category] = byte_count
        conn.execute(
            """INSERT INTO transfer_usage_periods
            (uid, period_type, period_start, period_end, user_uid, total_bytes, relay_bytes, cloud_relay_bytes, local_temp_bytes, cloud_temp_bytes, direct_estimated_bytes, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            [uid, period, start, end, user_uid, byte_count, values["relay_bytes"], values["cloud_relay_bytes"], values["local_temp_bytes"], values["cloud_temp_bytes"], values["direct_estimated_bytes"]],
        )


def disk_summary(env: dict[str, str]) -> dict[str, int]:
    root = temp_root(env)
    usage = shutil.disk_usage(root)
    used = directory_size(root)
    return {
        "free_bytes": int(usage.free),
        "total_bytes": int(usage.total),
        "free_percent": int((usage.free / usage.total) * 100) if usage.total else 0,
        "local_temp_used_bytes": used,
    }


def directory_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return 0
    for item in path.rglob("*"):
        try:
            if item.is_file():
                total += item.stat().st_size
        except OSError:
            continue
    return total


def cleanup_expired(repo: Any, env: dict[str, str]) -> int:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    now = now_text()
    def run() -> int:
        rows = [dict(row) for row in conn.execute("SELECT * FROM transfer_temp_objects WHERE status != 'deleted' AND expires_at IS NOT NULL AND expires_at < ?", [now])]
        count = 0
        for row in rows:
            root = cloud_root(env) if row.get("storage_backend") == "cloud" else temp_root(env)
            if root:
                path = safe_join(root, str(row.get("temp_key") or ""))
                if path and path.exists():
                    try:
                        path.unlink()
                    except OSError:
                        pass
            conn.execute("UPDATE transfer_temp_objects SET status = 'deleted', deleted_at = ?, updated_at = CURRENT_TIMESTAMP WHERE uid = ?", [now, row["uid"]])
            conn.execute("UPDATE transfer_objects SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE uid = ?", [row["object_uid"]])
            count += 1
        conn.commit()
        return count
    return locked(lock, run)


def audit(repo: Any, actor_uid: str, action: str, session_uid: str, object_uid: str, env: dict[str, str], message: str, metadata: dict[str, Any]) -> None:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def write() -> None:
        conn.execute(
            """INSERT INTO transfer_audit_logs
            (uid, actor_uid, action, session_uid, object_uid, ip_address, message, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            [stable_uid("transfer-log", f"{action}:{time.time_ns()}"), actor_uid, action, session_uid, object_uid, env.get("_REMOTE_ADDR", ""), message, json.dumps(metadata, ensure_ascii=False)],
        )
        conn.commit()
    locked(lock, write)


def add_signal(repo: Any, room: str, sender_uid: str, signal_type: str, payload: dict[str, Any]) -> None:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def write() -> None:
        conn.execute(
            "INSERT INTO transfer_signals (uid, room_id, sender_uid, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [stable_uid("transfer-signal", f"{room}:{time.time_ns()}"), room, sender_uid, signal_type, json.dumps(payload, ensure_ascii=False)],
        )
        conn.execute("DELETE FROM transfer_signals WHERE room_id = ? AND id NOT IN (SELECT id FROM transfer_signals WHERE room_id = ? ORDER BY id DESC LIMIT 100)", [room, room])
        conn.commit()
    locked(lock, write)


def list_signals(repo: Any, room: str, after_id: int = 0) -> list[dict[str, Any]]:
    ensure_schema(repo)
    conn, lock = connection_context(repo)
    def read() -> list[dict[str, Any]]:
        return [dict(row) for row in conn.execute("SELECT * FROM transfer_signals WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT 100", [room, after_id])]
    return locked(lock, read)


def temp_expiry(cfg: dict[str, Any], session: dict[str, Any]) -> str:
    if truthy(cfg.get("temp_expire_follow_code"), True):
        return str(session.get("code_expires_at") or "")
    return text_time(datetime.now() + timedelta(minutes=max(1, int_value(cfg.get("temp_expire_minutes"), 60))))


def expired(value: Any) -> bool:
    text = str(value or "")
    if not text:
        return False
    try:
        return datetime.strptime(text[:19], "%Y-%m-%d %H:%M:%S") < datetime.now()
    except ValueError:
        return False


def text_time(value: datetime) -> str:
    return value.strftime("%Y-%m-%d %H:%M:%S")


def period_bounds(period: str) -> tuple[str, str]:
    now = datetime.now()
    if period == "day":
        start = datetime(now.year, now.month, now.day)
        end = start + timedelta(days=1)
    elif period == "week":
        start = datetime(now.year, now.month, now.day) - timedelta(days=now.weekday())
        end = start + timedelta(days=7)
    elif period == "month":
        start = datetime(now.year, now.month, 1)
        end = datetime(now.year + (1 if now.month == 12 else 0), 1 if now.month == 12 else now.month + 1, 1)
    else:
        start = datetime(now.year, 1, 1)
        end = datetime(now.year + 1, 1, 1)
    return text_time(start), text_time(end)


def period_name(period: str) -> str:
    return {"day": "daily", "week": "weekly", "month": "monthly", "year": "yearly"}[period]


def period_label(period: str) -> str:
    return {"daily": "Daily", "weekly": "Weekly", "monthly": "Monthly", "yearly": "Yearly"}[period]


def gb(value: int) -> int:
    return max(0, int(value)) * 1024 * 1024 * 1024


def safe_join(root: Path, relative: str) -> Path | None:
    try:
        root_resolved = root.resolve()
        target = (root / relative).resolve()
        if not str(target).startswith(str(root_resolved)):
            return None
        return target
    except OSError:
        return None


def locked(lock: Any, func):
    if lock:
        with lock:
            return func()
    return func()

