"""Real single-port shared launcher + transfer codes + restart, with synthetic isolated data."""
import asyncio
import re
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import httpx
from list_fixture import client_at
from test_accounts_regression import user,role
from test_media_regression import register,PNG
from test_translation_regression import source,cache
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.catalog import MODULES,TABLES

ROOT=Path(__file__).resolve().parents[1]

def port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));return sock.getsockname()[1]

def launch(env,log,seconds):
    code='import asyncio; from deploy.shared.launcher import configure,initialize,serve; s=configure(); asyncio.run(initialize(s,True)); serve(s,both=True,open_browser=False,seconds='+str(seconds)+')'
    return subprocess.Popen([sys.executable,'-B','-c',code],cwd=ROOT,env=env,stdout=log,stderr=log)

def ready(client,process,path):
    deadline=time.monotonic()+20
    while time.monotonic()<deadline:
        assert process.poll() is None,'Launcher exited before readiness'
        try:
            if client.get(path).status_code==200:return
        except httpx.TransportError:pass
        time.sleep(.1)
    raise AssertionError('Readiness timed out')

def test_release_launch_integrated_flows_and_restart(tmp_path):
    main_port=port();transfer_port=port()
    while transfer_port==main_port:transfer_port=port()
    origin=f'http://127.0.0.1:{main_port}';transfer=origin+'/transfer'
    seed,r=client_at(tmp_path/'data',origin)
    token=seed.cookies.get('ts_session');r.auth=Auth(r.sql,r.passwords);r.content=Content(r.sql,r.auth)
    r.p=asyncio.run(r.auth.principal(token))
    target_role=role(r);target_user=user(r,target_role['uid'])
    removed_token=asyncio.run(r.auth.login(target_user['username'],'Synthetic-only-password-035','test'))
    donor=source(r,text='集成联调共享原文');receiver=source(r,'courses','name',text='集成联调共享原文')
    cache(r,'profiles',donor,'title','Integrated shared translation',manual=1)
    media_uid,_=register((seed,r),PNG,suffix='jpg')
    seed.close()
    # Ignore any production configuration inherited from the invoking shell.
    env={k:v for k,v in os.environ.items() if not k.startswith(('TEACHER_','TRANSFER_'))}
    env.update(TEACHER_DATA_DIR=str(tmp_path/'data'),TEACHER_PORT=str(main_port),TRANSFER_PORT=str(transfer_port),TEACHER_ORIGIN=origin,TRANSFER_ORIGIN=transfer,TRANSFER_MEDIA_DIR=str(tmp_path/'data/transfer-media'),TRANSFER_CACHE_DIR=str(tmp_path/'data/transfer-cache'),PYTHONUTF8='1',PYTHONDONTWRITEBYTECODE='1')
    with httpx.Client(base_url=origin,cookies={'ts_session':token},trust_env=False,timeout=3) as client,httpx.Client(base_url=transfer,cookies={'ts_session':token},trust_env=False,timeout=3) as ft,(tmp_path/'launcher.log').open('w') as log:
        process=launch(env,log,14)
        try:
            ready(client,process,'/health/ready');ready(ft,process,'/health')
            # One main-site session; no bridge, second process or second port.
            assert client.get('/transfer/login').status_code==303
            with socket.socket() as sock:assert sock.connect_ex(('127.0.0.1',transfer_port))!=0
            redirect=ft.get('/admin');assert redirect.status_code==303
            manager=client.get(redirect.headers['location']);assert manager.status_code==200
            assert 'workspace-sidebar' in manager.text and 'data-transfer-admin' in manager.text
            csrf=re.search(r'data-csrf="([^"]+)"',manager.text).group(1)
            headers={'Origin':origin}
            settings=ft.post('/api/settings',json={'_csrf':csrf,'revision':0,'enabled':True,'vpnGuard':False,'temporaryShare':True,'totalWeeklyBytes':'8','maxFileBytes':'4','temporaryMaxDownloads':2},headers=headers)
            assert settings.status_code==200,settings.text
            created=ft.post('/api/tasks',json={'_csrf':csrf,'name':'integration.txt','size':4},headers=headers);assert created.status_code==200,created.text
            share=created.json()
            assert ft.post('/api/tasks/'+share['id']+'/chunk',content=b'test',headers={**headers,'X-CSRF-Token':csrf,'X-Offset':'0'}).status_code==200
            code_headers={**headers,'X-CSRF-Token':csrf}
            issued=ft.post('/api/codes/issue',json={'mode':'offline','target':share['id']},headers=code_headers)
            assert issued.status_code==200,issued.text
            short_code=issued.json()['code'];assert re.fullmatch('[A-Z]{2}[0-9]{4}',short_code)
            resolved=ft.post('/api/codes/resolve',json={'code':short_code.lower()},headers=code_headers)
            assert resolved.status_code==200,resolved.text
            receive_token=resolved.json()['token']
            assert ft.get('/s/'+receive_token).content==b'test'
            assert ft.get('/api/admin/usage').json()['total']['weekly']['charged_and_reserved']==8
            for table in MODULES:
                if table not in TABLES:continue
                page=client.get('/admin/'+table);assert page.status_code==200,table
                fragment=client.get('/admin/'+table,headers={'X-Native-List':'1'})
                assert fragment.status_code==200 and f'data-table="{table}"' in fragment.json()['html'],table
            for path in (ROOT/'frontend/admin/static/js').glob('*.js'):
                asset=client.get('/assets/admin/js/'+path.name+'?v=acceptance')
                assert asset.status_code==200 and 'javascript' in asset.headers['content-type'],path.name
            image=client.get('/api/admin/media/'+media_uid+'/content')
            assert image.status_code==200 and image.headers['content-type']=='image/png' and image.content==PNG
            english=client.get('/en/courses/'+receiver['uid'])
            assert english.status_code==200 and 'Integrated shared translation' in english.text
            assert '集成联调共享原文' in client.get('/zh/courses/'+receiver['uid']).text
            def delete(table,row):
                return client.post('/api/admin/'+table+'/'+row['uid'],json={'action':'delete','stamp':row['updated_at'],'_csrf':r.p['csrf']},headers={'Origin':origin})
            assert delete('auth_roles',target_role).status_code==409
            assert delete('auth_users',target_user).status_code==200
            with httpx.Client(base_url=origin,cookies={'ts_session':removed_token},trust_env=False) as removed:
                assert removed.get('/admin/auth_users').status_code in (302,303,401)
            assert delete('auth_roles',target_role).status_code==200
            assert process.wait(timeout=20)==0
        finally:
            # Normal exit uses the shared launcher's own child cleanup.
            if process.poll() is None:process.wait(timeout=25)
        for address in [(main_port,'main'),(transfer_port,'transfer')]:
            with socket.socket() as sock:assert sock.connect_ex(('127.0.0.1',address[0]))!=0,address[1]
        process=launch(env,log,2)
        try:
            ready(client,process,'/health/ready');ready(ft,process,'/health')
            assert ft.get('/api/admin/usage').json()['total']['weekly']['charged_and_reserved']==8
            persisted=ft.post('/api/codes/resolve',json={'code':short_code},headers=code_headers)
            assert persisted.status_code==200,persisted.text
            assert persisted.json()['token']==receive_token
            assert target_user['uid'] not in client.get('/admin/auth_users').text
            assert target_role['uid'] not in client.get('/admin/auth_roles').text
            assert 'Integrated shared translation' in client.get('/en/courses/'+receiver['uid']).text
            assert client.get('/api/admin/media/'+media_uid+'/content').content==PNG
            assert process.wait(timeout=15)==0
        finally:
            if process.poll() is None:process.wait(timeout=20)
    assert not asyncio.run(r.sql.query('PRAGMA foreign_key_check'))
    assert asyncio.run(r.sql.query('PRAGMA integrity_check'))[0]['integrity_check']=='ok'
