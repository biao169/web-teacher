"""Adapter contract matrix, not live Cloudflare acceptance.

Reuse signed HTTP workflows with the production D1SQL/R2Store/R2Inventory.
Only remote bindings and JS byte conversion are doubles; SQLite owns transactions.
"""
import json,sys
from types import SimpleNamespace,ModuleType
import pytest
from tests import test_site_sync_v121 as execution,test_site_sync_v122 as approval
from tests.test_site_sync_v121 import pair as local_pair
from tests.test_site_sync_v122 import peers
from backend.app.adapters.d1.sql import D1SQL
from backend.app.native.storage import R2Store

class Binding:
 def __init__(self,sql):self.sql=sql;self.reads=[];self.batches=[]
 def prepare(self,text):
  binding=self
  class Statement:
   def __init__(self,args=()):self.args=args;self.text=text
   def bind(self,*args):return Statement(args)
   async def all(self):
    binding.reads.append(text)
    return {'results':await binding.sql.query(text,self.args)}
  return Statement()
 async def batch(self,items):
  self.batches.append(len(items))
  return [{'results':rows} for rows in await self.sql.restore_batch([(s.text,s.args) for s in items])]

class Bucket:
 def __init__(self):self.objects={};self.sequence=0;self.ranges=[]
 async def head(self,key):
  if key not in self.objects:return None
  data,version=self.objects[key]
  return SimpleNamespace(key=key,size=len(data),version=version)
 async def put(self,key,data,options=None):
  if options and options.get('onlyIf') and key in self.objects:return None
  self.sequence+=1;self.objects[key]=(bytes(data),str(self.sequence));return await self.head(key)
 async def get(self,key,options=None):
  result=await self.head(key)
  if result is None:return None
  data=self.objects[key][0]
  if options and 'range' in options:
   part=options['range'];self.ranges.append(part['length']);result.range=SimpleNamespace(**part)
   data=data[part['offset']:part['offset']+part['length']]
  async def buffer():return data
  result.arrayBuffer=buffer
  return result
 async def delete(self,key):self.objects.pop(key,None)

@pytest.fixture(params=[('local','r2'),('r2','local'),('r2','r2')],ids=['worker-to-ubuntu','ubuntu-to-worker','worker-to-worker'])
def pair(local_pair,monkeypatch,request):
 js=ModuleType('js');js.JSON=SimpleNamespace(parse=json.loads)
 class Bytes(bytes):
  def to_py(self):return bytes(self)
 js.Uint8Array=SimpleNamespace(new=Bytes)
 ffi=ModuleType('pyodide.ffi');ffi.to_js=lambda x:x
 monkeypatch.setitem(sys.modules,'js',js);monkeypatch.setitem(sys.modules,'pyodide.ffi',ffi)
 for r,kind in zip(local_pair[2:4],request.param):
  if kind=='local':continue
  r.sql=D1SQL(Binding(r.sql));bucket=Bucket();r.kind='r2'
  r.media_store=R2Store(bucket,'media/');r.cache_store=R2Store(bucket,'cache/')
 yield local_pair
 for r,kind in zip(local_pair[2:4],request.param):
  if kind=='r2':
   assert r.sql.binding.reads and max(r.sql.binding.batches)<=64
   assert all(n<=65536 for n in r.media_store.bucket.ranges)


def test_reference_replacement_and_deletion(pair):
 execution.test_replacement_commit_then_physical_delete(pair)
 for r in pair[2:4]:
  if r.kind=='r2':assert not any(k.startswith('cache/site-sync/') for k in r.cache_store.bucket.objects)


def test_commit_acknowledgement_lost(pair,monkeypatch):
 execution.test_commit_ack_lost_is_not_replayed(pair,monkeypatch)


def test_latest_proposal_and_stale_approval(peers):
 approval.test_latest_replaces_old_selection_and_old_review_is_rejected(peers)


def test_media_version_changes_stop_at_saved_offset(pair):
 execution.test_chunk_resume_and_version_change(pair)


def test_network_retry_and_cancel_preserve_changed_content(pair,monkeypatch):
 execution.test_pause_retry_cancel_and_changed_target(pair,monkeypatch)
