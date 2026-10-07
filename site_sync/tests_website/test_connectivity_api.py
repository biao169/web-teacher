from unittest.mock import patch,AsyncMock
from site_sync.tests_website.test_credentials_api import CredentialAPITests

class ConnectivityAPITests(CredentialAPITests):
 def test_probe_auth_csrf_and_saved_connection_only(self):
  url='/api/admin/site-sync/connectivity'
  with patch('site_sync.admin.connectivity.probe',new_callable=AsyncMock,return_value={'ok':True,'steps':[]}) as probe:
   self.assertEqual(self.client.post(url,json={}).status_code,403)
   probe.assert_not_awaited()
   self.assertEqual(self.client.post(url,json={'origin':'https://untrusted.example'},headers=self.headers).status_code,400)
   probe.assert_not_awaited()
   response=self.client.post(url,json={},headers=self.headers)
   self.assertEqual(response.status_code,200);self.assertEqual(response.headers['cache-control'],'no-store');probe.assert_awaited_once()
   self.client.cookies.clear()
   self.assertEqual(self.client.post(url,json={},headers=self.headers).status_code,401)
 def test_page_has_probe(self):
  page=self.client.get('/admin/site-sync')
  self.assertEqual(page.status_code,200);self.assertIn('data-sync-probe',page.text)
 def test_retry_policy_save_and_validation(self):
  url='/admin/site-sync/api/retry-policy'
  response=self.client.get(url);self.assertEqual(response.status_code,200);self.assertEqual(response.json()['fast_retry_seconds'],10)
  self.assertEqual(self.client.post(url,json={'fast_retry_seconds':17}).status_code,403)
  response=self.client.post(url,json={'fast_retry_seconds':17},headers=self.headers)
  self.assertEqual(response.status_code,200);self.assertEqual(self.client.get(url).json()['fast_retry_seconds'],17)
  for seconds in (9,301,True):self.assertEqual(self.client.post(url,json={'fast_retry_seconds':seconds},headers=self.headers).status_code,400)
