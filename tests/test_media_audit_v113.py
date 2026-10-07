"""Report-wide list behavior and authenticated previews of unregistered files."""
import asyncio
import json
from pathlib import Path
import pytest
from list_fixture import client_at
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.media_audit import MediaAudit
from backend.app.native.catalog import Error

MEDIA=Path(__file__).parent/'fixtures'/'media'

@pytest.fixture()
def audit_runtime(tmp_path):
    client,r=client_at(tmp_path)
    async def prepare():
        r.auth=Auth(r.sql,r.passwords);r.p=await r.auth.principal(client.cookies.get(r.config.name('session')))
        r.content=Content(r.sql,r.auth)
        for i in range(37):
            key=f'照片/group-{i:02}.jpg';p=r.media_store.root/key;p.parent.mkdir(exist_ok=True);p.write_bytes((MEDIA/'sample.jpg').read_bytes()+b' '*i)
            if i<17:
                await r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,original_filename,mime_type,size,storage_kind,status) VALUES(?,?,?,?,?,?,?,?)',
                    (f'photo-{i}',key,f'教师照片 {i:02}',f'原名{i:02}.jpg','image/jpeg',p.stat().st_size,'local','active'))])
        for name in ('sample.pdf','sample.mp4','sample.webm'):(r.media_store.root/name).write_bytes((MEDIA/name).read_bytes())
        await r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size) VALUES(?,?,?,?,?)',('missing','missing.jpg','缺失照片','image/jpeg',25))])
        audit=MediaAudit(r);state=await audit.start()
        while state['phase']!='done':state=await audit.step(state['id'],state['version'])
        return audit,state
    audit,state=asyncio.run(prepare())
    yield client,r,audit,state
    client.close()

def test_global_filter_sort_pagination_and_stable_entry_ids(audit_runtime):
    client,r,audit,state=audit_runtime
    _,full=asyncio.run(audit.page(state['id'],query={'sort':'size','direction':'desc','size':'100'}))
    assert full['total']==41
    assert [row['size'] for row in full['rows']]==sorted([row['size'] for row in full['rows']],reverse=True)
    query={'f.category':'["matched","unregistered"]','f.kind':'["image"]','c.key':'group-','size':'10','sort':'key','direction':'desc'}
    pages=[asyncio.run(audit.page(state['id'],query=query|{'page':str(page)}))[1] for page in range(1,5)]
    assert all(page['total']==37 and page['pages']==4 for page in pages)
    keys=[row['key'] for page in pages for row in page['rows']]
    assert len(set(keys))==37 and keys==sorted(keys,reverse=True)
    for page in pages:
        for row in page['rows']:
            original=asyncio.run(audit.entry(state['id'],row['report_page'],row['report_index']))
            assert original['key']==row['key']
    _,named=asyncio.run(audit.page(state['id'],query={'q':'原名16'}));assert named['total']==1
    _,path=asyncio.run(audit.page(state['id'],query={'c.key':str(r.media_store.root.resolve())+'/照片/group-36'}));assert path['total']==1

def test_index_cache_is_bounded_and_current_page_only_loads_source_pages(audit_runtime,monkeypatch):
    _,_,audit,state=audit_runtime
    original=audit.read_json;reads=[]
    async def read(key):reads.append(key);return await original(key)
    monkeypatch.setattr(audit,'read_json',read)
    query={'f.kind':'image','sort':'key','size':'10'}
    asyncio.run(audit.page(state['id'],query=query));reads.clear()
    asyncio.run(audit.page(state['id'],query=query|{'page':'2'}))
    assert not any('/index-' in key for key in reads)
    assert sum('/page-' in key for key in reads)<=10
    asyncio.run(audit.page(state['id'],query={'q':'group-01'}))
    files=list((audit.cache.root/audit.root(state['id'])).glob('list-view*'))
    assert len(files)==1

@pytest.mark.parametrize('name,mime',[('group-36.jpg','image/jpeg'),('sample.pdf','application/pdf'),('sample.mp4','video/mp4'),('sample.webm','video/webm')])
def test_unregistered_preview_is_read_only_and_supports_range(audit_runtime,name,mime):
    client,r,audit,state=audit_runtime
    _,listing=asyncio.run(audit.page(state['id'],query={'q':name,'f.category':'unregistered'}))
    row=listing['rows'][0];url=row['preview_url']
    count=asyncio.run(r.sql.query('SELECT count(*) n FROM media_assets'))[0]['n']
    response=client.get(url);head=client.head(url)
    assert response.status_code==head.status_code==200
    assert response.headers['content-type']==mime
    assert response.content==(r.media_store.root/row['key']).read_bytes()
    part=client.get(url,headers={'Range':'bytes=1-12'})
    assert part.status_code==206 and part.content==response.content[1:13]
    assert asyncio.run(r.sql.query('SELECT count(*) n FROM media_assets'))[0]['n']==count
    assert client.get(url,headers={'Cookie':''}).status_code in (401,403)
    assert client.get(url+'?path=/etc/passwd').content==response.content

def test_preview_rechecks_report_owner_expiry_and_storage_boundary(audit_runtime):
    client,r,audit,state=audit_runtime
    _,listing=asyncio.run(audit.page(state['id'],query={'q':'group-36'}));row=listing['rows'][0];url=row['preview_url']
    saved=asyncio.run(audit.state(state['id']));changed=dict(saved,owner='another-owner')
    asyncio.run(audit.write_json(audit.root(state['id'])+'/state.json',changed))
    assert client.get(url).status_code==403
    changed=dict(saved,expires='2000-01-01T00:00:00.000Z')
    asyncio.run(audit.write_json(audit.root(state['id'])+'/state.json',changed))
    assert client.get(url).status_code==409
    asyncio.run(audit.write_json(audit.root(state['id'])+'/state.json',saved))
    path=r.media_store.root/row['key'];path.unlink();assert client.get(url).status_code==404
    outside=r.media_store.root.parent/'outside.txt';outside.write_text('NEVER EXPOSE')
    try:path.symlink_to(outside)
    except (OSError,NotImplementedError):return
    response=client.get(url);assert response.status_code==422 and 'NEVER EXPOSE' not in response.text

def test_table_reuses_headers_columns_selection_and_preview(audit_runtime):
    client,_,audit,state=audit_runtime
    response=client.get('/admin/media/audit?f.category=unregistered&size=50')
    assert response.status_code==200
    text=response.text
    for item in ('native-list','data-list-kind="audit"','data-column-popup="category"','data-filter-multi="true"','data-column-sort="size"','data-select-row','data-select-all','data-column-controls','data-page-size','data-media-thumb','data-media-peek','data-audit-recheck-selected','data-audit-copy'):
        assert item in text
    assert text.index('data-column="__preview"')<text.index('data-column="name"')
    assert 'data-bulk-delete' not in text
    assert client.get('/admin/media_assets').status_code==200

@pytest.mark.parametrize('query',[{'f.category':'unknown'},{'f.kind':'["image",{}]'},{'size':'999'},{'sort':'__preview'},{'direction':'sideways'},{'f.size':'-1'},{'c.key':'x'*501}])
def test_invalid_filters_are_rejected(audit_runtime,query):
    _,_,audit,state=audit_runtime
    with pytest.raises(Error):asyncio.run(audit.page(state['id'],query=query))

def test_existing_reports_without_index_remain_usable(audit_runtime):
    _,_,audit,state=audit_runtime
    saved=asyncio.run(audit.state(state['id']));saved.pop('list_index')
    asyncio.run(audit.write_json(audit.root(state['id'])+'/state.json',saved))
    _,listing=asyncio.run(audit.page(state['id'],query={'q':'group-36','size':'10'}))
    assert listing['total']==1 and listing['rows'][0]['key'].endswith('group-36.jpg')

def test_preview_remains_usable_after_explicit_import(audit_runtime):
    client,r,audit,state=audit_runtime
    _,listing=asyncio.run(audit.page(state['id'],query={'q':'sample.pdf'}));row=listing['rows'][0]
    plan=asyncio.run(audit.prepare_import(state['id'],row['report_page'],row['report_index']))
    asyncio.run(audit.commit_import(state['id'],plan['token']))
    assert client.get(row['preview_url']).status_code==200
    assert asyncio.run(r.sql.query('SELECT uid FROM media_assets WHERE object_key=?',('sample.pdf',)))
