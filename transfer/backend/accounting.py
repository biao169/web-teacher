"""日/周/月授权字节预留与结算，复用原生transfer_allowances，不改变数据库结构。"""
import json,time,secrets
from datetime import datetime,timezone,timedelta
from backend.app.native.catalog import Error
from backend.app.native.auth import sha

def milliseconds():
    """返回UTC毫秒，所有配额及租约使用同一时基。"""
    return int(time.time()*1000)

def assertion(condition,args=()):
    """条件不满足时由原生NOT NULL约束中止整个SQLite/D1事务。"""
    return ('INSERT INTO bridge_nonces(jti,expires_at) SELECT ?,NULL WHERE NOT ('+condition+')',('guard:'+secrets.token_hex(16),*args))

def identity(p):
    """用户配额独立于角色变更，匿名下载共享同一池，不按IP拆分。"""
    return 'user:'+sha(p['uid']) if p else 'guest:shared'

def period_starts(name,at=None):
    """使用明确的中国标准时间或UTC日/周/月边界，避免依赖Worker时区数据库。"""
    if name not in ('Asia/Shanghai','UTC'):raise Error('流量计量时区请选择Asia/Shanghai或UTC')
    zone=timezone(timedelta(hours=8 if name=='Asia/Shanghai' else 0))
    value=datetime.fromtimestamp((at if at is not None else milliseconds())/1000,zone)
    day=value.replace(hour=0,minute=0,second=0,microsecond=0)
    return int(day.timestamp()*1000),int(day.replace(day=1).timestamp()*1000)

def periods(name,at=None):
    """周一零点开始；保持原有日/周/月边界接口兼容。"""
    day,month=period_starts(name,at)
    zone=timezone(timedelta(hours=8 if name=='Asia/Shanghai' else 0))
    weekday=datetime.fromtimestamp(day/1000,zone).weekday()
    return [('daily','dailyBytes',day),('weekly','weeklyBytes',day-weekday*86400000),('monthly','monthlyBytes',month)]

def limit(value):
    """空值表示不限，零表示禁止；只接受安全范围内的非负整数字节。"""
    if value in (None,''):return None
    if isinstance(value,bool) or not str(value).isdigit():raise Error('额度必须为非负整数字节，留空为不限')
    number=int(value)
    if number>9007199254740991:raise Error('额度超出安全整数范围')
    return number

# 过期未关闭的预留只保留已结算字节；旧版未知outcome保守保留原bytes。
ACCOUNTED="CASE WHEN finished_at IS NULL AND expires_at<=? AND json_valid(outcome) THEN coalesce(CAST(json_extract(outcome,'$.used') AS INTEGER),CAST(bytes AS INTEGER)) ELSE CAST(bytes AS INTEGER) END"

class Accounting:
    def __init__(self,sql):
        """共享请求内SQL适配器，所有写入可并入任务事务。"""
        self.sql=sql

    def reserve(self,p,task,member,size,kind,settings,rule,expiry):
        """在同一事务内检查日/周/月用量与配置版本，然后占用本次授权字节。"""
        at=milliseconds();who=identity(p)
        statements=[assertion('EXISTS(SELECT 1 FROM tool_settings WHERE id=1 AND revision=?)',(settings['_revision'],))]
        for _,key,start in periods(settings.get('personalTimeZone','Asia/Shanghai'),at):
            total=limit(settings.get('total'+key[0].upper()+key[1:]))
            if total is not None:
                statements.append(assertion('(SELECT coalesce(sum('+ACCOUNTED+'),0) FROM transfer_allowances WHERE authorized_at>=?)+?<=?',(at,start,size,total)))
            values=[limit(rule.get(key))]
            if not p:values.append(limit(settings.get('guest'+key[0].upper()+key[1:])))
            available=[x for x in values if x is not None]
            if available:
                cap=min(available)
                statements.append(assertion('(SELECT coalesce(sum('+ACCOUNTED+'),0) FROM transfer_allowances WHERE identity_key=? AND authorized_at>=?)+?<=?',(at,who,start,size,cap)))
        if kind=='receive':
            concurrency=int(rule.get('concurrency') or 1)
            if not p:concurrency=min(concurrency,int(settings.get('guestConcurrency') or 1))
            statements.append(assertion("(SELECT count(*) FROM transfer_allowances WHERE identity_key=? AND kind='receive' AND finished_at IS NULL AND expires_at>?)<?",(who,at,concurrency)))
        outcome=json.dumps({'used':0,'reserved':size,'phase':'active'})
        statements.append(('INSERT INTO transfer_allowances(task,member,identity_key,kind,bytes,created_at,authorized_at,expires_at,outcome) VALUES (?,?,?,?,?,?,?,?,?)',(task,member,who,kind,str(size),at,at,expiry,outcome)))
        return statements

    def charge(self,task,member,size,complete=False):
        """按已接受上传/即将发出的下载块记账，和检查点或下载状态原子提交。"""
        at=milliseconds();used="coalesce(CAST(json_extract(outcome,'$.used') AS INTEGER),0)"
        return [assertion('EXISTS(SELECT 1 FROM transfer_allowances WHERE task=? AND member=? AND finished_at IS NULL AND expires_at>? AND '+used+'+?<=CAST(bytes AS INTEGER))',(task,member,at,size)),
                ('UPDATE transfer_allowances SET outcome=json_set(outcome,\'$.used\','+used+'+?),bytes=CASE WHEN ? THEN CAST('+used+'+? AS TEXT) ELSE bytes END,finished_at=CASE WHEN ? THEN ? ELSE NULL END WHERE task=? AND member=?',(size,int(complete),size,int(complete),at,task,member))]

    def release(self,task,member=None):
        """取消/清理只释放未传额度，已经结算的字节不退款、不删除用量历史。"""
        condition='task=?'+(' AND member=?' if member else '')
        return ('UPDATE transfer_allowances SET bytes=CASE WHEN json_valid(outcome) THEN CAST(coalesce(json_extract(outcome,\'$.used\'),CAST(bytes AS INTEGER)) AS TEXT) ELSE bytes END,finished_at=? WHERE '+condition+' AND finished_at IS NULL',(milliseconds(),task,*((member,) if member else ())))

    async def usage(self,p,settings,rule):
        """显示当前身份按授权时间归属的已用加预留量，以及每周期剩余额度。"""
        at=milliseconds();result={}
        for label,key,start in periods(settings.get('personalTimeZone','Asia/Shanghai'),at):
            value=(await self.sql.query('SELECT coalesce(sum('+ACCOUNTED+'),0) n FROM transfer_allowances WHERE identity_key=? AND authorized_at>=?',(at,identity(p),start)))[0]['n']
            caps=[limit(rule.get(key))]
            if not p:caps.append(limit(settings.get('guest'+key[0].upper()+key[1:])))
            caps=[x for x in caps if x is not None];cap=min(caps) if caps else None
            result[label]={'charged_and_reserved':value,'limit':cap,'remaining':None if cap is None else max(0,cap-value)}
        return result

    async def total_usage(self,settings):
        """管理员全站用量；汇总复用同一授权账本，不生成第二份流量历史。"""
        at=milliseconds();result={}
        for label,key,start in periods(settings.get('personalTimeZone','Asia/Shanghai'),at):
            value=(await self.sql.query('SELECT coalesce(sum('+ACCOUNTED+'),0) n FROM transfer_allowances WHERE authorized_at>=?',(at,start)))[0]['n']
            cap=limit(settings.get('total'+key[0].upper()+key[1:]))
            result[label]={'charged_and_reserved':value,'limit':cap,'remaining':None if cap is None else max(0,cap-value)}
        return result
