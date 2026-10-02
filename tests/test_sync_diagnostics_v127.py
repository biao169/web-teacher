import asyncio,json
from types import SimpleNamespace as NS
import pytest
from backend.app.native import site_sync_diagnostics as diag
from backend.app.native.catalog import Error
from backend.app.adapters.d1.sql import D1SQL
from backend.app.native.site_sync_transport import response_json

@pytest.mark.parametrize('text,code',[
 ('D1_ERROR: no such column: password','schema_missing'),
 ('D1_ERROR: too many SQL variables','parameter_limit'),
 ('D1_ERROR: too many subrequests','query_limit'),
 ('D1_ERROR: daily quota exceeded','quota'),
 ('D1_ERROR: database is locked','locked'),
 ('D1_ERROR: overloaded','overloaded'),
 ('D1_ERROR: query timed out','timeout'),
 ('D1_TYPE_ERROR: unsupported type','binding'),
 ('D1_ERROR: near SECRET: syntax error','sql'),
 ('D1_ERROR: string or blob too big','size_limit'),
 ('D1_ERROR: unexplained','database')])
def test_error_categories(text,code):assert diag.reason(RuntimeError(text))[0]==code

def test_js_cause_message():
 exc=RuntimeError('JsException');exc.js_error=NS(cause=NS(message='D1_ERROR: daily quota exceeded'))
 assert diag.reason(exc)[0]=='quota'

def test_query_diagnostic_records_no_values_and_only_logs_once(caplog):
 calls=[]
 class Statement:
  def bind(self,*args):calls.append('bind');return self
  async def all(self):calls.append('all');raise RuntimeError('D1_ERROR: near PRIVATE SQL: syntax error secret-password')
 class Binding:
  def prepare(self,sql):calls.append('prepare');return Statement()
 async def run():
  with diag.operation('admin'):
   with diag.operation('revision:read'):
    await D1SQL(Binding()).query('SELECT secret_password FROM private_table WHERE uid=?',('super-secret',))
 with pytest.raises(Error) as error:asyncio.run(run())
 assert error.value.code=='sync_sql' and 'admin/revision:read' in error.value.message
 assert calls==['prepare','bind','all']
 records=[json.loads(r.message) for r in caplog.records if r.name==diag.__name__]
 assert len(records)==1 and records[0]['database']['queries'][0]['parameters']==1
 assert len(records[0]['database']['queries'][0]['id'])==12
 assert not any(x in caplog.text+error.value.message for x in ('secret-password','secret_password','super-secret','private_table','PRIVATE SQL'))
 assert diag._current.get() is None

def test_batch_diagnostics_and_constraint_behavior(caplog):
 class Binding:
  def prepare(self,sql):return self
  def bind(self,*args):return self
  async def batch(self,statements):raise RuntimeError('D1_ERROR: database is locked')
 async def run():
  with diag.operation('snapshot:write'):await D1SQL(Binding()).batch([('UPDATE x SET y=?',('private',))])
 with pytest.raises(Error) as error:asyncio.run(run())
 assert error.value.code=='sync_locked'
 assert '"statements": 1' in caplog.text
 class Constraint(Binding):
  async def batch(self,statements):raise RuntimeError('UNIQUE constraint failed: private')
 with pytest.raises(Error) as error:asyncio.run(D1SQL(Constraint()).batch([('UPDATE x SET y=?',('private',))]))
 assert error.value.status==409

def test_nested_error_and_platform_instance():
 with pytest.raises(Error) as caught:response_json(500,json.dumps({'error':{'message':'服务端诊断编号：abc'},'instance':'ray-123'}).encode())
 assert '服务端诊断编号：abc' in caught.value.message and 'ray-123' in caught.value.message
