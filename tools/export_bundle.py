from __future__ import annotations

import argparse
import time

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.exporting import export_bundle


def main() -> None:
    parser = argparse.ArgumentParser(description="Export teacher site data bundle.")
    parser.add_argument("--db", default="data/site.sqlite3")
    parser.add_argument("--out", default="")
    parser.add_argument("--site-url", default="")
    args = parser.parse_args()
    out = args.out or f"exports/teacher-site-export-{time.strftime('%Y%m%d-%H%M%S')}.zip"
    repo = SQLiteRepository(args.db)
    path = export_bundle(repo, out, source_platform="ubuntu", site_url=args.site_url)
    print(path)


if __name__ == "__main__":
    main()

