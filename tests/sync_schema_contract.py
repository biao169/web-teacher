"""Migration assertions for the selected branch's only supported predecessor."""
import json,sqlite3
from pathlib import Path
import pytest
from backend.app.native.database import Database,SCHEMA
from backend.app.native.schema_upgrade import migrate

def selected(path):
    with sqlite3.connect(path) as c:
        for obj in json.loads((SCHEMA/'teacher-v0.15.160.json').read_text())['objects']:c.execute(obj['sql'])
        c.execute("INSERT INTO profiles(uid,name,bio,google_scholar_value) VALUES('keep','原有教师','原有简介',12)")
    return Database(path)
def assert_upgrade(tmp_path):
    db=selected(tmp_path/'selected.sqlite3');before=db.path.read_bytes()
    result=migrate(db);assert result['upgraded']
    with sqlite3.connect(result['backup']) as backup, sqlite3.connect(':memory:') as original:
        original.deserialize(before)
        assert list(backup.iterdump())==list(original.iterdump())
    db.initialize()
    with db.connect() as c:
        assert tuple(c.execute('SELECT name,bio,google_scholar_value FROM profiles').fetchone())==('原有教师','原有简介',12)
    assert migrate(db)=={'upgraded':False,'schema':'current'}
def assert_rollback(tmp_path,monkeypatch):
    db=selected(tmp_path/'selected.sqlite3');before=db.path.read_bytes()
    monkeypatch.setattr(db,'verify',lambda *a:(_ for _ in ()).throw(ValueError('synthetic post-upgrade failure')))
    with pytest.raises(ValueError,match='synthetic post-upgrade failure'):migrate(db)
    assert db.path.read_bytes()==before
    assert len(list(tmp_path.glob('*.before-v0.16.022-*')))==1

def assert_unsupported(tmp_path,version):
    path=tmp_path/'unsupported.sqlite3'
    with sqlite3.connect(path) as c:
        for obj in json.loads((SCHEMA/('teacher-v'+version+'.json')).read_text())['objects']:c.execute(obj['sql'])
        c.execute("INSERT INTO profiles(uid,name) VALUES('keep','unchanged')")
    before=path.read_bytes()
    with pytest.raises(ValueError,match='Unknown schema'):migrate(Database(path))
    assert path.read_bytes()==before
    assert not list(tmp_path.glob('*.before-*'))
