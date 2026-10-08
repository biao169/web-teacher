"""Bounded binary RPC and request-local D1 buffer ownership contracts."""
import asyncio
import json
import sys
import types
import pytest
from site_sync.runtime.bridge import NativeBridge, NativeError
from site_sync.adapters import d1

class Binding:
    def __init__(self, value): self.value=value
    async def read(self, raw): return self.value

def read(value, length=4*1024*1024, kind='slice'):
    return asyncio.run(NativeBridge(Binding(value),None).read({'kind':kind,'length':length}))

class Buffer:
    def __init__(self, size): self.byteLength=size;self.copies=0
    def to_bytes(self): self.copies+=1;return b'x'*self.byteLength
    def to_py(self): raise AssertionError('No intermediate memoryview conversion')

def test_large_configured_slice_remains_supported():
    value=Buffer(4*1024*1024)
    assert len(read(value))==4*1024*1024
    assert value.copies==1

def test_oversized_binary_is_rejected_before_conversion():
    value=Buffer(4*1024*1024+1)
    with pytest.raises(ValueError): read(value)
    assert value.copies==0

def test_metadata_has_small_independent_budget():
    value=Buffer(8193)
    with pytest.raises(ValueError): read(value,kind='candidates')
    assert value.copies==0
    assert read(b'{}',kind='candidates')==b'{}'

def test_control_error_preserves_diagnostic_code():
    with pytest.raises(NativeError) as caught:
        read(json.dumps({'ok':False,'kind':'credential','code':'PEER_HTTP_FORBIDDEN','http_status':403}))
    assert caught.value.code=='PEER_HTTP_FORBIDDEN'
    assert caught.value.http_status==403

def test_old_body_protocol_has_explicit_upgrade_diagnostic():
    with pytest.raises(NativeError) as caught: read('{"ok":true,"value":"YWJj"}')
    assert caught.value.code=='SYNC_NATIVE_PROTOCOL'

def test_control_reply_cannot_allocate_body_sized_json():
    with pytest.raises(ValueError,match='response bound'): read(' '*16385)

def test_d1_buffer_does_not_expand_bytes_to_integer_list(monkeypatch):
    class NoIteration(bytes):
        def __iter__(self): raise AssertionError('Must not expand bytes')
    calls=[]
    class Uint8Array:
        @staticmethod
        def new(size):
            value=types.SimpleNamespace(buffer=object())
            value.assign=lambda source:calls.append((size,bytes(memoryview(source))))
            return value
    monkeypatch.setitem(sys.modules,'js',types.SimpleNamespace(Uint8Array=Uint8Array))
    monkeypatch.setattr(sys,'platform','emscripten')
    assert d1.blob(NoIteration(b'abc')) is not None
    assert calls==[(3,b'abc')]

def test_d1_reuses_buffer_only_within_one_batch(monkeypatch):
    created=[];bound=[]
    def make_blob(value):
        obj=object();created.append(obj);return obj
    monkeypatch.setattr(d1,'blob',make_blob)
    class Statement:
        def bind(self,*args): bound.append(args[0]);return self
    class DB:
        def prepare(self,sql): return Statement()
        async def batch(self,statements): return [{'success':True} for _ in statements]
    db=d1.D1(DB());body=b'payload'
    for _ in range(2): asyncio.run(db.batch([('insert',(body,)),('verify',(body,))]))
    assert len(created)==2
    assert bound[0] is bound[1] and bound[2] is bound[3]
    assert bound[0] is not bound[2]
