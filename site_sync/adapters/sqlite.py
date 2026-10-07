"""SQLite implementation of ordered atomic batches, used locally and at deploy."""
import os
from pathlib import Path
import sqlite3
from uuid import uuid4


class SQLite:
    def __init__(self, path=':memory:'):
        self.path = str(path)
        self.connection = sqlite3.connect(self.path, isolation_level=None, timeout=2)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute('PRAGMA foreign_keys=ON')
        self.connection.execute('PRAGMA busy_timeout=2000')

    async def query(self, sql, args=()):
        return [dict(row) for row in self.connection.execute(sql, args)]

    async def batch(self, statements):
        self.connection.execute('BEGIN IMMEDIATE')
        try:
            results = []
            for sql, args in statements:
                cursor = self.connection.execute(sql, args)
                rows = [dict(row) for row in cursor] if cursor.description else []
                results.append({'success': True, 'results': rows, 'meta': {'changes': max(cursor.rowcount, 0)}})
            self.connection.execute('COMMIT')
            return results
        except BaseException:
            self.connection.execute('ROLLBACK')
            raise

    async def backup(self):
        if self.path == ':memory:':
            copy = sqlite3.connect(':memory:')
            self.connection.backup(copy)
            if hasattr(self, '_backup'): self._backup.close()
            self._backup = copy
            return 'in-memory-test-backup'
        target = Path(self.path).with_name(Path(self.path).name + '.before-sync-' + uuid4().hex + '.sqlite3')
        fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
        try:
            with sqlite3.connect(target) as other:
                self.connection.backup(other)
        except BaseException:
            target.unlink(missing_ok=True)
            raise
        return str(target)

    def close(self):
        self.connection.close()
        if hasattr(self, '_backup'): self._backup.close()
