from __future__ import annotations

import argparse
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def resolve_path(value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else ROOT / path


def backup_database(db_path: Path) -> Path:
    backup_path = db_path.with_suffix(f"{db_path.suffix}.bak.{datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(db_path, backup_path)
    return backup_path


def apply_migration(db_path: Path, sql_path: Path, dry_run: bool = False, no_backup: bool = False) -> None:
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")
    if not sql_path.exists():
        raise FileNotFoundError(f"Migration SQL not found: {sql_path}")
    sql = sql_path.read_text(encoding="utf-8").strip()
    if not sql:
        raise ValueError(f"Migration SQL is empty: {sql_path}")
    if dry_run:
        print(f"Would apply {sql_path} to {db_path}")
        return
    if not no_backup:
        backup_path = backup_database(db_path)
        print(f"Backed up {db_path} to {backup_path}")
    with sqlite3.connect(db_path) as conn:
        conn.executescript(sql)
    print(f"Applied {sql_path} to {db_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply a SQL migration file to a SQLite database.")
    parser.add_argument("sql_file", help="SQL migration file, for example migrations/0002_add_project_role.sql")
    parser.add_argument("--db", default="data/site.sqlite3", help="SQLite database path. Defaults to data/site.sqlite3")
    parser.add_argument("--dry-run", action="store_true", help="Show what would run without changing the database.")
    parser.add_argument("--no-backup", action="store_true", help="Do not create a timestamped database backup first.")
    args = parser.parse_args()
    try:
        apply_migration(resolve_path(args.db), resolve_path(args.sql_file), args.dry_run, args.no_backup)
    except sqlite3.OperationalError as exc:
        if "duplicate column name" in str(exc).lower():
            raise SystemExit(f"Migration failed: {exc}. This usually means the migration was already applied.")
        raise


if __name__ == "__main__":
    main()
