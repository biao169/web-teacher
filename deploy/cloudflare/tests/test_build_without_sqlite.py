"""Reproduce the cloud interpreter failure in a fresh Python process."""
import json
import os
from pathlib import Path
import subprocess
import sys
import pytest
ROOT=Path(__file__).resolve().parents[3]


def prepare_with_blocked_sqlite(out, extra=(), missing='_sqlite3', transfer=False):
    script='''
import importlib.abc,runpy,sys
missing=sys.argv[1]
class MissingSQLite(importlib.abc.MetaPathFinder):
    def find_spec(self,fullname,path=None,target=None):
        if fullname==missing:
            raise ModuleNotFoundError("No module named '"+fullname+"'",name=fullname)
sys.meta_path.insert(0,MissingSQLite())
entry=sys.argv[2];sys.argv=[entry,*sys.argv[3:]]
runpy.run_path(entry,run_name='__main__')
assert 'sqlite3' not in sys.modules and '_sqlite3' not in sys.modules
'''
    entry=ROOT/('transfer/deploy/prepare_worker.py' if transfer else 'deploy/cloudflare/prepare.py')
    args=['--output',str(out),'--database-id','12345678-1234-1234-1234-123456789abc',
          '--origin','https://test-teacher.workers.dev','--bucket','teacher-media']
    if transfer:args+=['--teacher-origin','https://test-teacher.workers.dev','--grant-uid','test-admin']
    return subprocess.run([sys.executable,'-B','-c',script,missing,str(entry),*args,*extra],
                          cwd=ROOT,text=True,capture_output=True,timeout=30)


@pytest.mark.parametrize('missing',['_sqlite3','sqlite3'])
def test_cloud_prepare_has_no_sqlite_dependency(tmp_path,missing):
    out=tmp_path/'worker';r=prepare_with_blocked_sqlite(out,missing=missing)
    assert r.returncode==0,r.stdout+r.stderr
    assert (out/'initialize.sql').read_bytes()==(ROOT/'database/schema.sql').read_bytes()
    assert not (out/'migration-plan.json').exists()
    assert json.loads((out/'wrangler.json').read_text())['d1_databases'][0]['binding']=='DB'


def test_selected_baseline_plan_has_no_sqlite_runtime_dependency(tmp_path):
    out=tmp_path/'worker';r=prepare_with_blocked_sqlite(out,['--migration-plan'])
    assert r.returncode==0,r.stderr
    plan=json.loads((out/'migration-plan.json').read_text())
    assert list(plan['predecessors'])==['0.15.160']
    assert plan['predecessors']['0.15.160']


def test_legacy_transfer_packaging_without_sqlite(tmp_path):
    out=tmp_path/'worker';r=prepare_with_blocked_sqlite(out,transfer=True)
    assert r.returncode==0,r.stdout+r.stderr
    assert not (out/'migration-plan.json').exists()
    assert 'TRANSFER_TEMPLATES' in (out/'generated_resources.py').read_text()


def test_opt_in_migration_plan_preserves_existing_content(tmp_path):
    from deploy.shared.worker_package import prepare
    from backend.app.native.schema_migrations import SUPPORTED,statements_for
    out=prepare(False,['--output',str(tmp_path/'worker'),'--database-id','12345678-1234-1234-1234-123456789abc',
        '--origin','https://test-teacher.workers.dev','--bucket','teacher-media','--migration-plan'],migration_plan=False)
    assert json.loads((out/'migration-plan.json').read_text())['predecessors']=={v:statements_for(v) for v in SUPPORTED}
