"""One current installer; immutable snapshots serve legacy compatibility and verification."""
import json
import sqlite3
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = ROOT / 'database/native'
INITIAL_SCHEMA = ROOT / 'database/schema.sql'


def initialization_sql(kind='teacher'):
    """Current shared database uses schema.sql; old standalone fixtures use their snapshot.

    The transfer branch preserves old importer/Worker compatibility. It is never used
    to initialize a second database by the integrated Windows/Linux website.
    """
    if kind == 'teacher':
        return INITIAL_SCHEMA.read_text(encoding='utf-8')
    if kind == 'transfer':
        objects = json.loads((SCHEMA / 'transfer.json').read_text(encoding='utf-8'))['objects']
        return '\n\n'.join(item['sql'].rstrip(';') + ';' for item in objects)
    raise ValueError('Unknown database kind')


def current_objects():
    """Read exact executable DDL from the sole installer, not another maintained SQL copy."""
    with closing(sqlite3.connect(':memory:')) as connection:
        connection.executescript(initialization_sql())
        return dict(connection.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid"))
