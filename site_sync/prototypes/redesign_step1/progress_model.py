"""Executable design model, NOT a production repository or database initializer.

Uses only an isolated in-memory SQLite fixture. No teacher database is opened.
"""
import sqlite3
from site_sync.core.policy import recover, smaller



def fixture():
    db = sqlite3.connect(':memory:')
    # Test fixture only. The product retains database/schema.sql as its sole
    # initializer; these synthetic tables are not a proposed production schema.
    db.executescript('''
      CREATE TABLE job(id INTEGER PRIMARY KEY, seq INTEGER, offset INTEGER,
                       lease TEXT, authorized INTEGER, source TEXT);
      CREATE TABLE piece(job INTEGER, start INTEGER, body BLOB,
                         PRIMARY KEY(job,start));
      INSERT INTO job VALUES(1,0,0,'lease-1',1,'source-1');
    ''')
    return db


def commit_piece(db, start, body, *, lease='lease-1', source='source-1',
                 interrupt=None):
    """CAS-like guarded append + progress in one SQLite transaction.

    interrupt='before_commit' emulates a rollback; 'after_commit' emulates a
    lost response. The real D1 batch/guard equivalent remains a step-2 gate.
    """
    if start < 0 or not isinstance(body, bytes) or not 0 < len(body) <= 65536:
        raise ValueError('invalid piece')
    with db:
        seq, offset, owner, allowed, version = db.execute(
            'SELECT seq,offset,lease,authorized,source FROM job WHERE id=1'
        ).fetchone()
        if owner != lease or not allowed or source != version:
            raise PermissionError('stale lease, revoked grant or changed source')
        old = db.execute('SELECT body FROM piece WHERE job=1 AND start=?',
                         (start,)).fetchone()
        if old:
            if old[0] != body:
                raise ValueError('conflicting replay')
            return seq
        if offset != start:
            raise ValueError('gap or overlap')
        db.execute('INSERT INTO piece VALUES(1,?,?)', (start, body))
        db.execute('UPDATE job SET seq=seq+1,offset=? WHERE id=1',
                   (start + len(body),))
        if interrupt == 'before_commit':
            raise RuntimeError('interrupted before commit')
    if interrupt == 'after_commit':
        raise RuntimeError('response lost after commit')
    return seq + 1
