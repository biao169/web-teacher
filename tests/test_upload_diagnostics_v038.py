import asyncio,json
from pathlib import Path
from types import SimpleNamespace
import pytest
from backend.app.native.media import Media
from backend.app.ports.operations import request_context,current,stage

class SQL:
    def __init__(self,release_fail=False):self.released=False;self.release_fail=release_fail
    async def query(self,sql,args=()):
        if 'upload_max_size' in sql:return []
        if 'SELECT 1 FROM media_assets' in sql:return []
        return [{'n':0}]
    async def batch(self,statements):
        if len(statements)==1 and 'DELETE FROM admin_mutation_guards' in statements[0][0]:
            self.released=True
            if self.release_fail:raise RuntimeError('secret-cleanup')
        return []
class Auth:
    def require(self,*args):pass
    def guard(self,*args):return 'g',('SELECT 1',())
class Content:
    sql=None
    def audit(self,*args):return ('SELECT 1',())
class Request:
    async def stream(self):yield (Path(__file__).parent/'fixtures/media/sample.png').read_bytes()
class Store:
    def __init__(self,fail=True):self.fail=fail;self.deleted=False
    async def put(self,*args):
        if self.fail:raise TypeError('secret-upload')
    async def delete(self,*args):self.deleted=True;raise RuntimeError('secret-object')

def test_upload_primary_survives_both_cleanup_errors_and_context_resets(capsys):
    sql=SQL(True);store=Store();m=Media(sql,Auth(),Content(),store,'local')
    with request_context(request_id='a'*32,colo='MXP',component='main-site'):
        with pytest.raises(TypeError,match='secret-upload'):asyncio.run(m.upload({},'file.png',Request()))
    assert sql.released and store.deleted and current()=={}
    output=capsys.readouterr().out
    assert 'secret-upload' not in output and 'secret-cleanup' not in output
    rows=[json.loads(x) for x in output.splitlines()]
    stages={r.get('stage') for r in rows}
    assert {'media-read-body','media-storage-put','media-cleanup-object','media-release-reservation'}<=stages
    assert all(r['request_id']=='a'*32 for r in rows)
    assert any(r['event']=='MEDIA-CLEANUP-FAILED' and r['primary_error']=='TypeError' for r in rows)
    with request_context(request_id='b'*32):
        with stage('homepage-test'):pass
    assert 'a'*32 not in capsys.readouterr().out

def test_successful_upload_logs_register_and_does_not_delete(capsys):
    sql=SQL();store=Store(False);m=Media(sql,Auth(),Content(),store,'local')
    assert len(asyncio.run(m.upload({},'file.png',Request())))==32
    assert sql.released and not store.deleted
    rows=[json.loads(x) for x in capsys.readouterr().out.splitlines()]
    assert any(r['stage']=='media-register' and r['event']=='OPERATION-END' for r in rows)
    assert not any(r['event']=='OPERATION-ERROR' for r in rows)

def test_cleanup_only_failure_is_not_hidden(capsys):
    sql=SQL(True);store=Store(False)
    with pytest.raises(RuntimeError,match='secret-cleanup'):
        asyncio.run(Media(sql,Auth(),Content(),store,'local').upload({},'file.png',Request()))
    assert '"committed":true' in capsys.readouterr().out
