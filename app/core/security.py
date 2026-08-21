from __future__ import annotations

import html
import base64
import hashlib
import hmac
import json
import re
import secrets
import time
import unicodedata
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse


_TAG_RE = re.compile(r"<[^>]*>")
_DANGEROUS_URL_RE = re.compile(r"^(javascript|data):", re.IGNORECASE)
_SAFE_STYLE_PROPS = {
    "background-color",
    "color",
    "display",
    "float",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "height",
    "margin",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "margin-top",
    "max-width",
    "min-height",
    "min-width",
    "object-fit",
    "text-align",
    "text-decoration",
    "width",
}
_SAFE_STYLE_VALUE_RE = re.compile(r"^[#(),.%\w\s\"'-]+$")
_VOID_TAGS = {"br", "img", "hr", "source"}
_ALLOWED_HTML_ATTRS = {
    "*": {"class", "style", "title"},
    "a": {"href", "target", "rel"},
    "img": {"src", "alt", "loading", "decoding", "width", "height"},
    "source": {"src", "type"},
    "video": {"src", "controls", "muted", "playsinline", "preload", "width", "height"},
}
_ALLOWED_HTML_TAGS = {
    "a",
    "b",
    "blockquote",
    "br",
    "code",
    "div",
    "em",
    "figcaption",
    "figure",
    "h2",
    "h3",
    "h4",
    "hr",
    "i",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "source",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "u",
    "ul",
    "video",
}


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def text_only(value: Any, limit: int = 4000) -> str:
    raw = "" if value is None else str(value)
    raw = _TAG_RE.sub("", raw)
    raw = unicodedata.normalize("NFKC", raw)
    return raw[:limit]


def safe_href(value: Any) -> str:
    url = ("" if value is None else str(value)).strip()
    if _DANGEROUS_URL_RE.match(url):
        return "#"
    if url.startswith(("http://", "https://", "/", "#", "mailto:")):
        return url
    return "#"


def safe_slug(value: str) -> str:
    cleaned = unicodedata.normalize("NFKC", value).strip().lower()
    cleaned = re.sub(r"[^a-z0-9\u4e00-\u9fff_-]+", "-", cleaned)
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or secrets.token_hex(6)


def stable_uid(prefix: str, seed: str) -> str:
    import hashlib

    digest = hashlib.sha1(seed.encode("utf-8", "ignore")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def hash_password(password: str, iterations: int = 260000) -> str:
    password = password or ""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${base64.urlsafe_b64encode(digest).decode('ascii')}"


def verify_password(password: str, encoded: Any) -> bool:
    raw = "" if encoded is None else str(encoded)
    try:
        algorithm, iterations_text, salt, digest_text = raw.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        expected = base64.urlsafe_b64decode(digest_text.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", (password or "").encode("utf-8"), salt.encode("ascii"), iterations)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError, OSError):
        return False


def parse_cookie_header(header: Any) -> dict[str, str]:
    cookies: dict[str, str] = {}
    for part in str(header or "").split(";"):
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        key = key.strip()
        if key:
            cookies[key] = value.strip()
    return cookies


def signed_session_token(payload: dict[str, Any], secret: str) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).decode("ascii").rstrip("=")
    signature = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def read_signed_session(token: Any, secret: str) -> dict[str, Any]:
    try:
        body, signature = str(token or "").split(".", 1)
        expected = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return {}
        padded = body + "=" * (-len(body) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
        if int(payload.get("exp") or 0) < int(time.time()):
            return {}
        return payload if isinstance(payload, dict) else {}
    except (ValueError, TypeError, OSError, json.JSONDecodeError):
        return {}


def same_origin_post_allowed(method: str, env: dict[str, str]) -> bool:
    if method.upper() != "POST":
        return True
    host = str(env.get("_HOST") or "").split(",", 1)[0].strip().lower()
    if not host:
        return True
    for key in ("_ORIGIN", "_REFERER"):
        raw = str(env.get(key) or "").strip()
        if not raw:
            continue
        parsed = urlparse(raw)
        if parsed.netloc and parsed.netloc.lower() != host:
            return False
    return True


def allowed_object_key(value: Any) -> str:
    key = ("" if value is None else str(value)).replace("\\", "/").strip("/")
    parts = [part for part in key.split("/") if part and part not in {".", ".."}]
    return "/".join(parts)


def _sanitize_style(value: str) -> str:
    declarations = []
    for item in value.split(";"):
        if ":" not in item:
            continue
        prop, raw = item.split(":", 1)
        prop = prop.strip().lower()
        raw = raw.strip()
        if prop not in _SAFE_STYLE_PROPS or not raw or len(raw) > 120:
            continue
        lowered = raw.lower()
        if "expression" in lowered or "url(" in lowered or "javascript:" in lowered or "data:" in lowered:
            continue
        if not _SAFE_STYLE_VALUE_RE.match(raw):
            continue
        declarations.append(f"{prop}: {raw}")
    return "; ".join(declarations)


class _LimitedHTMLRenderer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.stack: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "iframe", "object", "embed", "form"}:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag not in _ALLOWED_HTML_TAGS:
            return
        clean_attrs = []
        allowed = _ALLOWED_HTML_ATTRS.get("*", set()) | _ALLOWED_HTML_ATTRS.get(tag, set())
        for name, value in attrs:
            name = name.lower()
            if name not in allowed:
                continue
            if name in {"controls", "muted", "playsinline"}:
                clean_attrs.append((name, name))
                continue
            if value is None:
                continue
            if name in {"href", "src"}:
                safe = safe_href(value)
                if safe == "#":
                    continue
                clean_attrs.append((name, safe))
                continue
            if name == "preload":
                clean_attrs.append((name, value if value in {"auto", "metadata", "none"} else "metadata"))
                continue
            if name == "style":
                style = _sanitize_style(value)
                if style:
                    clean_attrs.append((name, style))
                continue
            if name == "class":
                classes = [
                    item
                    for item in text_only(value, 160).split()
                    if item and item not in {"rich-media-selected", "is-rich-media-fixed-active"}
                ]
                if classes:
                    clean_attrs.append((name, " ".join(classes)))
                continue
            if name in {"target", "rel"}:
                clean_attrs.append((name, "_blank" if name == "target" else "noreferrer noopener"))
                continue
            clean_attrs.append((name, text_only(value, 160)))
        if tag == "img":
            existing_attr_names = {name for name, _value in clean_attrs}
            if "loading" not in existing_attr_names:
                clean_attrs.append(("loading", "lazy"))
            if "decoding" not in existing_attr_names:
                clean_attrs.append(("decoding", "async"))
        attr_html = "".join(f' {name}="{esc(value)}"' for name, value in clean_attrs)
        self.parts.append(f"<{tag}{attr_html}>")
        if tag not in _VOID_TAGS:
            self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"script", "style", "iframe", "object", "embed", "form"} and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag not in _ALLOWED_HTML_TAGS or tag in _VOID_TAGS:
            return
        if tag in self.stack:
            while self.stack:
                current = self.stack.pop()
                self.parts.append(f"</{current}>")
                if current == tag:
                    break

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(esc(data))

    def handle_entityref(self, name: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(f"&{esc(name)};")

    def handle_charref(self, name: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(f"&#{esc(name)};")

    def close_open_tags(self) -> None:
        while self.stack:
            self.parts.append(f"</{self.stack.pop()}>")


def render_limited_html(content: Any) -> str:
    parser = _LimitedHTMLRenderer()
    parser.feed(("" if content is None else str(content))[:12000])
    parser.close_open_tags()
    return "".join(parser.parts)


def render_plain_or_limited_html(content: Any, fmt: str = "plain") -> str:
    text = "" if content is None else str(content)
    if fmt == "html":
        return render_limited_html(text)
    return "<p>" + esc(text_only(text, 12000)).replace("\n\n", "</p><p>").replace("\n", "<br>") + "</p>"
