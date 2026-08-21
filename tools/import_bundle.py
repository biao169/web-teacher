from __future__ import annotations

import argparse

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.importing import import_bundle


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a teacher site export bundle into SQLite.")
    parser.add_argument("source")
    parser.add_argument("--db", default="data/site.sqlite3")
    args = parser.parse_args()
    repo = SQLiteRepository(args.db)
    result = import_bundle(repo, args.source)
    for table, count in result.items():
        print(f"{table}: {count}")


if __name__ == "__main__":
    main()

