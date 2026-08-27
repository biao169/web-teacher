from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from app.adapters.ubuntu.db import SQLiteRepository
from app.core.example_data import EXAMPLE_ROWS
from app.core.seed_data import DEMO_ROWS
from transfer_site.db import ensure_schema as ensure_transfer_schema


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP_SQL = ROOT / "migrations" / "0001_initial.sql"


def apply_bootstrap_sql(db_path: str) -> None:
    """Apply the consolidated schema/default configuration SQL if it exists."""
    target = Path(db_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not BOOTSTRAP_SQL.exists():
        return
    with sqlite3.connect(target) as conn:
        conn.executescript(BOOTSTRAP_SQL.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize local SQLite database for teacher site.")
    parser.add_argument("--db", default="data/site.sqlite3")
    parser.add_argument("--seed", action="store_true")
    parser.add_argument("--examples", action="store_true")
    args = parser.parse_args()
    apply_bootstrap_sql(args.db)
    repo = SQLiteRepository(args.db)
    ensure_transfer_schema(repo)
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
