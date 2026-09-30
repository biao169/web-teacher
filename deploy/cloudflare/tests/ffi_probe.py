"""Run with locked Pyodide Python from a generated Worker directory.
JS stubs test the real FFI; no remote database or bucket is contacted.
"""
import asyncio
from pathlib import Path
import sys
sys.path.insert(0,str(Path.cwd()/'src'))
import js
from types import SimpleNamespace
from worker_runtime.bridge import Database, Bucket
from backend.app.adapters.d1.sql import D1SQL
from backend.app.native.storage import R2Store
from backend.app.adapters.worker_crypto.passwords import derive

async def main():
    native = js.Function.new('''return {
      prepare(sql) { let values=[]; return {
        bind(...args) { values=args; return this; },
        async all() { if(values[0]===undefined)throw Error('undefined bind');
          return {results:[{value:values[0],nested:[null]}]}; }
      }; },
      async batch(items) { if(!Array.isArray(items))throw Error('batch requires native array');
        return await Promise.all(items.map(x=>x.all())); }
    }''')()
    db=D1SQL(Database(SimpleNamespace(_binding=native)))
    assert await db.query('test',(None,)) == [{'value':None,'nested':[None]}]
    assert await db.query('test',(True,)) == [{'value':1,'nested':[None]}]
    assert await db.batch([('test',(None,)),('test',('中文',))]) == [
        [{'value':None,'nested':[None]}],[{'value':'中文','nested':[None]}]]
    print('D1 FFI: null, bool, UTF-8, arrays and nested result values OK')
    native_bucket=js.Function.new('''const objects=new Map();return {
      async put(k,v) {objects.set(k,new Uint8Array(v));return {size:v.byteLength};},
      async head(k) {return objects.has(k)?{size:objects.get(k).length}:null;},
      async get(k) {if(!objects.has(k))return null;const data=objects.get(k);return {
        size:data.length, async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}
      };},async delete(k){objects.delete(k);},async list(options){const rows=[...objects.keys()].filter(k=>k.startsWith(options.prefix));return {objects:rows.slice(0,options.limit).map(key=>({key})),truncated:rows.length>options.limit};}
    }''')()
    bucket=Bucket(SimpleNamespace(_binding=native_bucket));store=R2Store(bucket,'media/')
    assert await store.get('missing.png') is None
    assert await bucket.head('missing') is None
    payload=b'\x00\xffPNG\x80binary\n'
    await store.put('test.png',payload)
    assert await store.get('test.png',len(payload))==payload
    try:await store.get('test.png',1)
    except Exception as exc:assert getattr(exc,'status',None)==413
    else:raise AssertionError('missing read limit')
    await store.delete('test.png');assert await store.get('test.png') is None
    print('R2 FFI: missing object, binary round trip, size cap and delete OK')
    from worker_runtime.transfer import TransferStore
    transfers=TransferStore(bucket,'transfer/media/')
    task='a'*32
    for i in range(10):await transfers.put(task+'/'+str(i)+'.part',b'file')
    await store.put('permanent.png',b'keep')
    first=await transfers.prune_task(task);assert first=={'removed':8,'done':False}
    second=await transfers.prune_task(task);assert second=={'removed':2,'done':True}
    assert await store.get('permanent.png')==b'keep'
    print('R2 task pruning: bounded prefix-only cleanup and permanent media isolation OK')
    value=await derive(b'pass',b'salt',600000)
    assert value.hex()=='b8b0941e7a83a1bcd973407482c40b9f4a7a2a8cd2184c2a8efd0f0b9924de6e'
    print('Web Crypto: existing 600000-iteration PBKDF2 format verified')

asyncio.run(main())
