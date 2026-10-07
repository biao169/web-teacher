"""Folder receive control reuses the existing keyed, metered chunk session."""
import json
from backend.app.native.catalog import Error
from .accounting import Accounting,assertion,limit,milliseconds as ms
from .folders import PAGE,entry_key,prefix,integer
from .receivers import TTL

async def limits(receiver,row,settings,rule):
    info=json.loads(row['summary']);size=int(row['reserved_bytes'])
    if not info.get('manifestReady'):raise Error('目录清单未完成',409)
    if info['fileCount']>int(rule.get('maxFiles',1)):raise Error('目录超过当前接收身份文件数限制',403)
    cap=limit(rule.get('maxTaskBytes'))
    if cap is not None and size>cap:raise Error('目录超过当前接收身份任务大小限制',403)
    caps=[n for n in (limit(rule.get('maxFileBytes')),limit(settings.get('maxFileBytes'))) if n is not None]
    if caps:
        largest=(await receiver.sql.query("SELECT coalesce(max(CAST(json_extract(value,'$.size') AS INTEGER)),0) n FROM service_meta WHERE key>=? AND key<?",(entry_key(row['id'],0),prefix(row['id'])+'f')))[0]['n']
        if largest>min(caps):raise Error('目录内文件超过接收身份单文件限制',403)

async def operate(receiver,id,key,action,data):
    member=await receiver.load(id,key)
    source=(await receiver.sql.query('SELECT * FROM temporary_shares WHERE id=?',(member['task'],)))[0];info=json.loads(source['summary'])
    if info.get('kind')!='folder':raise Error('不是目录接收会话',409)
    await receiver.service.policy(receiver.r.p,'receive')
    if action=='finish':
        if member['state']=='complete':return {'complete':True}
        if member['offset']!=int(source['reserved_bytes']) or member['pending'] is not None:raise Error('目录数据尚未确认完整',409)
        await receiver.sql.batch([receiver.guard(member),("UPDATE transfer_receivers SET state='complete' WHERE id=?",(id,)),Accounting(receiver.sql).release(member['task'],id)])
        return {'complete':True}
    if member['state']=='active':
        expiry=min(source['expires_at'],ms()+TTL)
        await receiver.sql.batch([assertion("EXISTS(SELECT 1 FROM transfer_receivers v JOIN temporary_shares s ON s.id=v.task JOIN recovery_tasks r ON r.id=s.id WHERE v.id=? AND v.state='active' AND v.expires_at>? AND s.state='ready' AND s.expires_at>? AND r.updated_at=v.stamp)",(id,ms(),ms())),('UPDATE transfer_receivers SET expires_at=max(expires_at,?) WHERE id=?',(expiry,id)),('UPDATE transfer_allowances SET expires_at=max(expires_at,?) WHERE task=? AND member=? AND finished_at IS NULL',(expiry,member['task'],id))])
    if action=='touch':return {'ok':True}
    after=integer(data.get('after',0),12000)
    rows=await receiver.sql.query('SELECT value FROM service_meta WHERE key>=? AND key<? ORDER BY key LIMIT ?',(entry_key(source['id'],after),prefix(source['id'])+'f',PAGE))
    entries=[json.loads(row['value']) for row in rows];end=after+len(entries)
    return {'name':info['name'],'size':int(source['reserved_bytes']),'fileCount':info['fileCount'],'directoryCount':info['directoryCount'],'entries':entries,'next':end if entries and end<info['received'] else None,'total':info['received']}
