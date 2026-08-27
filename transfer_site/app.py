from __future__ import annotations

import email.utils
import gzip
import hashlib
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.rendering import security_headers

from .routes import route_transfer_request


class TransferHandler(BaseHTTPRequestHandler):
    repo: SQLiteRepository
    site_url = "http://127.0.0.1:8010"
    public_dir = Path("public")
    media_dir = Path("media")
    static_cache: dict[str, tuple[int, int, bytes, bytes | None]] = {}

    def do_GET(self) -> None:
        path, query = split_target(self.path)
        status, headers, body = route_transfer_request(self.repo, "GET", normalize_mount_path(path), query_dict(query), b"", self.request_env())
        self.respond(status, headers, body)

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length") or 0)
        path, query = split_target(self.path)
        body = self.rfile.read(length)
        try:
            status, headers, payload = route_transfer_request(self.repo, "POST", normalize_mount_path(path), query_dict(query), body, self.request_env())
        except Exception as error:
            self.close_connection = True
            status, headers, payload = 500, security_headers() + [("content-type", "application/json; charset=utf-8")], f'{{"ok":false,"message":"{str(error)}"}}'.encode("utf-8")
        self.respond(status, headers, payload)

    def respond(self, status: int, headers: list[tuple[str, str]], body: bytes) -> None:
        self.send_response(status)
        for key, value in headers:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def request_env(self) -> dict[str, str]:
        return {
            "SITE_URL": self.site_url,
            "TEACHER_SITE_MEDIA": os.environ.get("TEACHER_SITE_MEDIA", str(self.media_dir)),
            "TEACHER_SITE_PUBLIC": os.environ.get("TEACHER_SITE_PUBLIC", str(self.public_dir)),
            "TEACHER_SITE_AUTH_SECRET": os.environ.get("TEACHER_SITE_AUTH_SECRET", ""),
            "TEACHER_SITE_REQUIRE_AUTH_SECRET": os.environ.get("TEACHER_SITE_REQUIRE_AUTH_SECRET", ""),
            "TEACHER_SITE_TRANSFER_TMP": os.environ.get("TEACHER_SITE_TRANSFER_TMP", str(Path("var") / "transfer_site" / "tmp")),
            "TEACHER_SITE_TRANSFER_CLOUD_DIR": os.environ.get("TEACHER_SITE_TRANSFER_CLOUD_DIR", ""),
            "_CONTENT_TYPE": self.headers.get("content-type", ""),
            "_COOKIE": self.headers.get("cookie", ""),
            "_ORIGIN": self.headers.get("origin", ""),
            "_REFERER": self.headers.get("referer", ""),
            "_HOST": self.headers.get("host", ""),
            "_SCHEME": "https" if self.headers.get("x-forwarded-proto", "").lower() == "https" else "http",
            "_REMOTE_ADDR": self.client_address[0] if self.client_address else "",
            "_TRANSFER_STANDALONE": "1",
        }

    def log_message(self, fmt: str, *args) -> None:
        return


async def asgi_app(scope, receive, send):
    if scope["type"] != "http":
        return
    repo = SQLiteRepository(os.environ.get("TEACHER_SITE_DB", "data/site.sqlite3"))
    method = scope.get("method", "GET").upper()
    path = unquote(scope.get("path", "/"))
    query = scope.get("query_string", b"").decode("utf-8", "ignore")
    headers_map = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope.get("headers", [])}
    body = await read_body(receive)
    env = {
        "SITE_URL": os.environ.get("SITE_URL", "http://127.0.0.1:8010"),
        "TEACHER_SITE_MEDIA": os.environ.get("TEACHER_SITE_MEDIA", "media"),
        "TEACHER_SITE_PUBLIC": os.environ.get("TEACHER_SITE_PUBLIC", "public"),
        "TEACHER_SITE_AUTH_SECRET": os.environ.get("TEACHER_SITE_AUTH_SECRET", ""),
        "TEACHER_SITE_REQUIRE_AUTH_SECRET": os.environ.get("TEACHER_SITE_REQUIRE_AUTH_SECRET", ""),
        "TEACHER_SITE_TRANSFER_TMP": os.environ.get("TEACHER_SITE_TRANSFER_TMP", str(Path("var") / "transfer_site" / "tmp")),
        "TEACHER_SITE_TRANSFER_CLOUD_DIR": os.environ.get("TEACHER_SITE_TRANSFER_CLOUD_DIR", ""),
        "_CONTENT_TYPE": headers_map.get("content-type", ""),
        "_COOKIE": headers_map.get("cookie", ""),
        "_ORIGIN": headers_map.get("origin", ""),
        "_REFERER": headers_map.get("referer", ""),
        "_HOST": headers_map.get("host", ""),
        "_SCHEME": headers_map.get("x-forwarded-proto", "http"),
        "_REMOTE_ADDR": scope.get("client", ["", 0])[0] if scope.get("client") else "",
        "_TRANSFER_STANDALONE": "1",
    }
    status, headers, response_body = route_transfer_request(repo, method, normalize_mount_path(path), query_dict(query), body, env)
    await send({"type": "http.response.start", "status": status, "headers": [(k.encode(), v.encode()) for k, v in headers]})
    await send({"type": "http.response.body", "body": response_body})


async def read_body(receive) -> bytes:
    chunks = []
    more = True
    while more:
        message = await receive()
        chunks.append(message.get("body", b""))
        more = message.get("more_body", False)
    return b"".join(chunks)


def serve(db_path: str = "data/site.sqlite3", host: str = "127.0.0.1", port: int = 8010) -> None:
    TransferHandler.repo = SQLiteRepository(db_path)
    TransferHandler.site_url = f"http://{host}:{port}"
    server = ThreadingHTTPServer((host, port), TransferHandler)
    print(f"Serving transfer_site on {TransferHandler.site_url}")
    server.serve_forever()


def split_target(target: str) -> tuple[str, str]:
    parsed = urlsplit(target)
    return unquote(parsed.path or "/"), parsed.query


def query_dict(query: str) -> dict[str, str]:
    from urllib.parse import parse_qs

    parsed = parse_qs(query, keep_blank_values=True)
    return {key: values[-1] if values else "" for key, values in parsed.items()}


def normalize_mount_path(path: str) -> str:
    clean = "/" + path.strip("/")
    if clean == "/":
        return "/transfer"
    return clean


def static_etag(path: Path, mtime_ns: int, size: int) -> str:
    seed = f"{path.as_posix()}:{mtime_ns}:{size}".encode("utf-8")
    return chr(34) + hashlib.sha256(seed).hexdigest()[:24] + chr(34)


def http_date(timestamp: float) -> str:
    return email.utils.formatdate(timestamp, usegmt=True)


def static_body(path: Path, mtime_ns: int, size: int, accepts_gzip: bool) -> tuple[bytes, bool]:
    key = str(path.resolve())
    cached = TransferHandler.static_cache.get(key)
    if not cached or cached[0] != mtime_ns or cached[1] != size:
        raw = path.read_bytes()
        gzipped = gzip.compress(raw, compresslevel=6) if path.suffix.lower() in {".css", ".js", ".json", ".txt", ".html"} else None
        cached = (mtime_ns, size, raw, gzipped)
        TransferHandler.static_cache[key] = cached
    if accepts_gzip and cached[3]:
        return cached[3], True
    return cached[2], False

