"""Isolated regression for prepackaged media and useful remote diagnostics."""
import asyncio,json,shutil,subprocess,sys
from pathlib import Path
from types import SimpleNamespace
import pytest
from deploy.linux import tweb
from backend.app.native import site_sync_transport as transport,site_sync_diagnostics as diag
from backend.app.native.catalog import Error
from tests.test_site_sync_v121 import pair
ROOT=Path(__file__).resolve().parents[1]

def put(root,name,value=b'media'):
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(value);return p

def test_seed_media_is_idempotent_and_retains_contents(tmp_path):
 source=tmp_path/'source';dest=tmp_path/'installed/data/media'
 put(source,'data/media/group/photo.jpg');put(source,'data/document.pdf')
 put(source,'transfer-data/cache/.gitkeep',b'')
 created=tweb.import_seed_media(source,dest)
 assert len(created)==2 and (dest/'group/photo.jpg').read_bytes()==b'media'
 assert (dest/'document.pdf').read_bytes()==b'media'
 assert not (source/'data').exists() and not (source/'transfer-data').exists()
 put(source,'data/media/group/photo.jpg')
 assert tweb.import_seed_media(source,dest)==[]

@pytest.mark.parametrize('name',['data/database/site.sqlite3','data/cache/x.jpg','data/media/.env','data/readme.txt','transfer-data/files/a.jpg'])
def test_runtime_data_is_rejected(tmp_path,name):
 put(tmp_path,name)
 with pytest.raises(ValueError):tweb.seed_media(tmp_path)

def test_conflict_and_symlink_never_overwrite(tmp_path):
 source=tmp_path/'s';dest=tmp_path/'d'
 put(source,'data/media/a.jpg',b'new');put(source,'data/media/b.jpg',b'new');put(dest,'b.jpg',b'old')
 with pytest.raises(ValueError,match='冲突'):tweb.import_seed_media(source,dest)
 assert not (dest/'a.jpg').exists() and (dest/'b.jpg').read_bytes()==b'old'
 (source/'data/media/a.jpg').unlink();(source/'data/media/a.jpg').symlink_to(dest/'b.jpg')
 with pytest.raises(ValueError,match='符号链接'):tweb.seed_media(source)

def test_cloudflare_platform_problem_response():
 data={'cloudflare_error':True,'error_code':1102,'title':'Worker exceeded resource limits','detail':'resource error','ray_id':'abc123-ORD'}
 with pytest.raises(Error) as caught:transport.response_json(503,json.dumps(data).encode())
 assert 'CPU或内存' in caught.value.message and 'abc123-ORD' in caught.value.message
 with pytest.raises(Error) as caught:transport.response_json(500,b'Internal Server Error',{'CF-Ray':'ray-ORD','cf-error-type':'1101'})
 assert '未处理异常' in caught.value.message and 'ray-ORD' in caught.value.message
 with pytest.raises(Error) as caught:transport.response_json(404,b'not found')
 assert '未进入目标Worker' in caught.value.message

def test_safe_server_diagnostic(caplog):
 with pytest.raises(Error) as caught:
  with diag.operation('peer:page'):raise RuntimeError('secret-password SQL private text')
 assert caught.value.status==500 and '服务端诊断编号' in caught.value.message
 assert 'secret-password' not in caplog.text+caught.value.message
 assert 'peer:page' in caplog.text and 'RuntimeError' in caplog.text
 with pytest.raises(Error) as caught:
  with diag.operation('peer:hello'):raise RuntimeError('D1_ERROR: no such table: private')
 assert caught.value.code=='sync_schema_missing'

def test_peer_error_is_structured_http_500(pair,monkeypatch):
 from backend.app.native import site_sync as core
 api,_,ra,rb,a,b,network=pair
 async def broken(*args):raise RuntimeError('private runtime problem')
 monkeypatch.setattr(core,'revision_page',broken)
 job=api('start',{'direction':'pull','scopes':['students']})
 result=api('advance',{'uid':job['uid']},ok=False)
 assert result.status_code==500
 assert '服务端诊断编号' in result.json()['error']
 assert 'private runtime' not in result.text

def test_resume_after_failed_fetch_can_refetch(tmp_path,monkeypatch):
 base=tmp_path/'base';(base/'releases').mkdir(parents=True)
 config=tmp_path/'config';config.mkdir();data=base/'data';data.mkdir()
 layout=tweb.Layout(base=base,config=config,data=data,unit=tmp_path/'service',command=tmp_path/'tweb')
 manager=tweb.Manager(layout,lambda *a,**k:SimpleNamespace(stdout='not-found',returncode=0))
 state={'phase':'preparing','user_created':True,'repo':tweb.DEFAULT_REPOSITORY,'branch':tweb.DEFAULT_BRANCH,'python':sys.executable,'owned_files':{}}
 monkeypatch.setattr(manager,'load',lambda:state);monkeypatch.setattr(manager,'save',lambda value:None)
 fresh=base/'releases/new';events=[]
 def fetch(*args):
  fresh.mkdir();put(fresh,'deploy/linux/tweb.py',b'# updated manager');events.append('fetch');return fresh,'commit'
 monkeypatch.setattr(manager,'fetch',fetch);monkeypatch.setattr(tweb,'check_source',lambda p:None)
 monkeypatch.setattr(manager,'prepare',lambda *a:events.append('prepare'))
 monkeypatch.setattr(manager,'switch',lambda *a:None)
 monkeypatch.setattr(manager,'generate',lambda *a:layout.unit.write_text('unit'))
 monkeypatch.setattr(manager,'db',lambda *a:None);monkeypatch.setattr(manager,'permissions',lambda:None)
 monkeypatch.setattr(manager,'start',lambda:None);monkeypatch.setattr(manager,'write_command',lambda *a:None)
 manager.resume_install()
 assert events==['fetch','prepare'] and state['phase']=='ready'
 assert (base/'tweb.py').read_text()=='# updated manager'
