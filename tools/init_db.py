from __future__ import annotations

import argparse

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.example_data import EXAMPLE_ROWS
from app.core.seed_data import DEMO_ROWS


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize local SQLite database for teacher site.")
    parser.add_argument("--db", default="data/site.sqlite3")
    parser.add_argument("--seed", action="store_true")
    parser.add_argument("--examples", action="store_true")
    args = parser.parse_args()
    repo = SQLiteRepository(args.db)
    if args.seed:
        for table, rows in DEMO_ROWS.items():
            for row in rows:
                if row.get("uid"):
                    repo.save(table, row)
    if args.examples:
        for table, rows in EXAMPLE_ROWS.items():
            for row in rows:
                if row.get("uid"):
                    repo.save(table, row)
    print(f"Initialized {args.db}")


if __name__ == "__main__":
    main()
