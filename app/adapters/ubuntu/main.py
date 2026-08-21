from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import unquote, urlsplit

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.rendering import route_request, security_headers
from app.core.seed_data import DEMO_ROWS


DB_PATH = os.environ.get("TEACHER_SITE_DB", "data/site.sqlite3")
PUBLIC_DIR = Path(os.environ.get("TEACHER_SITE_PUBLIC", "public"))
MEDIA_DIR = Path(os.environ.get("TEACHER_SITE_MEDIA", "media"))

repo = SQLiteRepository(DB_PATH)
if not repo.list("site_settings"):
    for table, rows in DEMO_ROWS.items():
        for row in rows:
            if row.get("uid"):
                repo.save(table, row)


async def app(scope, receive, send):
    if scope["type"] != "http":
        return
    method = scope.get("method", "GET").upper()
    path = unquote(scope.get("path", "/"))
    query_string = scope.get("query_string", b"").decode("utf-8", "ignore")
    headers_map = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope.get("headers", [])}

    static = static_response(path)
    if method == "GET" and static:
        status, headers, body = static
        await send_response(send, status, headers, body)
        return

    body = await read_body(receive)
    env = {
        "SITE_URL": os.environ.get("SITE_URL", "http://127.0.0.1:8000"),
        "PUBLIC_MEDIA_BASE_URL": os.environ.get("PUBLIC_MEDIA_BASE_URL", ""),
        "TEACHER_SITE_AUTH_SECRET": os.environ.get("TEACHER_SITE_AUTH_SECRET", ""),
        "TEACHER_SITE_REQUIRE_AUTH_SECRET": os.environ.get("TEACHER_SITE_REQUIRE_AUTH_SECRET", ""),
        "_CONTENT_TYPE": headers_map.get("content-type", ""),
        "_COOKIE": headers_map.get("cookie", ""),
        "_ORIGIN": headers_map.get("origin", ""),
        "_REFERER": headers_map.get("referer", ""),
        "_HOST": headers_map.get("host", ""),
        "_SCHEME": headers_map.get("x-forwarded-proto", "http"),
        "_REMOTE_ADDR": scope.get("client", ["", 0])[0] if scope.get("client") else "",
    }
    status, headers, response_body = route_request(repo, method, path, query_string, body, env)
    await send_response(send, status, headers, response_body)


async def read_body(receive) -> bytes:
    chunks = []
    more = True
    while more:
        message = await receive()
        chunks.append(message.get("body", b""))
        more = message.get("more_body", False)
    return b"".join(chunks)


async def send_response(send, status: int, headers: list[tuple[str, str]], body: bytes) -> None:
    await send({"type": "http.response.start", "status": status, "headers": [(k.encode(), v.encode()) for k, v in headers]})
    await send({"type": "http.response.body", "body": body})


def static_response(path: str):
    parsed = urlsplit(path)
    clean = unquote(parsed.path).lstrip("/")
    if clean.startswith("assets/"):
        target = safe_join(PUBLIC_DIR, clean)
    elif clean.startswith("media/"):
        media_target = safe_join(MEDIA_DIR, clean.removeprefix("media/"))
        target = media_target if media_target and media_target.is_file() else safe_join(PUBLIC_DIR, clean)
    else:
        return None
    if not target or not target.is_file():
        return None
    return 200, security_headers() + [("content-type", content_type(target)), ("cache-control", "public, max-age=3600")], target.read_bytes()


def safe_join(root: Path, relative: str) -> Path | None:
    try:
        root_resolved = root.resolve()
        target = (root / relative).resolve()
        if not str(target).startswith(str(root_resolved)):
            return None
        return target
    except OSError:
        return None


def content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }.get(suffix, "application/octet-stream")
