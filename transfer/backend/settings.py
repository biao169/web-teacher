"""Validated edits to the existing settings JSON; no new schema or parallel policy store."""
import copy
from backend.app.native.catalog import Error
from .accounting import limit,period_starts
QUOTAS=('dailyBytes','weeklyBytes','monthlyBytes','maxFileBytes')

def select_rule(settings,p):
    pairs=[('user',p['uid']),('role',p.get('role_id')) ,('registered','')] if p else [('anonymous','')]
    return next((rule for kind,ident in pairs for rule in settings.get('rules',[]) if rule.get('kind')==kind and str(rule.get('id',''))==str(ident)),{})

def edit(settings,data):
    value=copy.deepcopy(settings)
    switches=('enabled','lanEnabled','relayEnabled','temporaryAutoCleanup','vpnGuard','allowUploads','allowDownloads')
    numbers=tuple('total'+k[0].upper()+k[1:] for k in QUOTAS[:3])+tuple('guest'+k[0].upper()+k[1:] for k in QUOTAS[:3])+('maxFileBytes','temporaryStorageBytes','temporaryFreeBytes')
    counts={'guestConcurrency':(1,100),'concurrency':(1,100),'temporaryHours':(1,168),'temporaryCleanupMinutes':(1,1440),'temporaryMaxDownloads':(1,10000)}
    allowed={'_csrf','revision','temporaryShare','guestReceive','personalTimeZone','customRules',*switches,*numbers,*counts,*QUOTAS}
    if set(data)-allowed:raise Error('设置包含未知字段')
    for key in (*switches,'temporaryShare','guestReceive'):
        if key in data and not isinstance(data[key],bool):raise Error('开关值无效')
    for key in switches:
        if key in data:value[key]=data[key]
    for key in numbers:
        if key not in data:continue
        number=limit(data[key])
        if key=='temporaryFreeBytes' and number is None:raise Error('磁盘安全余量需要明确填写，0表示不预留')
        if key=='temporaryStorageBytes' and (number is None or number<1):raise Error('存储上限必须大于0')
        value[key]=None if number is None else str(number)
    for key,(low,high) in counts.items():
        if key not in data:continue
        number=limit(data[key])
        if number is None or not low<=number<=high:raise Error('并发数、有效期或下载次数超出允许范围')
        if key!='concurrency':value[key]=number
    if 'personalTimeZone' in data:period_starts(data['personalTimeZone']);value['personalTimeZone']=data['personalTimeZone']
    for rule in value['rules']:
        if 'relayEnabled' in data:
            rule['links']=[x for x in rule.get('links',[]) if x!='wan-relay']+(['wan-relay'] if data['relayEnabled'] else [])
        switch={'registered':'temporaryShare','anonymous':'guestReceive'}.get(rule['kind'])
        if switch in data:
            rule['links']=[x for x in rule['links'] if x!='temporary-share']+(['temporary-share'] if data[switch] else [])
            if rule['kind']=='anonymous':rule['receive']=data[switch]
        if rule['kind']=='anonymous' and 'guestConcurrency' in data:rule['concurrency']=int(data['guestConcurrency'])
        if rule['kind']=='registered':
            for key in QUOTAS[:3]:
                if key in data:
                    number=limit(data[key]);rule[key]=None if number is None else str(number)
            if 'concurrency' in data:rule['concurrency']=int(data['concurrency'])
    if 'customRules' in data:
        rules=data['customRules']
        if not isinstance(rules,list) or len(rules)>100:raise Error('专属规则最多100条')
        originals={(r['kind'],str(r.get('id',''))):r for r in value['rules']}
        seen=set();custom=[]
        for row in rules:
            if not isinstance(row,dict) or set(row)!={'kind','id','send','receive','concurrency',*QUOTAS}:raise Error('专属规则字段无效')
            kind,ident=row['kind'],row['id']
            if kind not in ('user','role') or not isinstance(ident,str) or not 1<=len(ident)<=128 or any(c.isspace() or ord(c)<32 for c in ident):raise Error('请填写用户UID或角色ID，不是显示名称')
            if (kind,ident) in seen:raise Error('同一用户或角色只能设置一条规则')
            seen.add((kind,ident));rule=copy.deepcopy(originals.get((kind,ident),select_rule(value,{'uid':'','role_id':None})))
            rule.update(kind=kind,id=ident)
            for key in ('send','receive'):
                if not isinstance(row[key],bool):raise Error('专属规则开关无效')
                rule[key]=row[key]
            rule['links']=list(dict.fromkeys([*rule.get('links',[]),'temporary-share']))
            for key in QUOTAS:
                number=limit(row[key])
                rule[key]=None if number is None else str(number)
            concurrency=limit(row['concurrency'])
            if concurrency is None or not 1<=concurrency<=100:raise Error('并发数须为1至100')
            rule['concurrency']=concurrency;custom.append(rule)
        value['rules']=[r for r in value['rules'] if r['kind'] not in ('user','role')]+custom
    return value
