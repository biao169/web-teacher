"""One canonical SQL source, explicit migrations and guarded atomic deployment."""
from dataclasses import dataclass
import hashlib
import json
import re

CATALOG = "SELECT name,sql FROM sqlite_schema WHERE name LIKE 'sync\\_%' ESCAPE '\\' AND sql IS NOT NULL ORDER BY name"
TOKENS = re.compile(r"--[^\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|[A-Za-z_][A-Za-z_0-9]*|\d+|[^\s]", re.M)


def canonical(sql):
    return [t if t.startswith(("'", '"')) else t.lower() for t in TOKENS.findall(sql)
            if not t.startswith(('--', '/*'))]


def objects(rows):
    return {r['name']: canonical(r['sql']) for r in rows}


@dataclass(frozen=True)
class Plan:
    version: int
    source_sha256: str
    statements: tuple
    expected: dict

    @classmethod
    def compile(cls, path):
        # Build/deploy host only: SQLite is not imported by Worker plan loading.
        import sqlite3
        source = path.read_text(encoding='utf-8')
        pending = ''; statements = []
        for line in source.splitlines(keepends=True):
            pending += line
            if sqlite3.complete_statement(pending):
                statements.append(pending.strip()); pending = ''
        if pending.strip(): raise ValueError('Incomplete canonical schema SQL')
        db = sqlite3.connect(':memory:'); db.row_factory = sqlite3.Row
        try:
            db.execute('PRAGMA foreign_keys=ON')
            for statement in statements: db.execute(statement)
            version = db.execute('SELECT version FROM sync_schema WHERE singleton=1').fetchone()[0]
            expected = objects(db.execute(CATALOG))
        finally:
            db.close()
        return cls(version, hashlib.sha256(source.encode()).hexdigest(), tuple(statements), expected)

    def dump(self):
        return json.dumps(self.__dict__, ensure_ascii=False, indent=2) + '\n'

    @classmethod
    def load(cls, content):
        data = json.loads(content)
        return cls(data['version'], data['source_sha256'], tuple(data['statements']), data['expected'])


@dataclass(frozen=True)
class Migration:
    previous_version: int
    previous_objects: dict
    statements: tuple


async def ensure(adapter, plan, *, migrations=(), check_only=False):
    current_rows = await adapter.query(CATALOG)
    current = objects(current_rows)
    if not current:
        if check_only: raise ValueError('Sync schema has not been initialized')
        existing = await adapter.query("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'")
        backup = await adapter.backup() if existing else None
        # No IF NOT EXISTS: concurrent initialization is serialized; a losing
        # batch rolls back and the deployment can safely be retried.
        await adapter.batch([(s, ()) for s in plan.statements])
        action = 'initialized'
    else:
        if 'sync_schema' not in current:
            raise ValueError('Unknown sync tables: automatic conversion refused; data preserved')
        meta = await adapter.query('SELECT singleton,version,maintenance FROM sync_schema')
        if len(meta) != 1 or meta[0]['singleton'] != 1 or meta[0]['maintenance']:
            raise ValueError('Invalid or busy schema metadata')
        version = meta[0]['version']
        if version == plan.version and current == plan.expected:
            return {'action': 'unchanged', 'version': version, 'backup': None}
        if check_only: raise ValueError('Schema check failed')
        candidates = [m for m in migrations if m.previous_version == version and m.previous_objects == current]
        if len(candidates) != 1 or version >= plan.version:
            raise ValueError('Unknown or changed sync schema; no data modified')
        migration = candidates[0]
        backup = await adapter.backup()
        # One transaction provides migration exclusivity. Other runtime writers
        # must check schema version; no network wait inside this batch.
        guard = ('UPDATE sync_schema SET version=CASE WHEN version=? AND maintenance=0 THEN version ELSE -1 END,maintenance=1 WHERE singleton=1', (version,))
        finish = ('UPDATE sync_schema SET version=?,maintenance=0 WHERE singleton=1', (plan.version,))
        await adapter.batch([guard, *[(s, ()) for s in migration.statements], finish])
        action = 'upgraded'
    actual = objects(await adapter.query(CATALOG))
    meta = await adapter.query('SELECT version,maintenance FROM sync_schema WHERE singleton=1')
    if actual != plan.expected or meta != [{'version': plan.version, 'maintenance': 0}]:
        raise ValueError('Post-deploy verification failed; keep sync disabled and use the recovery reference')
    return {'action': action, 'version': plan.version, 'backup': backup}
