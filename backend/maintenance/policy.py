"""One validated policy for scheduled, CLI and admin maintenance; existing key/value table."""
import json
from backend.app.native.catalog import Error
KEY='runtime:maintenance-policy'
DEFAULTS={'enabled':True,'interval_minutes':15,'session_days':30,'report_grace_hours':24,'temporary_hours':24,'operation_days':180,'operation_max':20000,'transfer_days':90,'log_mb':10,'log_backups':5,'log_days':14}
RANGES={'interval_minutes':(1,1440),'session_days':(1,3650),'report_grace_hours':(24,8760),'temporary_hours':(24,8760),'operation_days':(1,3650),'operation_max':(1000,100000),'transfer_days':(1,3650),'log_mb':(1,100),'log_backups':(1,20),'log_days':(1,365)}

def validate(value):
    if not isinstance(value,dict) or set(value)!=set(DEFAULTS):raise Error('维护策略字段不完整或包含未知字段')
    if type(value['enabled']) is not bool:raise Error('自动清理开关无效')
    for key,(low,high) in RANGES.items():
        if type(value[key]) is not int or not low<=value[key]<=high:raise Error(f'{key} 必须在 {low}～{high} 之间')
    return value

async def load(sql):
    rows=await sql.query('SELECT value FROM service_meta WHERE key=?',(KEY,))
    if not rows:return {'revision':0,'values':dict(DEFAULTS),'raw':None}
    data=json.loads(rows[0]['value'])
    # Upgrade the previous stored policy in memory without rewriting its revision.
    data['values'].setdefault('operation_max',DEFAULTS['operation_max'])
    validate(data['values'])
    if type(data['revision']) is not int or data['revision']<1:raise Error('维护策略版本无效')
    return {**data,'raw':rows[0]['value']}
