"""Deployment configuration contracts; fake system commands, temporary files only."""
import hashlib
import pytest
from backend.app.public_performance import PublicPerformance
from test_linux_manager_v76 import managed,update_args

CUSTOM={'TEACHER_PUBLIC_CACHE_TTL_SECONDS':'120','TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS':'0','TEACHER_PUBLIC_STREAM_CONCURRENCY':'1','TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY':'0','TEACHER_PUBLIC_CACHE_MB':'8'}

@pytest.mark.parametrize('operation',['generate','config-update','all-update','domains','port','repair'])
def test_linux_preserves_custom_values(managed,monkeypatch,operation):
 m,events,args=managed
 path=m.l.config/'teacher-site.env'
 with path.open('a') as f:f.write(''.join(f'{k}={v}\n' for k,v in CUSTOM.items()))
 if operation in ('domains','port','config-update'):
  unit=m.l.unit.read_text().replace('--workers 1','--workers 1 --port 8003');m.l.unit.write_text(unit)
  state=m.load();state['owned_files'][str(m.l.unit)]=hashlib.sha256(unit.encode()).hexdigest();m.save(state)
 if operation=='generate':m.generate(m.l.current,m.load())
 elif operation.endswith('update'):m.update(update_args(scope='config' if operation=='config-update' else 'all'))
 elif operation=='domains':m.configure(allowed_origins='https://teacher.example.org,https://extra.example.org')
 elif operation=='port':
  import socket
  with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
  m.configure(port=port)
 else:
  monkeypatch.setattr(m,'remnants',lambda:([],None,None,False))
  monkeypatch.setattr(m,'recovery_guard',lambda *a:None)
  monkeypatch.setattr(m,'permissions',lambda **kw:None)
  m.repair_install()
 lines=path.read_text().splitlines()
 for k,v in CUSTOM.items():assert lines.count(f'{k}={v}')==1
 assert path.stat().st_mode & 0o777==0o640


def test_vps_example_matches_defaults(tmp_path):
 from deploy.vps.release import render
 out=tmp_path/'generated'
 render(out,'/opt/teacher-site','teacher.example.org',None,'/opt/teacher-site/current/.venv/bin/python')
 env=(out/'teacher-site.env').read_text()
 for k,v in PublicPerformance().to_env().items():assert f'# {k}={v}\n' in env
 assert (out/'teacher-site.env').stat().st_mode & 0o777==0o600
