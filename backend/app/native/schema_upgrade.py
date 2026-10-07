"""Automatic exact-baseline upgrade with stopped-writer lock and SQLite backup."""
import sqlite3,os,secrets
from contextlib import closing
from .locking import RuntimeLock

def migrate(db):
    from site_sync.integration.migration import definitions,statements
    if db.kind!='teacher' or not db.path.is_file():raise ValueError('Existing teacher database required')
    with RuntimeLock(db.path), closing(db.connect()) as c:
        def schema():return dict(c.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"))
        before=schema()
        if before==definitions('teacher.json'):db.verify(c);return {'upgraded':False,'schema':'current'}
        if before!=definitions('teacher-v0.15.160.json'):raise ValueError('Unknown schema: only exact v0.15.160 or v0.16.001 supported; database preserved')
        if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or c.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Database integrity failed')
        backup=db.path.with_name(db.path.name+'.before-v0.16.001-'+secrets.token_hex(4)+'.sqlite3')
        fd=os.open(backup,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
        with closing(sqlite3.connect(backup)) as target:c.backup(target)
        try:
            c.execute('BEGIN IMMEDIATE')
            if schema()!=before:raise ValueError('Schema changed during upgrade')
            for sql in statements():c.execute(sql)
            db.verify(c);c.commit()
        except BaseException:c.rollback();raise
        return {'upgraded':True,'backup':str(backup),'schema':'current','old_sync_tasks':'retired; retained in backup'}
