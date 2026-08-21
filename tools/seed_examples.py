from __future__ import annotations

import argparse

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.example_data import EXAMPLE_ROWS


def main() -> None:
    parser = argparse.ArgumentParser(description="Insert richer example content into the teacher site database.")
    parser.add_argument("--db", default="data/site.sqlite3")
    args = parser.parse_args()
    repo = SQLiteRepository(args.db)
    total = 0
    for table, rows in EXAMPLE_ROWS.items():
        for row in rows:
            repo.save(table, row)
            total += 1
        print(f"{table}: {len(rows)}")
    print(f"inserted_or_updated: {total}")


if __name__ == "__main__":
    main()
