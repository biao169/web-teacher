"""Read one public description on demand; no private columns or writes."""
from .catalog import Error
from .translation_sources import overlay

async def public_description(content,lang,table,uid,*,fixed_conditions=None):
    if lang not in ('zh','en') or table not in ('students','courses') or not uid or len(uid)>128:
        raise Error('未找到公开简介',404)
    field='bio' if table=='students' else 'summary'
    where,args=content.scope(table,public=True,fixed_conditions=fixed_conditions)
    rows=await content.sql.query(f'SELECT uid,"{field}" FROM "{table}" WHERE '+where+' AND uid=? LIMIT 1',[*args,uid])
    if not rows:raise Error('未找到公开简介',404)
    row=rows[0]
    if lang=='en':await overlay(content.sql,table,row)
    return {'lang':lang,'table':table,'uid':uid,'text':row.get(field) or ''}
