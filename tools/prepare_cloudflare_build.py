from __future__ import annotations

import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app"
TARGET = ROOT / "src" / "app"
DICTIONARY_SOURCE = ROOT / "i18n_dictionary.json"
DICTIONARY_TARGET = ROOT / "src" / "i18n_dictionary.json"


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
    if DICTIONARY_SOURCE.is_file():
        DICTIONARY_TARGET.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(DICTIONARY_SOURCE, DICTIONARY_TARGET)
        print(f"Prepared bundled i18n dictionary: {DICTIONARY_TARGET.relative_to(ROOT).as_posix()}")
    print(f"Prepared Cloudflare Python package: {TARGET.relative_to(ROOT).as_posix()}")


if __name__ == "__main__":
    main()
