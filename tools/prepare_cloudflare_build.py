from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app"
TARGET = ROOT / "src" / "app"


def main() -> None:
    if not SOURCE.is_dir():
        raise SystemExit(f"Missing source package: {SOURCE}")
    if TARGET.exists():
        target_resolved = TARGET.resolve()
        src_resolved = (ROOT / "src").resolve()
        target_resolved.relative_to(src_resolved)
        shutil.rmtree(TARGET)
    ignore = shutil.ignore_patterns("__pycache__", "*.pyc", "*.pyo")
    shutil.copytree(SOURCE, TARGET, ignore=ignore)
    print(f"Prepared Cloudflare Python package: {TARGET.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
