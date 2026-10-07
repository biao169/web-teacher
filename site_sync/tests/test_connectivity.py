import asyncio,json,unittest
from types import SimpleNamespace
from unittest.mock import patch,AsyncMock
from site_sync.admin.connectivity import probe
from site_sync.runtime.bridge import NativeBridge,NativeError
from site_sync.core.journal import failure

class ConnectivityTests(unittest.TestCase):
 def test_probe_uses_saved_connection_and_never_returns_content(self):
  db=SimpleNamespace(query=AsyncMock(return_value=[{'peer_id':'peer','scopes_json':'["news"]'}]))
  peer=SimpleNamespace(candidates=AsyncMock(return_value={'item':{'private':'do not return'},'cursor':None}))
  rt=SimpleNamespace(peer_factory=AsyncMock(return_value=peer))
  with patch('site_sync.admin.connectivity.adapter',return_value=db),patch('site_sync.admin.connectivity.runtime',return_value=rt),patch('site_sync.admin.connectivity.scopes',return_value=['news']):
   result=asyncio.run(probe(SimpleNamespace(p={'uid':'u'})))
  self.assertTrue(result['ok']);self.assertNotIn('do not return',json.dumps(result))
  self.assertEqual(peer.candidates.call_args.args[0]['kind'],'candidates')
  self.assertEqual(len(result['steps']),3)
 def test_disabled_connection_stops_before_network(self):
  with patch('site_sync.admin.connectivity.adapter',return_value=SimpleNamespace(query=AsyncMock(return_value=[]))),patch('site_sync.admin.connectivity.runtime') as runtime:
   result=asyncio.run(probe(SimpleNamespace(p={'uid':'u'})))
  self.assertFalse(result['ok']);runtime.assert_not_called()
 def test_rpc_diagnostics_survive_without_exception_text(self):
  binding=SimpleNamespace(read=AsyncMock(return_value=json.dumps({'ok':False,'kind':'temporary','stage':'credential_read','error_type':'TypeError','reason':'SECRET MUST NOT LEAK','platform_code':1102,'http_status':503})))
  try:asyncio.run(NativeBridge(binding,None).call('read',{}))
  except NativeError as exc:result=failure(exc)
  self.assertEqual(result['causes'][0]['stage'],'credential_read')
  self.assertEqual(result['causes'][0]['platform_code'],1102)
  self.assertNotIn('SECRET',json.dumps(result))
 def test_fetch_substage_and_safe_code_survive_rpc(self):
  binding=SimpleNamespace(read=AsyncMock(return_value=json.dumps({'ok':False,'kind':'temporary','stage':'fetch_request','error_type':'TypeError','code':'INVOCATION_CONTEXT','reason':'PRIVATE KEY AND URL'})))
  try:asyncio.run(NativeBridge(binding,None).call('read',{}))
  except NativeError as exc:result=failure(exc)
  self.assertEqual(result['causes'][0]['code'],'INVOCATION_CONTEXT')
  self.assertEqual(result['causes'][0]['stage'],'fetch_request')
  self.assertIn('更新原生辅助',result['causes'][0]['reason'])
  self.assertNotIn('PRIVATE',json.dumps(result))
