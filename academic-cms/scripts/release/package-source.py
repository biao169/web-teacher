#!/usr/bin/env python3
"""Create a verified source snapshot. This command never certifies a production release."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

EXCLUDED = {"node_modules", ".nuxt", ".output", ".tmp", ".git", ".wrangler", "__pycache__", ".cache", "coverage", "test-results", "playwright-report", "data", "reports"}
REQUIRED = (
    "package.json", "nuxt.config.ts", "app/app.vue", "app/pages/zh/index.vue",
    "server/services/public/public-home-service.ts", "server/services/auth/authentication-service.ts",
    "server/services/media/media-service.ts", "server/media/store.ts", "app/pages/admin/media/index.vue",
    "db/repository.ts", "db/runtime/node.ts", "db/runtime/cloudflare.ts",
    "migrations/0001_initial.sql", "migrations/0005_public_interactions_and_demo_seed.sql",
    "tests/release/native-services.spec.mjs", "docs/09_后台对象编辑统一设计.md",
)
MANIFEST = "reports/stage10b_manifest.sha256"
PRIVATE_KEY = re.compile(rb"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def safe_relative(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if not name or path.is_absolute() or "\\" in name or any(ord(c) < 32 for c in name) or re.match(r"^[A-Za-z]:", name):
        raise ValueError(f"Unsafe archive path: {name!r}")
    if any(part in {"..", "."} for part in name.split("/")):
        raise ValueError(f"Unsafe archive path: {name!r}")
    return path


def require_source(root: Path) -> None:
    missing = [name for name in REQUIRED if not (root / name).is_file() or not (root / name).stat().st_size]
    if missing:
        raise ValueError("Source snapshot is incomplete; reports are not source: " + ", ".join(missing))
    package = json.loads((root / "package.json").read_text(encoding="utf-8"))
    if package.get("name") != "academic-cms":
        raise ValueError("Unexpected project identity")


def enumerate_source(root: Path) -> list[Path]:
    files = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = sorted(name for name in dirs if name not in EXCLUDED and not (Path(directory) == root and name == "media"))
        for name in dirs:
            if (Path(directory) / name).is_symlink():
                raise ValueError("Directory symlink in source")
        for name in sorted(names):
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if relative == MANIFEST or name.endswith((".pyc", ".tsbuildinfo")) or name == ".build-lock":
                continue
            if name.startswith(".env") and name != ".env.example":
                raise ValueError("Live environment file is not allowed in source delivery")
            if name.startswith(".dev.vars") or name.endswith((".pem", ".key", ".p12", ".sqlite3", ".sqlite3-wal", ".sqlite3-shm", ".db", ".zip")):
                raise ValueError(f"Runtime state or archive in source delivery: {relative}")
            if path.is_symlink() or not path.is_file():
                raise ValueError(f"Non-regular file: {relative}")
            safe_relative(relative)
            if PRIVATE_KEY.search(path.read_bytes()):
                raise ValueError(f"Private key material in source: {relative}")
            files.append(path)
    return sorted(files)


def verify_protected(root: Path) -> dict[str, str]:
    provenance = json.loads((root / "reports/stage10b/input-provenance.json").read_text(encoding="utf-8"))
    protected = {
        name: digest for name, digest in provenance["protectedDocuments"].items()
        if re.match(r"0[1-4]_", name)
    }
    if len(protected) != 4:
        raise ValueError("Protected design baseline must contain exactly docs 01 through 04")
    for name, digest in protected.items():
        path = root / "docs" / name
        if sha256(path.read_bytes()) != digest:
            raise ValueError(f"Protected design changed: {name}")
        if path.stat().st_mode & 0o222:
            raise ValueError(f"Protected design is writable: {name}")
    return protected


def verify_zip(archive: Path, expected: dict[str, str], protected: dict[str, str]) -> dict:
    with tempfile.TemporaryDirectory(prefix="cms-package-check-") as temporary, ZipFile(archive) as handle:
        if handle.testzip() is not None:
            raise ValueError("Archive CRC failed")
        entries = handle.infolist()
        names = [item.filename for item in entries]
        if len(names) != len(set(names)):
            raise ValueError("Duplicate zip entry")
        if set(names) != {"项目目录/" + name for name in [*expected, MANIFEST]}:
            raise ValueError("Archive inventory differs from manifest")
        for item in entries:
            relative = safe_relative(item.filename)
            mode = item.external_attr >> 16
            if stat.S_ISLNK(mode) or not stat.S_ISREG(mode):
                raise ValueError("Archive contains a non-regular entry")
            target = Path(temporary).joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(handle.read(item))
            target.chmod(stat.S_IMODE(mode))
        extracted = Path(temporary) / "项目目录"
        require_source(extracted)
        for name, digest in expected.items():
            if sha256((extracted / name).read_bytes()) != digest:
                raise ValueError(f"Extracted hash mismatch: {name}")
        for name, digest in protected.items():
            path = extracted / "docs" / name
            if sha256(path.read_bytes()) != digest:
                raise ValueError("Extracted protected document mismatch")
            if path.stat().st_mode & 0o222:
                raise ValueError("Extracted protection mode mismatch")
    return {"status": "passed_source_package_only", "archiveEntries": len(expected) + 1, "manifestFiles": len(expected), "independentExtraction": True, "sourcePresent": True, "protectedDocuments": len(protected), "symbolicLinks": 0, "productionRelease": False}


def build_archive(root: Path, output: Path) -> dict:
    root, output = root.resolve(), output.resolve()
    if output == root or root in output.parents:
        raise ValueError("Write the zip outside the source directory")
    require_source(root)
    protected = verify_protected(root)
    files = enumerate_source(root)
    expected = {path.relative_to(root).as_posix(): sha256(path.read_bytes()) for path in files}
    manifest = root / MANIFEST
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text("".join(f"{digest}  {name}\n" for name, digest in sorted(expected.items())), encoding="utf-8")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + ".part")
    try:
        with ZipFile(temporary, "w", compression=ZIP_DEFLATED, compresslevel=9) as handle:
            for path in [*files, manifest]:
                name = "项目目录/" + path.relative_to(root).as_posix()
                entry = ZipInfo.from_file(path, name)
                entry.create_system = 3
                entry.compress_type = ZIP_DEFLATED
                entry.external_attr = (stat.S_IFREG | stat.S_IMODE(path.stat().st_mode)) << 16
                handle.writestr(entry, path.read_bytes())
        validation = verify_zip(temporary, expected, protected)
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()
    digest = sha256(output.read_bytes())
    output.with_suffix(output.suffix + ".sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
    validation.update({"archive": output.name, "bytes": output.stat().st_size, "sha256": digest, "scope": "stage6 source + stage10B reproducibility and SSR hardening"})
    output.with_name(output.stem + "-package-validation.json").write_text(json.dumps(validation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return validation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    print(json.dumps(build_archive(arguments.project, arguments.output), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
