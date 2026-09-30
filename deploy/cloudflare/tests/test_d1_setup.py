"""Exercise initialization/redeployment against real SQLite catalogs, mock transport only."""
import json
from pathlib import Path
import sqlite3
import sys
from types import SimpleNamespace
from unittest.mock import patch
import pytest

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import d1_setup as d1


@pytest.fixture
def database(tmp_path):
    sql = (HERE.parents[1]/'database/schema.sql').read_text()
    (tmp_path/'initialize.sql').write_text(sql)
    local, remote = sqlite3.connect(':memory:'), sqlite3.connect(':memory:')
    for db in (local, remote):
        db.row_factory = sqlite3.Row
    calls = []
    def query(args, cwd, env):
        calls.append(args)
        db = remote if '--remote' in args else local
        if '--file' in args:
            db.executescript(Path(args[args.index('--file')+1]).read_text())
            return []
        return [dict(r) for r in db.execute(args[args.index('--command')+1])]
    config = dict(name='teacher', dbname='teacher-db', database='12345678-1234-1234-1234-123456789abc')
    def run(publish=True, mode='auto'):
        # Each deployment uses a fresh local reference/workspace.
        for row in list(local.execute("select name from sqlite_schema where type='table' and name not like 'sqlite_%'")):
            local.execute('DROP TABLE "'+row[0]+'"')
        return d1.setup('node', Path('wrangler.js'), tmp_path, {'TEACHER_D1_INIT': mode}, config,
                        lambda *a, **kw: None, publish=publish, query=query)
    yield remote, calls, run, sql
    local.close(); remote.close()


def test_empty_initializes_and_redeploy_preserves_records(database):
    remote, calls, run, _ = database
    run()
    remote.execute("INSERT INTO _cms_migrations(name,sha256) VALUES ('keep','abc')")
    run()
    assert remote.execute('select name from _cms_migrations').fetchone()[0] == 'keep'
    assert sum('--remote' in c and '--file' in c for c in calls) == 1


@pytest.mark.parametrize('ddl', ['DROP TABLE transfer_codes', 'DROP INDEX transfer_code_expiry',
                                 'ALTER TABLE news ADD COLUMN surprise TEXT',
                                 'CREATE TABLE unrelated(id INTEGER)'])
def test_schema_mismatch_never_reinitializes(database, ddl):
    remote, calls, run, sql = database
    remote.executescript(sql)
    remote.execute(ddl)
    with pytest.raises(ValueError, match='Schema mismatch'):
        run()
    assert not any('--remote' in c and '--file' in c for c in calls)


def test_check_mode_empty_read_only(database):
    _, calls, run, _ = database
    with pytest.raises(ValueError, match='Empty D1'):
        run(mode='check')
    assert not any('--remote' in c and '--file' in c for c in calls)


def test_bundle_never_accesses_remote(database):
    _, calls, run, _ = database
    run(publish=False)
    assert not any('--remote' in c for c in calls)


def test_platform_tables_do_not_trigger_initialization_block(database):
    remote, _, run, _ = database
    remote.executescript('CREATE TABLE _cf_KV(k TEXT); CREATE TABLE d1_migrations(id INTEGER);')
    run()
    assert remote.execute("select count(*) from sqlite_schema where name='transfer_codes'").fetchone()[0] == 1


def test_invalid_mode(database):
    _, calls, run, _ = database
    with pytest.raises(ValueError, match='auto or check'):
        run(mode='reset')
    assert not calls


@pytest.mark.parametrize('payload', ['not json', '[]', '[{"success":false}]', '{}'])
def test_malformed_response_not_treated_as_empty(payload):
    with patch.object(d1.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=payload)):
        with pytest.raises(ValueError, match='Invalid D1 JSON'):
            d1.execute_json([], None, {})


def test_permission_error_not_treated_as_empty():
    with patch.object(d1.subprocess, 'run', return_value=SimpleNamespace(returncode=1, stdout='', stderr='permission denied')):
        with pytest.raises(ValueError, match='D1 Edit'):
            d1.execute_json([], None, {})


def test_compare_preserves_literal_spaces():
    assert d1.normalized("CREATE TABLE t ( x TEXT DEFAULT 'a b');") == d1.normalized("create TABLE t(x TEXT DEFAULT 'a b')")
    assert d1.normalized("DEFAULT 'a b'") != d1.normalized("DEFAULT 'ab'")
