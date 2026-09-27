"""Explicit stopped-service additive upgrades with exact predecessors and a snapshot."""
import json,sqlite3,os
from contextlib import closing
from .database import SCHEMA
from .locking import RuntimeLock

def migrate(db):
    if db.kind!='teacher' or not db.path.is_file():raise ValueError('Existing teacher database required')
    with RuntimeLock(db.path), closing(db.connect()) as c:
        def schema():return {v['name']:v['sql'] for v in c.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'")}
        def expected(name):return {o['name']:o['sql'] for o in json.loads((SCHEMA/name).read_text())['objects']}
        original=schema()
        if original==expected('teacher.json'):db.verify(c);return {'upgraded':False,'schema':'current'}
        from .schema_migrations import SUPPORTED,apply
        version=next((v for v in SUPPORTED if original==expected('teacher-v'+v+'.json')),None)
        if version is None:raise ValueError('Unknown schema; no changes made. Inspect before upgrading.')
        if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or c.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Database integrity check failed')
        backup=db.path.with_name(db.path.name+'.before-v0.15.67.sqlite3')
        fd=os.open(backup,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
        try:
            with closing(sqlite3.connect(backup)) as target:c.backup(target)
        except Exception:
            backup.unlink(missing_ok=True);raise
        try:
            c.execute('BEGIN IMMEDIATE')
            if schema()!=original:raise ValueError('Schema changed during upgrade; no changes made')
            apply(c,version)
            db.verify(c);c.commit()
        except Exception:c.rollback();raise
        return {'upgraded':True,'backup':str(backup),'schema':'current','historical_names':'unknown' if version=='0.15.37' else 'preserved'}
