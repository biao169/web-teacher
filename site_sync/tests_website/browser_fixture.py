"""Real website/login on loopback, ephemeral database; never deploy this fixture."""
import json,socket,time
from pathlib import Path
import uvicorn
from .test_integration import IntegrationTests,run
from backend.app.security.http import AuthConfig
from backend.app.native.web import create_app
from site_sync.integration.host import configure,runtime,grant_id
fixture=IntegrationTests();fixture.setUp();r=fixture.source
password='Browser-test-016001!'
run(r.sql.batch([('UPDATE auth_users SET password_hash=? WHERE uid=?',(run(r.passwords.hash(password)),'admin'))]))
r.p=run(r.auth.principal('test-token'));run(configure(r,{'origin':'https://peer.example','enabled':True}))
repo=runtime(r).repo;now=int(time.time())
task=run(repo.create(peer_id='peer',grant_id=grant_id(r.p),scope=['news'],operation_id='browser',now=now,mode='manual'))
t=run(repo.claim(now));run(repo.add_item(t,item_id='item-1',module='news',record_id='<img src=x onerror=alert(1)>',source_version='v1',now=now));run(repo.advance(t,'await_confirmation',now));run(repo.finish(t,now))
sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen(128);port=sock.getsockname()[1]
r.config=AuthConfig.from_origin('http://127.0.0.1:'+str(port))
app=create_app(lambda req:r,Path(__file__).resolve().parents[2])
print(json.dumps({'port':port,'password':password}),flush=True)
try:uvicorn.Server(uvicorn.Config(app,log_level='error')).run(sockets=[sock])
finally:fixture.tearDown()
