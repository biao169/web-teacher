"""Pure public project formatting; no storage or permission changes."""
from decimal import Decimal, localcontext
import re

ROLE_ALIASES = {
    '主持': ('主持', '负责人', '项目负责人', '主持人', '主持/负责人', '主持（负责人）', 'host', 'lead', 'leader', 'pi', 'principal investigator'),
    '参与': ('参与', '成员', '项目成员', '参与者', '参与/成员', '参与（成员）', 'participant', 'member', 'participate', 'participation'),
}
ROLE_LABELS = {'主持': 'Lead', '参与': 'Participant'}

def project_role(value, lang='zh'):
    parts=[]
    for text in re.split(r'[;；\r\n]',str(value or '')):
        text=text.strip()
        if not text:continue
        canonical=next((key for key,values in ROLE_ALIASES.items() if text.lower() in values), text)
        label=ROLE_LABELS.get(canonical,canonical) if lang=='en' else canonical
        if label not in parts:parts.append(label)
    return ' / '.join(parts)

def project_role_expression(column):
    # column is provided only by the trusted public facet catalog.
    cases=' '.join("WHEN '"+alias.replace("'","''")+"' THEN '"+key+"'" for key,values in ROLE_ALIASES.items() for alias in values)
    return f"CASE lower(trim(coalesce({column},''))) {cases} ELSE trim({column}) END"

def project_amount(value, lang='zh'):
    if value is None or value=='': return ''
    text=str(value)
    if not re.fullmatch(r'(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,4})?', text): return ''
    with localcontext() as context:
        context.prec=32
        amount=Decimal(text)*(Decimal(10000) if lang=='en' else Decimal(1))
        number=format(amount, ',f' if lang=='en' else 'f')
        if '.' in number:number=number.rstrip('0').rstrip('.')
    return 'CNY '+number if lang=='en' else number+' 万元'

def project_period(start,end,lang='zh'):
    if start and end:return str(start)+' – '+str(end)
    if start:return ('From ' if lang=='en' else '起于 ')+str(start)
    if end:return ('Until ' if lang=='en' else '截至 ')+str(end)
    return ''
