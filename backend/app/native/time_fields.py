"""UI timezone conversion only; stored timestamps and API UTC semantics stay unchanged."""
from datetime import datetime,timezone
from zoneinfo import ZoneInfo,ZoneInfoNotFoundError
from .catalog import Error,fields
DEFAULT_ZONE='Asia/Shanghai'
ZONES=(('Asia/Shanghai','北京时间'),('UTC','世界协调时'),('Asia/Tokyo','东京'),('Asia/Singapore','新加坡'),('Europe/London','伦敦'),('America/New_York','纽约'),('America/Los_Angeles','洛杉矶'))

def zone(name):
    if not isinstance(name,str) or len(name)>100:raise Error('时区无效')
    try:return ZoneInfo(name)
    except (ValueError,ZoneInfoNotFoundError):raise Error('时区不存在或缺少时区数据，请检查依赖安装') from None

def local_value(value,name=DEFAULT_ZONE):
    if not value:return ''
    dt=datetime.fromisoformat(str(value).replace('Z','+00:00'))
    if dt.tzinfo is None:dt=dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(zone(name)).isoformat(timespec='milliseconds')[:23]

def to_utc(value,name,fold=''):
    tz=zone(name)
    if not value:return None
    try:
        dt=datetime.fromisoformat(value)
        if dt.tzinfo is not None:raise ValueError()
    except (ValueError,TypeError):raise Error('请使用日期时间组件填写当地时间') from None
    try:choices=sorted({utc for f in (0,1) if (utc:=dt.replace(tzinfo=tz,fold=f).astimezone(timezone.utc)).astimezone(tz).replace(tzinfo=None)==dt})
    except (OverflowError,ValueError):raise Error('日期时间超出可转换范围') from None
    if not choices:raise Error('该当地时间因夏令时跳转不存在，请选择其他时间')
    if len(choices)>1 and fold not in ('0','1'):raise Error('该当地时间出现两次，请选择较早或较晚的一次')
    return choices[int(fold) if len(choices)>1 else 0].isoformat(timespec='milliseconds').replace('+00:00','Z')

def form_times(table,data):
    for name,spec in fields(table).items():
        key='_timezone_'+name
        if key not in data:continue
        if spec.get('format')!='timestamp':raise Error('此字段不支持时区输入')
        tz=data.pop(key);fold=data.pop('_fold_'+name,'')
        if name not in data:raise Error('缺少日期时间字段')
        data[name]=to_utc(data[name],tz,fold)
