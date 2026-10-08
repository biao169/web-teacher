import asyncio,json,hashlib
from types import SimpleNamespace
from unittest.mock import patch,AsyncMock
import pytest
from site_sync.admin.connectivity import probe
from site_sync.core.diagnostics import RELEASE
@pytest.mark.parametrize('kind',['ok','version','key'])
def test_native_preflight_no_key_material_in_result(kind):
 db=SimpleNamespace(query=AsyncMock(return_value=[{'peer_id':'peer','scopes_json':'["news"]'}]))
 value={'release':RELEASE if kind!='version' else '0.16.001','credential_fingerprint':hashlib.sha256(b'a'*32).hexdigest()[:16] if kind!='key' else 'x'*16}
 binding=SimpleNamespace(status=AsyncMock(return_value=json.dumps({'ok':True,'value':value})))
 peer=SimpleNamespace(candidates=AsyncMock(return_value={'ok':True,'release':RELEASE,'protocol':'probe-v2','export_enabled':True,'allowed_scopes':['restore_media_assets']}))
 with patch('site_sync.admin.connectivity.adapter',return_value=db),patch('site_sync.admin.connectivity.runtime',return_value=SimpleNamespace(peer_factory=AsyncMock(return_value=peer))),patch('site_sync.admin.connectivity.scopes',return_value=['news']),patch('site_sync.integration.host.secret',new=AsyncMock(return_value=b'a'*32)):
  result=asyncio.run(probe(SimpleNamespace(p={'uid':'u'},kind='r2',sync_env=SimpleNamespace(SYNC_NATIVE=binding))))
 assert result['ok']==(kind=='ok')
 assert value['credential_fingerprint'] not in json.dumps(result)
 if kind!='ok':peer.candidates.assert_not_awaited();assert result['steps'][-1]['stage']=='native_status'
