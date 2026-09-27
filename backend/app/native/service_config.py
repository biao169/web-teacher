"""Shared native provider-list and form rules; defaults never write settings at startup."""
import json,re
from .catalog import Error

def provider_settings(values,default_field,list_field,providers,recommended):
    """Resolve an empty original config; retain explicit defaults, order and disabled sources."""
    default=values.get(default_field)
    raw=values.get(list_field,[])
    try:raw=json.loads(raw) if isinstance(raw,str) else raw
    except ValueError:raise Error('服务列表格式无效') from None
    if not isinstance(raw,list) or len(raw)>len(providers) or any(not isinstance(x,str) or x not in providers for x in raw) or len(set(raw))!=len(raw):raise Error('服务列表必须是已支持且不重复的服务标识；密钥使用专用配置项')
    if default and (not isinstance(default,str) or default not in providers):raise Error('默认服务尚未支持，请选择有效服务')
    enabled=raw or ([default] if default else list(recommended))
    default=default or enabled[0]
    if default not in enabled:raise Error('默认服务必须在启用列表中')
    return {'default':default,'enabled':enabled}

def provider_form(data,prefix,list_field,providers):
    """Convert shared checkboxes/order into the existing JSON array, including without JS."""
    if not data.pop('_'+prefix+'_providers_present',None):return
    chosen=[]
    for key in providers:
        enabled=data.pop('_'+prefix+'_enabled_'+key,None);position=data.pop('_'+prefix+'_order_'+key,str(len(providers)))
        if enabled not in (None,'1'):raise Error('服务启用选项无效')
        if not re.fullmatch('[1-'+str(len(providers))+']',str(position)):raise Error('服务顺序超出允许范围')
        if enabled:chosen.append((int(position),key))
    if not chosen:raise Error('请至少启用一个服务')
    data[list_field]=json.dumps([key for _,key in sorted(chosen,key=lambda x:x[0])])
