"""核对报告的列表适配：共用列表协议，筛选全部已扫描项，不重新扫描磁盘。"""
import json
from pathlib import PurePosixPath
from .catalog import Error
from .media_policy import EXTENSIONS
from .media_inventory_store import digest
from .student_categories import page_numbers

KINDS={'image':'图片','video':'视频','pdf':'PDF','archive':'压缩包','other':'其他文件'}
COLUMNS=['__preview','name','key','category','kind','size']
LABELS={'__preview':'预览','name':'文件名','key':'磁盘绝对路径 / 存储位置','category':'核对结果','kind':'文件类型','size':'大小/KB'}

def media_hint(row):
    suffix=PurePosixPath(row['key']).suffix.lower().lstrip('.')
    mime=row.get('mime_type') or next((m for m,exts in EXTENSIONS.items() if suffix in exts),'application/octet-stream')
    kind='image' if mime.startswith('image/') else 'video' if mime.startswith('video/') else 'pdf' if mime=='application/pdf' else 'archive' if mime=='application/zip' else 'other'
    return mime,kind

def compact(row,page,index):
    """索引只保存筛选所需元信息；不缓存媒体正文或创建业务数据库表。"""
    return {'key':row['key'],'name':row.get('original_filename') or PurePosixPath(row['key']).name,
        'title':row.get('title') or '', 'category':row['category'],'kind':media_hint(row)[1],
        'size':row['size'],'position':page*20+index,'storage_kind':row.get('storage_kind','')}

async def append_index(audit,state,page,rows):
    if not state.get('list_index'):return
    key=audit.root(state['id'])+f'/index-{page//5}.json'
    previous=await audit.read_json(key) if page%5 else []
    # Replayed scan step replaces this page's entries rather than duplicating them.
    entries=[r for r in (previous or []) if r['position']//20<page]
    await audit.write_json(key,entries+[compact(row,page,i) for i,row in enumerate(rows)])

def specifications(categories):
    return {'__preview':{'kind':'derived'},'name':{'kind':'text'},'key':{'kind':'text'},
        'category':{'kind':'text','enum':list(categories),'option_labels':categories,'multi':True,'filter_prefix':'f.','filter_note':'按Ctrl/Command或Shift可选择多项；选中任一项即可匹配。'},
        'kind':{'kind':'text','enum':list(KINDS),'option_labels':KINDS,'multi':True,'filter_prefix':'f.','filter_note':'按Ctrl/Command或Shift可选择多项；选中任一项即可匹配。'},
        'size':{'kind':'integer','filter_prefix':'f.','filter_scale':1024,'filter_note':'输入KB数值，按实际字节大小精确筛选；排序按实际字节数。'}}

def parameters(query,categories):
    values={}
    for field in ('q','c.name','c.key'):
        value=query.get(field,'').strip()
        if len(value)>500:raise Error('筛选文本最多500字符')
        if value:values[field]=value
    for field,allowed in (('f.category',categories),('f.kind',KINDS)):
        raw=query.get(field,query.get('category','') if field=='f.category' else '')
        if len(raw)>1000:raise Error('筛选条件过长')
        try:items=json.loads(raw) if raw.startswith('[') else [raw] if raw else []
        except ValueError:raise Error('筛选格式无效') from None
        if not isinstance(items,list) or len(items)>len(allowed) or any(not isinstance(v,str) or v not in allowed for v in items):raise Error('筛选选项无效')
        if items:values[field]=json.dumps(sorted(set(items)),separators=(',',':'))
    if query.get('f.size',''):
        raw=query['f.size']
        if len(raw)>20 or not raw.isascii() or not raw.isdigit():raise Error('大小筛选无效')
        values['f.size']=str(int(raw))
    values['sort']=query.get('sort') or 'position';values['direction']=query.get('direction') or 'asc'
    if values['sort'] not in ('position','name','key','category','kind','size') or values['direction'] not in ('asc','desc'):raise Error('排序条件无效')
    try:page=max(1,min(20000,int(query.get('page',1))));size=int(query.get('size',20))
    except (TypeError,ValueError):raise Error('分页参数无效') from None
    if size not in (10,20,50,100):raise Error('每页数量无效')
    return values,page,size

async def listing(audit,report,query,categories):
    state=await audit.state(report,True);params,page,size=parameters(query,categories)
    fingerprint=digest((state['version'],json.dumps(params,sort_keys=True)))
    cache_key=audit.root(report)+'/list-view.json';cached=await audit.read_json(cache_key)
    if not cached or cached.get('fingerprint')!=fingerprint:
        kinds=json.loads(params.get('f.kind','[]'));groups=json.loads(params.get('f.category','[]'))
        root=str(audit.store.root.resolve()) if hasattr(audit.store,'root') else ''
        hits=[]
        async def records():
            if state.get('list_index'):
                for block in range((len(state['pages'])+4)//5):
                    rows=await audit.read_json(audit.root(report)+f'/index-{block}.json')
                    if rows is None:raise Error('报告索引已缺失，请清除并重新扫描',409)
                    for row in rows:
                        p,i=divmod(row['position'],20)
                        if p<len(state['pages']) and i<sum(state['pages'][p].values()):yield row
            else:
                # 已有24小时报告可继续使用；重新扫描后使用合并索引减少读取次数。
                for p in range(len(state['pages'])):
                    rows=await audit.read_json(audit.root(report)+f'/page-{p}.json')
                    if rows is None:raise Error('报告页已缺失，请重新扫描',409)
                    for i,row in enumerate(rows):yield compact(row,p,i)
        async for row in records():
            if groups and row['category'] not in groups or kinds and row['kind'] not in kinds:continue
            if 'f.size' in params and row['size']!=int(params['f.size']):continue
            path=(root+'/'+row['key']) if root and row['category']!='external' and row['storage_kind'] in ('',audit.r.kind) else row['key']
            name=(row['name']+' '+row['title']).casefold();path=path.casefold()
            if params.get('q','').casefold() not in name+' '+path or params.get('c.name','').casefold() not in name or params.get('c.key','').casefold().replace('\\','/') not in path.replace('\\','/'):continue
            value=row[params['sort']]
            if isinstance(value,str):value=value.casefold()
            hits.append((value,row['position']))
        hits.sort(reverse=params['direction']=='desc')
        cached={'fingerprint':fingerprint,'positions':[position for _,position in hits]}
        # 每个报告仅保留一个查询索引槽，反复筛选不会累积缓存文件。
        await audit.write_json(cache_key,cached)
    total=len(cached['positions']);pages=max(1,(total+size-1)//size);page=min(page,pages)
    selected=[];loaded={}
    for position in cached['positions'][(page-1)*size:page*size]:
        p,i=divmod(position,20)
        if p not in loaded:loaded[p]=await audit.read_json(audit.root(report)+f'/page-{p}.json')
        if not loaded[p] or i>=len(loaded[p]):raise Error('报告页已缺失，请重新扫描',409)
        row=dict(loaded[p][i],report_page=p,report_index=i)
        row.update(name=row.get('original_filename') or PurePosixPath(row['key']).name,mime_type=media_hint(row)[0],kind=media_hint(row)[1],disk_path='')
        if hasattr(audit.store,'absolute_path') and row['category']!='external' and row.get('storage_kind',audit.r.kind)==audit.r.kind:
            try:row['disk_path']=audit.store.absolute_path(row['key'])
            except (Error,OSError):pass
        row['preview_url']=('/api/admin/media/'+row['uid']+'/content') if row['uid'] else f'/api/admin/media-audit/{report}/{p}/{i}/content'
        row['previewable']=row['category'] not in ('missing','pending') and (bool(row['uid']) or bool(row.get('object_version')))
        selected.append(row)
    return state,{'rows':selected,'page':page,'pages':pages,'total':total,'size':size,'numbers':page_numbers(page,pages),'query':params|{'size':str(size)}}
