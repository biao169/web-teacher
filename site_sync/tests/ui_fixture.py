from site_sync.tests.schema_fixture import core_plan
"""Loopback-only browser TEST fixture. Fixed test actor/CSRF; not a deploy host."""
import asyncio
import json
from http.server import BaseHTTPRequestHandler,HTTPServer
from pathlib import Path
import time
from urllib.parse import urlsplit
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.tasks import Tasks
from site_sync.deploy.schema import Plan,ensure
from site_sync.admin.service import Admin,Actor
from site_sync.admin.asgi import AdminASGI
ROOT=Path(__file__).resolve().parents[2]
run=asyncio.run;db=SQLite();run(ensure(db,core_plan(ROOT/'database/schema.sql')));repo=Tasks(db)
db.connection.execute("INSERT INTO sync_peers VALUES('peer-test','https://invalid.example','env:UNUSED','p1',1)")
run(repo.put_grant(grant_id='test',principal_id='test',scope=['news','profiles','site_clone'],can_write=True,can_delete=True))
now=int(time.time());task=run(repo.create(peer_id='peer-test',grant_id='test',scope=['news'],operation_id='fixture',now=now,mode='manual'));t=run(repo.claim(now))
run(repo.add_item(t,item_id='item-1',module='news',record_id='<img src=x onerror=alert(1)>',source_version='v1',now=now));run(repo.advance(t,'await_confirmation',now));run(repo.finish(t,now))
async def authenticate(scope):return Actor('test','test')
async def csrf(scope,actor):return dict(scope['headers']).get(b'x-csrf-token')==b'test-csrf'
app=AdminASGI(Admin(repo,lambda:int(time.time())),authenticate,csrf)
class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):self.handle_request()
    def do_POST(self):self.handle_request()
    def handle_request(self):
        u=urlsplit(self.path)
        if u.path.startswith('/admin/site-sync/api/'):
            data=self.rfile.read(int(self.headers.get('Content-Length',0)));sent=[]
            async def receive():return {'type':'http.request','body':data,'more_body':False}
            async def send(event):sent.append(event)
            run(app({'type':'http','method':self.command,'path':u.path,'query_string':u.query.encode(),'headers':[(k.lower().encode(),v.encode()) for k,v in self.headers.items()]},receive,send))
            self.send_response(sent[0]['status'])
            for k,v in sent[0]['headers']:self.send_header(k.decode(),v.decode())
            self.end_headers();self.wfile.write(sent[1]['body']);return
        if self.command!='GET':self.send_error(404);return
        if u.path=='/':
            content=('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="csrf-token" content="test-csrf"><link rel="stylesheet" href="/static/panel.css"><title>同步后台测试</title></head><body>'+ (ROOT/'site_sync/frontend/templates/panel.html').read_text()+'<script type="module" src="/static/panel.mjs"></script></body></html>').encode();mime='text/html; charset=utf-8'
        elif u.path in ('/static/panel.css','/static/panel.mjs','/static/model.mjs'):
            content=(ROOT/'site_sync/frontend/static'/u.path.rsplit('/',1)[1]).read_bytes();mime='text/css' if u.path.endswith('css') else 'text/javascript'
        else:self.send_error(404);return
        self.send_response(200);self.send_header('Content-Type',mime);self.end_headers();self.wfile.write(content)
server=HTTPServer(('127.0.0.1',0),Handler)
print(json.dumps({'port':server.server_port,'task_id':task['task_id']}),flush=True)
try:server.serve_forever()
finally:server.server_close();db.close()
