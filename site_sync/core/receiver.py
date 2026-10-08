"""Shared admission for manual pulls, incoming proposals and scheduled pulls.
Approval policy is supplied by the trusted caller; transfer remains checkpointed.
"""
from .input_errors import InputError
from .selection import normalize,is_restore

def selection(value):
    if not isinstance(value,list) or not 1<=len(value)<=64 or any(not isinstance(x,str) or not 1<=len(x)<=64 for x in value):
        raise InputError('scope','请选择有效的同步内容','1—64 个范围标识')
    if 'site_clone' in value and value!=['site_clone']:raise InputError('scope','整站范围不能与其他范围混用','统一选择 restore_* 分项')
    try:return normalize(value)
    except ValueError:raise InputError('scope','不能混用普通业务范围与分项恢复范围，请刷新后重新选择','统一选择 restore_* 分项') from None

def validate(values):
    values=dict(values)
    values['scope']=selection(values.get('scope'))
    if values.get('settings') is not None and not isinstance(values['settings'],dict):raise InputError('settings','参数覆盖必须为对象','JSON 对象或留空')
    mode=values.get('mode','manual')
    auto=values.get('auto_confirm',False)
    delete=values.get('auto_delete',True)
    for field,value in [('auto_confirm',auto),('auto_delete',delete)]:
        if type(value)!=bool:raise InputError(field,'确认策略必须为布尔值','true / false')
    if is_restore(values['scope']) and (auto or mode=='scheduled') and not delete:
        raise InputError('auto_delete','分项恢复自动确认需要允许替换/删除；也可关闭自动确认，稍后人工批准','允许替换/删除，或使用人工确认')
    from .settings import validate as settings_validate
    if values.get('settings') is not None:settings_validate(values['settings'],partial=True)
    return values

async def create_receiver(repo,**values):
    return await repo.create(**validate(values))
