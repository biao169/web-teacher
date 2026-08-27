from __future__ import annotations

import argparse
import email.utils
import gzip
import hashlib
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.rendering import route_request, security_headers


class Handler(BaseHTTPRequestHandler):
    repo: SQLiteRepository
    public_dir = Path("public")
    media_dir = Path("media")
    site_url = "http://127.0.0.1:8000"
    static_cache: dict[str, tuple[int, int, bytes, bytes | None]] = {}

    def do_GET(self) -> None:
        static = self.static_response()
        if static:
            status, headers, body = static
        else:
            path, query = split_target(self.path)
            status, headers, body = route_request(self.repo, "GET", path, query, b"", self.request_env())
        self.respond(status, headers, body)

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length") or 0)
        path, query = split_target(self.path)
        if path == "/api/admin/media/upload" and length > 11 * 1024 * 1024:
            self.close_connection = True
            payload = json.dumps({"ok": False, "message": "文件超过 10MB，请压缩后再上传。"}, ensure_ascii=False).encode("utf-8")
            self.respond(413, [("content-type", "application/json; charset=utf-8")], payload)
            return
        body = self.rfile.read(length)
        env = self.request_env()
        try:
            status, headers, payload = route_request(self.repo, "POST", path, query, body, env)
        except Exception as error:
            self.close_connection = True
            payload = json.dumps({"ok": False, "message": f"请求处理失败：{error}"}, ensure_ascii=False).encode("utf-8")
            status, headers = 500, [("content-type", "application/json; charset=utf-8")]
        self.respond(status, headers, payload)

    def static_response(self):
        path, query = split_target(self.path)
        clean = path.lstrip("/")
        if clean.startswith("assets/"):
            target = safe_join(self.public_dir, clean)
        elif clean.startswith("media/"):
            media_target = safe_join(self.media_dir, clean.removeprefix("media/"))
            target = media_target if media_target and media_target.is_file() else safe_join(self.public_dir, clean)
        else:
            return None
        if not target or not target.is_file():
            return None
        stat = target.stat()
        etag = static_etag(target, stat.st_mtime_ns, stat.st_size)
        cache_control = "public, max-age=31536000, immutable" if query or clean.startswith(("assets/", "media/")) else "public, max-age=86400"
        headers = static_security_headers(clean, target) + [
            ("content-type", content_type(target)),
            ("cache-control", cache_control),
            ("etag", etag),
            ("last-modified", http_date(stat.st_mtime)),
        ]
        if self.headers.get("if-none-match") == etag:
            return 304, headers, b""
        body, gzipped = static_body(target, stat.st_mtime_ns, stat.st_size, "gzip" in self.headers.get("accept-encoding", "").lower())
        if gzipped:
            headers.extend([("content-encoding", "gzip"), ("vary", "Accept-Encoding")])
        return 200, headers, body

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
            "_CONTENT_TYPE": self.headers.get("content-type", ""),
            "_COOKIE": self.headers.get("cookie", ""),
            "_ORIGIN": self.headers.get("origin", ""),
            "_REFERER": self.headers.get("referer", ""),
            "_HOST": self.headers.get("host", ""),
            "_SCHEME": "https" if self.headers.get("x-forwarded-proto", "").lower() == "https" else "http",
            "_REMOTE_ADDR": self.client_address[0] if self.client_address else "",
        }

    def log_message(self, fmt: str, *args) -> None:
        return


def split_target(target: str) -> tuple[str, str]:
    path, _, query = target.partition("?")
    return unquote(path or "/"), query


def safe_join(root: Path, relative: str) -> Path | None:
    try:
        root_resolved = root.resolve()
        target = (root / relative).resolve()
        if not str(target).startswith(str(root_resolved)):
            return None
        return target
    except OSError:
        return None


def static_security_headers(clean: str, target: Path) -> list[tuple[str, str]]:
    headers = security_headers()
    if clean.startswith("media/") and target.suffix.lower() == ".pdf":
        blocked = {"x-frame-options", "content-security-policy"}
        return [(key, value) for key, value in headers if key.lower() not in blocked]
    return headers


def content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
    }.get(suffix, "application/octet-stream")



GZIP_SUFFIXES = {".css", ".js", ".mjs", ".svg", ".json", ".txt", ".xml", ".html"}


def static_etag(path: Path, mtime_ns: int, size: int) -> str:
    seed = f"{path.as_posix()}:{mtime_ns}:{size}".encode("utf-8")
    return chr(34) + hashlib.sha256(seed).hexdigest()[:24] + chr(34)


def http_date(timestamp: float) -> str:
    return email.utils.formatdate(timestamp, usegmt=True)


def static_body(path: Path, mtime_ns: int, size: int, accepts_gzip: bool) -> tuple[bytes, bool]:
    key = str(path.resolve())
    cached = Handler.static_cache.get(key)
    if not cached or cached[0] != mtime_ns or cached[1] != size:
        raw = path.read_bytes()
        gzipped = gzip.compress(raw, compresslevel=6) if path.suffix.lower() in GZIP_SUFFIXES else None
        cached = (mtime_ns, size, raw, gzipped)
        Handler.static_cache[key] = cached
    if accepts_gzip and cached[3]:
        return cached[3], True
    return cached[2], False


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the teacher site with Python stdlib HTTP server.")
    parser.add_argument("--db", default="data/site.sqlite3")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    repo = SQLiteRepository(args.db)
    Handler.repo = repo
    Handler.site_url = f"http://{args.host}:{args.port}"
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Serving on {Handler.site_url}")
    server.serve_forever()


if __name__ == "__main__":
    main()
