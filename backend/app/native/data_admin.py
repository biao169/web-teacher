"""Thin HTTP endpoints for business export, preflight, bounded media staging and restore."""
import hashlib,json
from fastapi import Request
from fastapi.responses import Response
from .catalog import Error,MODULES
from .data_tools import BUSINESS,DATA_LIMIT,export,csv_export,authorize
from . import data_restore


def install(app,resources,csrf,render):
    """Mount the shared admin tools without exposing generic SQL or arbitrary filesystem paths."""
    from .web_common import payload
    @app.get('/admin/data_tools')
    @app.get('/admin/import-export')
    async def page(request:Request):
        """Render the same compact sectioned workspace used by other admin editors."""
        r=await resources(request);r.auth.require(r.p,'data_tools')
        return await render(r,'admin/native-data-tools.html','data_tools',backup_tables=[{'key':t,'label':MODULES[t]} for t in BUSINESS],data_permissions=r.p['permissions']['data_tools'])
    @app.post('/api/backup/business')
    @app.post('/api/admin/data/export')
    async def download(request:Request):
        """Return safe JSON/CSV, or explicit sensitive plaintext solely for browser-side encryption."""
        r=await resources(request);data=await payload(request);csrf(request,r,data)
        fmt=data.get('format','json')
        if fmt not in ('json','csv','acms'):raise Error('导出格式无效')
        tables=data.get('tables',list(BUSINESS))
        if fmt=='csv' and (not isinstance(tables,list) or len(tables)!=1):raise Error('CSV导出只选择一张表')
        raw=await export(r,tables,sensitive=fmt=='acms')
        if fmt=='csv':raw=csv_export(json.loads(raw),tables[0])
        return Response(raw,media_type='text/csv' if fmt=='csv' else 'application/json',headers={'Content-Disposition':'attachment; filename="teacher-business.'+('csv' if fmt=='csv' else 'json')+'"','Cache-Control':'no-store'})
    @app.post('/api/admin/data/media/{uid}')
    async def media_bytes(request:Request,uid:str):
        """Export one selected active/trash local/R2 object with a current registration token."""
        r=await resources(request);data=await payload(request);csrf(request,r,data);authorize(r,'export',['media_assets'])
        rows=await r.sql.query('SELECT * FROM media_assets WHERE uid=? AND updated_at=?',(uid,data.get('stamp','')))
        if not rows:raise Error('媒体登记已变化，请重新导出',409)
        row=rows[0]
        if row['storage_kind'] not in ('local','r2'):raise Error('外链及静态媒体不随包复制')
        if not 0<row['size']<=20*1024*1024:raise Error('单个媒体文件最多20MiB')
        from .media_inventory_store import inventory
        store=inventory(r.media_store);before=await store.head(row['object_key'])
        if not before or before['size']!=row['size']:raise Error('媒体原文件缺失或大小已变化')
        raw=await store.read(row['object_key'],row['size']);after=await store.head(row['object_key'])
        checksum=hashlib.sha256(raw).hexdigest()
        if before!=after or row['checksum'] not in (None,'',checksum):raise Error('媒体内容已变化，请先核对媒体库')
        return Response(raw,media_type='application/octet-stream',headers={'X-Content-SHA256':checksum})
    @app.post('/api/admin/data/preflight')
    async def preflight(request:Request):
        """Read only a bounded metadata document; media bodies are uploaded separately."""
        r=await resources(request);authorize(r,'edit');data=await payload(request,DATA_LIMIT+65536);csrf(request,r,data)
        return await data_restore.preflight(r,data.get('document'),data.get('tables'),data.get('mode','merge'))
    @app.post('/api/admin/data/stage/{token}/{index}')
    async def stage(request:Request,token:str,index:int):
        """CSRF-authenticate a raw-file request before reserving or reading its body."""
        r=await resources(request);csrf(request,r,{})
        return await data_restore.stage(r,token,index,request)
    @app.post('/api/admin/data/execute')
    async def execute(request:Request):
        """Require the issued ticket plus identical input and explicit replacement confirmation."""
        r=await resources(request);authorize(r,'edit');data=await payload(request,DATA_LIMIT+65536);csrf(request,r,data)
        return await data_restore.execute(r,data.get('token'),data.get('document'),data.get('tables'),data.get('mode'),data.get('confirmation',''))
    @app.post('/api/admin/data/cancel')
    async def cancel(request:Request):
        """Remove an owned preflight and staged files without changing live business data."""
        r=await resources(request);data=await payload(request);csrf(request,r,data)
        await data_restore.discard(r,data.get('token'));return {'cancelled':True}
