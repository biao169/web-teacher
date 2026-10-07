"""Allow only existing editable ordering fields through the shared row action."""
import re
from .catalog import fields,Error
ORDER_FIELDS=('sort_order','display_order')
def patch(table,field,value):
    if field not in ORDER_FIELDS or fields(table).get(field,{}).get('kind')!='integer':raise Error('不支持此排序字段')
    if isinstance(value,bool) or not (type(value) is int or isinstance(value,str) and re.fullmatch(r'-?[0-9]{1,17}',value)):
        raise Error('排序值必须为整数')
    return {field:value}
