"""Transport/security regression, not a browser image-decoder conformance test."""
import asyncio
import base64
import hashlib
import http.client
import socket
import threading
import time
import uuid
import pytest
import uvicorn
from list_fixture import client_at
from backend.app.native.media import signature
from backend.app.native.media_inventory_store import inventory
from backend.app.native.catalog import Error

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')
# Signature fixture deliberately does not claim full JPEG decoding coverage.
JPEG = b'\xff\xd8\xff\xe0' + b'J' * 140000 + b'\xff\xd9'

@pytest.fixture(scope='module')
def runtime(tmp_path_factory):
    client, r = client_at(tmp_path_factory.mktemp('media-regression'))
    yield client, r
    client.close()

def register(runtime, body, suffix='jpg', mime='image/jpeg'):
    client, r = runtime
    uid = uuid.uuid4().hex
    key = uid + ('.' + suffix if suffix else '')
    asyncio.run(r.media_store.put(key, body))
    asyncio.run(r.sql.batch([('INSERT INTO media_assets(uid,object_key,title,mime_type,size,storage_kind,status,checksum) VALUES (?,?,?,?,?,?,?,?)',
        (uid,key,'Synthetic transport fixture',mime,len(body),'local','active',hashlib.sha256(body).hexdigest()))]))
    return uid, key

@pytest.mark.parametrize('body,suffix,mime', [(PNG,'jpg','image/png'),(PNG,'','image/png'),(PNG,'PNG','image/png'),(JPEG,'png','image/jpeg'),(JPEG,'jpeg','image/jpeg'),(JPEG,'JPG','image/jpeg')])
def test_actual_passive_image_type_and_head(runtime, body, suffix, mime):
    client, _ = runtime
    uid, _ = register(runtime, body, suffix)
    url = '/api/admin/media/' + uid + '/content'
    head = client.head(url)
    response = client.get(url)
    assert head.status_code == response.status_code == 200
    assert head.headers['content-type'] == response.headers['content-type'] == mime
    assert int(head.headers['content-length']) == len(body)
    assert head.content == b'' and response.content == body
    assert response.headers['content-disposition'].startswith('inline;')
    assert response.headers['x-content-type-options'] == 'nosniff'
    assert 'no-store' in response.headers['cache-control']

@pytest.mark.parametrize('body', [b'<svg xmlns="http://www.w3.org/2000/svg"></svg>',b'<html>not an image</html>',b'',b'random bytes'])
def test_claimed_jpeg_does_not_enable_active_or_unknown_content(runtime, body):
    client, _ = runtime
    uid, _ = register(runtime, body)
    response = client.get('/api/admin/media/' + uid + '/content')
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/octet-stream'
    assert response.headers['content-disposition'].startswith('attachment;')
    assert response.content == body

def test_upload_signature_policy_is_still_strict():
    assert signature(PNG, 'jpg') is None
    assert signature(JPEG, 'png') is None
    assert signature(b'<svg/>', 'svg') is None
    assert signature(PNG, 'png') == 'image/png'

def test_actual_file_size_limit_still_applies(runtime):
    client, r = runtime
    uid, key = register(runtime, b'')
    with r.media_store.path(key).open('r+b') as handle:
        handle.truncate(20 * 1024 * 1024 + 1)
    assert client.head('/api/admin/media/' + uid + '/content').status_code == 413

@pytest.mark.parametrize('value,expected', [('bytes=0-99',JPEG[:100]),('bytes=65500-65600',JPEG[65500:65601]),('bytes=-10',JPEG[-10:]),('bytes=140000-',JPEG[140000:])])
def test_real_range_bytes(runtime, value, expected):
    client, _ = runtime
    uid, _ = register(runtime, JPEG)
    response = client.get('/api/admin/media/' + uid + '/content', headers={'Range':value})
    assert response.status_code == 206 and response.content == expected
    assert len(response.content) == int(response.headers['content-length'])
    assert response.headers['content-range'].endswith('/' + str(len(JPEG)))

def test_invalid_range_and_stale_if_range(runtime):
    client, _ = runtime
    uid, _ = register(runtime, JPEG)
    url = '/api/admin/media/' + uid + '/content'
    assert client.get(url, headers={'Range':'bytes=999999-'}).status_code == 416
    response = client.get(url, headers={'Range':'bytes=0-3','If-Range':'"old-version"'})
    assert response.status_code == 200 and response.content == JPEG

def test_permissions_missing_body_and_changed_version(runtime):
    client, r = runtime
    uid, key = register(runtime, PNG, 'jpg')
    assert client.get('/media/' + uid, headers={'Cookie':''}).status_code == 404
    assert client.get('/api/admin/media/' + uid + '/content', headers={'Cookie':''}, follow_redirects=False).status_code in (401,403)
    store = inventory(r.media_store)
    old = asyncio.run(store.head(key))
    asyncio.run(r.media_store.put(key, PNG + b'changed'))
    with pytest.raises(Error) as error:
        asyncio.run(store.read_range(key,0,10,old['version']))
    assert error.value.status == 409
    asyncio.run(r.media_store.delete(key))
    assert client.head('/api/admin/media/' + uid + '/content').status_code == 404

@pytest.mark.parametrize('limit,expected_status', [(8,503),(16,200)])
def test_connection_limit_static_requests(runtime, limit, expected_status):
    """Controlled reproduction on the real app; not an assertion about user traffic."""
    client, _ = runtime
    listener = socket.socket()
    listener.bind(('127.0.0.1',0))
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(client.app,limit_concurrency=limit,lifespan='off',log_level='critical',access_log=False))
    thread = threading.Thread(target=server.run,kwargs={'sockets':[listener]},daemon=True)
    thread.start()
    holders = []
    try:
        deadline = time.monotonic() + 5
        while not server.started and time.monotonic() < deadline:
            time.sleep(.01)
        assert server.started
        holders = [socket.create_connection(('127.0.0.1',port),timeout=2) for _ in range(8)]
        deadline = time.monotonic() + 2
        while len(server.server_state.connections) < 8 and time.monotonic() < deadline:
            time.sleep(.01)
        connection = http.client.HTTPConnection('127.0.0.1',port,timeout=3)
        connection.request('GET','/assets/admin/js/native-media.js',headers={'Host':'127.0.0.1:8765','Connection':'close'})
        response = connection.getresponse()
        assert response.status == expected_status
        response.read();connection.close()
        for holder in holders:holder.close()
        holders.clear()
        deadline = time.monotonic() + 2
        while server.server_state.connections and time.monotonic() < deadline:
            time.sleep(.01)
        connection = http.client.HTTPConnection('127.0.0.1',port,timeout=3)
        connection.request('GET','/assets/admin/js/native-media.js',headers={'Host':'127.0.0.1:8765','Connection':'close'})
        response = connection.getresponse()
        assert response.status == 200
        response.read();connection.close()
    finally:
        for holder in holders:holder.close()
        server.should_exit = True
        thread.join(timeout=5)
        listener.close()

@pytest.mark.parametrize('value,expected', [(None,16),('8',8),('32',32),('0',None),('33',None),('bad',None)])
def test_bounded_launch_capacity(monkeypatch, value, expected):
    from deploy.shared.http_limits import teacher_concurrency
    if value is None:monkeypatch.delenv('TEACHER_HTTP_CONCURRENCY',raising=False)
    else:monkeypatch.setenv('TEACHER_HTTP_CONCURRENCY',value)
    if expected is None:
        with pytest.raises(ValueError):teacher_concurrency()
    else:
        assert teacher_concurrency() == expected

def test_vps_generation_reuses_main_limit_for_integrated_transfer(tmp_path, monkeypatch):
    from deploy.vps.release import render
    monkeypatch.setenv('TEACHER_HTTP_CONCURRENCY','16')
    destination = tmp_path / 'generated'
    render(destination,'/opt/test-teacher','teacher.example.test','transfer.example.test','/opt/test-venv/bin/python')
    assert '--limit-concurrency 16 ' in (destination / 'teacher-site.service').read_text()
    assert not (destination / 'teacher-transfer.service').exists()
    assert '8004' not in (destination / 'Caddyfile.fragment').read_text()
