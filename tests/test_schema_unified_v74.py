"""One installer, every supported predecessor, transactional rollback and Worker packaging."""
import json
import sqlite3
from contextlib import closing
from pathlib import Path
import pytest
from backend.app.native.database import Database,SCHEMA,ROOT
from backend.app.native.schema_sources import initialization_sql,INITIAL_SCHEMA
from backend.app.native.schema_migrations import SUPPORTED
from backend.app.native.schema_upgrade import migrate


def predecessor(path,version):
    snapshot=json.loads((SCHEMA/f'teacher-v{version}.json').read_text(encoding='utf-8'))
    with closing(sqlite3.connect(path)) as c,c:
        for obj in snapshot['objects']:c.execute(obj['sql'])
        c.execute("INSERT INTO site_settings(uid,site_name,is_active) VALUES ('keep-site','Original site',1)")
        c.execute("INSERT INTO students(uid,name,visibility) VALUES ('keep-student','Original student','public')")
    return {o['name']:o['sql'] for o in snapshot['objects']}


def schema(c):
    return dict(c.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"))


def test_only_one_source_sql_and_current_fresh_schema(tmp_path):
    files=[p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*.sql') if not any(x in p.parts for x in ('.worker','.transfer-worker','.venv','node_modules'))]
    assert files==['database/schema.sql']
    assert INITIAL_SCHEMA==ROOT/'database/schema.sql'
    db=Database(tmp_path/'fresh.sqlite');db.initialize();db.initialize()
    assert db.verify()=={'tables':45,'schema':'exact'}
    with closing(db.connect()) as c:
        assert c.execute('SELECT count(*) FROM auth_users').fetchone()[0]==0
    with pytest.raises(ValueError,match='Unknown database kind'):initialization_sql('../teacher')


@pytest.mark.parametrize('version',SUPPORTED)
def test_every_predecessor_preserves_records_backup_and_repeatability(tmp_path,version):
    path=tmp_path/'legacy.sqlite';old=predecessor(path,version);db=Database(path)
    result=migrate(db);assert result['upgraded'] is True
    assert db.verify()['tables']==45
    with closing(db.connect()) as c:
        assert c.execute("SELECT name FROM students WHERE uid='keep-student'").fetchone()[0]=='Original student'
        assert c.execute("SELECT site_name FROM site_settings WHERE uid='keep-site'").fetchone()[0]=='Original site'
    with closing(sqlite3.connect(result['backup'])) as c:
        assert schema(c)==old
        assert c.execute("SELECT name FROM students WHERE uid='keep-student'").fetchone()[0]=='Original student'
    assert migrate(db)=={'upgraded':False,'schema':'current'}


def test_data_conversion_failure_rolls_back_ddl_and_data(tmp_path,monkeypatch):
    from transfer.backend import chunks
    path=tmp_path/'legacy.sqlite';old=predecessor(path,'0.15.65')
    def fail(c):
        c.execute("UPDATE students SET name='Must roll back'")
        raise ValueError('synthetic conversion failure')
    monkeypatch.setattr(chunks,'index_legacy',fail)
    with pytest.raises(ValueError,match='synthetic conversion failure'):migrate(Database(path))
    with closing(sqlite3.connect(path)) as c:
        assert schema(c)==old
        assert c.execute("SELECT name FROM students WHERE uid='keep-student'").fetchone()[0]=='Original student'
    assert path.with_name(path.name+'.before-v0.15.67.sqlite3').is_file()


def test_unknown_structure_is_not_changed_or_backed_up(tmp_path):
    path=tmp_path/'unknown.sqlite'
    with closing(sqlite3.connect(path)) as c:c.execute('CREATE TABLE custom(value TEXT)')
    with pytest.raises(ValueError,match='Unknown schema'):migrate(Database(path))
    with closing(sqlite3.connect(path)) as c:assert list(schema(c))==['custom']
    assert not list(tmp_path.glob('*.before-*'))


@pytest.mark.parametrize('transfer',[False,True])
def test_worker_package_has_one_generated_installer_and_preserves_schema(tmp_path,monkeypatch,transfer):
    import shutil
    from deploy.shared import worker_package
    stage=tmp_path/'source';stage.mkdir()
    for name in ('backend','frontend','database','deploy','transfer'):
        shutil.copytree(ROOT/name,stage/name,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    monkeypatch.setattr(worker_package,'ROOT',stage)
    args=['--database-id','00000000-0000-0000-0000-000000000000','--origin','https://example.org','--bucket','test-bucket']
    if transfer:args+=['--teacher-origin','https://example.org','--grant-uid','test-admin']
    out=worker_package.prepare(transfer,args)
    assert [p.relative_to(out).as_posix() for p in out.rglob('*.sql')]==['initialize.sql']
    with closing(sqlite3.connect(':memory:')) as c:
        c.executescript((out/'initialize.sql').read_text(encoding='utf-8'))
        expected=json.loads((SCHEMA/('transfer.json' if transfer else 'teacher.json')).read_text())
        assert schema(c)=={o['name']:o['sql'] for o in expected['objects']}
    if not transfer:
        plan=json.loads((out/'migration-plan.json').read_text())
        assert set(plan['predecessors'])==set(SUPPORTED)
        for version,statements in plan['predecessors'].items():
            path=tmp_path/('d1-'+version+'.sqlite');predecessor(path,version)
            with closing(sqlite3.connect(path)) as c,c:
                for statement in statements:c.execute(statement)
            assert Database(path).verify()['tables']==45


def test_development_reset_creates_fresh_site_without_backup_or_touching_other_files(tmp_path):
    path=tmp_path/'development.sqlite';db=Database(path);db.initialize()
    with closing(db.connect()) as c,c:
        c.execute("INSERT INTO students(uid,name) VALUES ('old-dev','Previous development student')")
    media=tmp_path/'media.txt';media.write_text('keep media')
    db.initialize(reset=True)
    assert db.verify()['tables']==45
    with closing(db.connect()) as c:
        assert c.execute('SELECT count(*) FROM students').fetchone()[0]==0
        assert c.execute('SELECT count(*) FROM auth_users').fetchone()[0]==0
    assert not list(tmp_path.glob('*.before-*'))
    assert media.read_text()=='keep media'
