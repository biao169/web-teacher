"""Site-wide retry cadence; per-task retry count remains independently configurable."""
import json
KEY='sync:retry-settings'
def validate(value):
    if not isinstance(value,dict) or set(value)!={'fast_retry_seconds'}:raise ValueError('Invalid retry policy')
    v=value['fast_retry_seconds']
    if type(v)!=int or not 10<=v<=300:raise ValueError('Fast retry must be 10..300 seconds')
    return {'fast_retry_seconds':v}
async def read(db):
    rows=await db.query('SELECT value FROM service_meta WHERE key=?',(KEY,))
    return validate(json.loads(rows[0]['value'])) if rows else {'fast_retry_seconds':10}
