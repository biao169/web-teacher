"""授权来源的可读名称、精确字段链接和只读降级；不从客户端接受任意表名。"""
import hashlib
from urllib.parse import quote,urlencode
from justhtml import JustHTML
from backend.app.domain.richtext import render_body
from .catalog import TABLES,TITLE,MODULES,Error,label
from .translation_sources import split_reference,source_format


def field_link(principal,table,uid,field):
    """仅为已授权记录生成白名单字段锚点；调用方负责记录可见范围检查。"""
    permission=(principal or {}).get('permissions',{}).get(table,{})
    if table not in TABLES or field not in TABLES[table]['columns'] or not permission.get('can_view'):
        return {'url':'','action':'来源不可访问'}
    can_edit=bool(permission.get('can_edit'))
    if table in ('auth_users','auth_roles','auth_permissions'):can_edit=can_edit and principal.get('is_system',False)
    url=('/admin/'+table+'/'+quote(uid,safe='')+'/edit#field-'+quote(field,safe='') if can_edit
         else '/admin/'+table+'?'+urlencode({'f.uid':uid})+'#record-'+quote(uid,safe=''))
    return {'url':url,'action':'定位配置项' if can_edit else '查看来源记录','field_label':label(table,field),'module_label':MODULES.get(table,table)}


async def translation_context(r,translation):
    """核对当前来源后返回标题、字段与状态；受限来源不泄露名称或位置。"""
    result={'available':False,'url':'','message':'来源不存在或当前账号无权查看。','format':'plain','text':translation.get('source_text') or ''}
    try:
        table,uid,field=split_reference(translation.get('source_ref_key'))
        row=await r.content.get(table,uid,r.p)
    except Error as error:
        if error.status not in (403,404,422):raise
        return result
    result.update(field_link(r.p,table,uid,field),available=True,title=str(row.get(TITLE.get(table,'uid')) or uid)[:240])
    same=hashlib.sha256(str(row.get(field) or '').encode()).hexdigest()==translation.get('source_hash') and (row.get(field) or '')==result['text']
    result.update(changed=not same,message='原文与当前来源一致。' if same else '来源原文已变化；下方展示此条译文对应的原文快照，请先核对来源。',format=source_format(table,row,field))
    if result['format'] in ('html','markdown'):
        # Sanitized text-only rendering never loads embedded media or executes raw source markup.
        safe,_=render_body(result['text'],result['format'])
        result['text']=JustHTML(safe,fragment=True).to_text()
    return result
