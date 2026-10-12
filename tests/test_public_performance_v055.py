import asyncio
from unittest.mock import patch
from types import SimpleNamespace
import pytest
from backend.app.public_performance import PublicPerformance as P
from backend.app.native.public_revision import revision,revision_write
from test_accounts_regression import fixture
from test_linux_manager_v76 import managed,update_args
run=asyncio.run

def test_revision_business_only_and_rollback(fixture):
 c,r=fixture;before=run(revision(r.sql))
 run(r.sql.batch([("INSERT INTO service_meta(key,value) VALUES ('test','1')",())]));assert run(revision(r.sql))==before
 run(r.sql.batch([('UPDATE profiles SET name=name',())]));assert run(revision(r.sql))!=before
 before=run(revision(r.sql))
 with pytest.raises(Exception):run(r.sql.batch([('UPDATE profiles SET name=name',()),('INSERT INTO nonexistent VALUES (1)',())]))
 assert run(revision(r.sql))==before
 assert revision_write([('UPDATE sync_tasks SET status=?',('waiting',))]) is None

def test_linux_generate_preserves_performance(managed):
 m,events,args=managed
 path=m.l.config/'teacher-site.env'
 with path.open('a') as f:f.write('TEACHER_PUBLIC_CACHE_TTL_SECONDS=3600\nTEACHER_PUBLIC_STREAM_CONCURRENCY=1\nTEACHER_PUBLIC_CACHE_MB=8\n')
 import hashlib
 unit=m.l.unit.read_text().replace('--workers 1','--workers 1 --port 8003');m.l.unit.write_text(unit)
 state=m.load();state['owned_files'][str(m.l.unit)]=hashlib.sha256(unit.encode()).hexdigest();m.save(state)
 (m.l.config/'generated/nginx-location.conf').write_text('proxy_pass http://127.0.0.1:8003;')
 m.update(update_args(scope='config'))
 m.configure(allowed_origins='https://teacher.example.org,https://extra.example.org')
 m.generate(m.l.current,m.load())
 assert 'TEACHER_PUBLIC_STREAM_CONCURRENCY=1' in path.read_text()
 assert 'TEACHER_PUBLIC_CACHE_TTL_SECONDS=3600' not in path.read_text()
 assert 'TEACHER_PUBLIC_CACHE_MB=8' not in path.read_text()

