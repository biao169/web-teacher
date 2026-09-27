"""后台单页编辑的字段呈现、工具区块和有界关联候选；不改变原生数据库定义。"""
import re
from .catalog import CONTENT, EDITORS, TITLE, fields, label, sections
from .suggestions import SUGGESTION_FIELDS,MULTIVALUE

VISIBILITY_LABELS = {'public':'公开', 'authenticated':'登录用户', 'staff':'内部成员', 'owner':'所有者范围', 'hidden':'隐藏'}
FIELD_HELP = {
    'source_citation':'粘贴一条完整引文，再点击解析。单次解析最多20000个字符；原文和选定字段统一保存。',
    'education':'自由填写教育经历，可自行写时间；换行会保留，不要求单独选择日期。',
    'experience':'自由填写工作或科研经历，时间与内容由您编排。',
    'amount':'单位：万元；填写非负数，最多4位小数。',
    'orcid':'填写ORCID完整链接或0000-0000-0000-000X形式的编号。',
    'path':'后台示例：/admin/publications?f.year=2026；固定条件保存在服务端。',
    'location':'后台侧栏使用admin-sidebar；前台导航使用对应的展示位置。',
    'sort_order':'数字较小的条目优先；其他排序条件仍按列表设置执行。',
    'display_order':'数字较小的分类优先。',
    'visibility':'公开、启用和首页精选分别控制不同属性，精选不会自动公开。',
    'contact_visibility':'单独控制联系方式，公开个人资料不会自动公开联系方式。',
    'pdf_visibility':'单独控制论文附件的访问范围。',
    'material_visibility':'单独控制课程材料的访问范围。',
}

def editor_fields(table,row=None):
    """将原字段类型及文档控件提示转换为统一后台控件，保留真实提交值。"""
    result={}
    for name,spec in fields(table).items():
        info=EDITORS[table]['fields'].get(name,{})
        documented=re.search(r'表单 ([a-z_-]+)',info.get('validation_documented',''))
        widget=info.get('widget') or (documented.group(1) if documented else 'text')
        if spec.get('references') or spec.get('enum'):widget='select'
        elif spec['kind']=='boolean':widget='boolean'
        elif spec['kind']=='integer':widget='number'
        elif spec['kind']=='json':widget='textarea'
        elif name in MULTIVALUE.get(table,set()) or name=='translated_text' or name.startswith(('citation_','highlight_')):widget='textarea'
        elif spec.get('format')=='date':widget='date'
        if widget in ('richtext','json'):widget='textarea'
        # A documented select without a native option registry must remain editable, not empty.
        if widget=='select' and not spec.get('references') and not spec.get('enum'):widget='text'
        if widget not in ('select','boolean','number','textarea','email','url','date','text'):widget='text'
        if table=='navigation_items' and name=='path':widget='textarea'
        help_text=FIELD_HELP.get(name,'')
        if name in MULTIVALUE.get(table,set()):help_text='多项可用分号或换行分隔；含逗号的姓名或机构不必拆开。'
        if spec.get('references'):help_text='选择已有记录或媒体；保持当前选择可保留原关联。'
        elif spec['kind']=='json':help_text='填写有效JSON'+('数组。' if spec.get('jsonType')=='array' else '对象。')
        elif widget=='url':help_text='填写完整的HTTP或HTTPS链接。'
        if table=='profiles' and name.endswith('_value'):help_text='手动填写的显示数值；0是有效值，留空则不显示数值。'
        if table=='projects' and name=='summary':help_text='内部项目说明，不用于前台展示。'
        if table=='student_category_displays' and name=='keywords':help_text='分号、逗号或换行分隔；任意一词匹配即可。最多20个不同关键词，每词最多120字；修改后自动预览。'
        if table=='publications' and name=='title':help_text='填写论文原题名，不区分中英文；需要英文展示时使用翻译功能。'
        if table=='publications' and (name.startswith(('citation_','highlight_')) or name=='bibtex'):help_text='已保存或手动修改的非空内容默认受保护；手动清空也会保护。取消保护后可重新生成，核对后统一保存。'
        if spec.get('format')=='timestamp':help_text='按UTC时间填写，例如2026-09-14 09:30:00；保存时统一为UTC。'
        if table=='navigation_items' and name=='url_name':help_text='固定入口使用小写字母、数字、下划线或短横线；前台中文条件编码保存。'
        if spec.get('references',{}).get('table')=='media_assets':help_text='下拉显示最近20项；选择 / 上传可搜索全部适用媒体。'
        options=[(v,VISIBILITY_LABELS.get(v,v) if name.endswith('visibility') else v) for v in spec.get('enum',[])]
        result[name]={**spec,'label':label(table,name),'widget':widget,'wide':widget=='textarea',
                      'media':spec.get('references',{}).get('table')=='media_assets',
                      'history':name in SUGGESTION_FIELDS.get(table,()),'multiple':name in MULTIVALUE.get(table,set()),
                      'rows':8 if name=='content' else 4,'help':help_text,'options':options,
                      'placeholder':{'education':'例如：2010—2014　某大学，本科','experience':'例如：2018年至今　某大学，教师','orcid':'https://orcid.org/0000-0000-0000-000X'}.get(name,'')}
    if table=='site_settings':
        result['publication_citation_style'].update(options=[('gbt','GB/T'),('elsevier','Elsevier'),('apa','APA'),('ieee','IEEE')],help='全站统一的论文阅读格式，默认GB/T；保留已保存的人工引用。')
        for name in ('homepage_student_limit','homepage_patent_limit'):result[name]['help']='0隐藏，正数为首页展示总上限；超过首批数量时分批读取。'
        result['footer_text'].update(widget='textarea',wide=True,rows=10,help='支持安全HTML和纯文本换行；页脚按钮由“导航与按钮”中位置为footer的条目控制。可复制下方示例，保留空的nav占位区；未放置占位区时，按钮自动追加。脚本、内联样式、图片和iframe不会显示。')
    if table in ('auth_users','auth_roles'):
        # Presentation overrides retain native names, values and shared field controls.
        from .accounts import SCOPES
        if table=='auth_users':
            result['role_uid'].update(label='所属角色',help='请选择启用的角色。系统管理员角色具有管理权限；网站用户角色不自动授予后台管理权限。')
            result['status']['options']=[('active','已启用'),('disabled','已禁用'),('locked','已锁定')]
            result['visibility']['help']='控制谁能查看此账号记录；不代表访客可以看到账号资料。'
            result['must_change_password']['help']='开启后，该用户需先修改密码才能进入后台。'
            result['email']['widget']='email'
        else:
            result['visibility_scopes'].update(label='可查看的记录范围',widget='scopes',wide=True,help='仅在已授权模块中生效；访客页面仍只显示公开内容。',options=list(SCOPES.items()))
            result['description'].update(widget='textarea',wide=False,rows=2)
            result['level']['help']='角色等级是属性；实际操作仍检查模块权限。'
    if table=='global_settings':
        from .translation_config import PROVIDERS as TRANSLATORS,DEFAULT_ENDPOINTS
        result['translation_provider'].update(label='默认翻译服务',widget='select',options=list(TRANSLATORS.items()))
        result['translation_providers'].update(label='翻译服务启用与回退顺序',widget='providers',wide=True,family='translation')
        result['libretranslate_url']['placeholder']=DEFAULT_ENDPOINTS['libretranslate']
        result['microsoft_translator_endpoint']['placeholder']=DEFAULT_ENDPOINTS['microsoft']
        from .metadata_config import PROVIDERS
        result['publication_metadata_provider'].update(label='默认论文服务',widget='select',options=list(PROVIDERS.items()),help='默认查询仅使用此服务；按配置回退时按下方顺序尝试。')
        result['publication_metadata_providers'].update(family='metadata',label='启用服务与回退顺序',widget='providers',wide=True,help='启用服务按顺序回退，遇到有候选的来源即停止；不自动合并不同论文。')
        result['publication_suggestion_cache_seconds'].update(label='论文元数据缓存秒数',min=0,max=86400,help='0关闭；最多86400秒。仅控制元数据查询，不改变历史输入建议。')
    if table=='navigation_items':
        from .navigation_options import decorate_fields
        decorate_fields(result,row)
    if table=='messages':
        from .messages import decorate_fields
        decorate_fields(result,row)
    from .field_help import apply_help
    apply_help(table,result)
    return result

def editor_sections(table,row,secret_fields):
    """为字段区和适用辅助区建立同一份可跳转目录，避免缺失或无目标锚点。"""
    result=[]
    if table=='publications':result.append({'id':'tool-metadata','label':'论文元数据检索','kind':'metadata'})
    if table=='navigation_items':result.append({'id':'tool-navigation','label':'固定筛选与预览','kind':'navigation'})
    source_sections=sections(table)
    if table=='global_settings':
        # Move the existing cache field beside the provider controls; render each field exactly once.
        for group in source_sections:
            group['fields']=[f for f in group['fields'] if f!='publication_suggestion_cache_seconds']
            if 'publication_metadata_provider' in group['fields']:group['fields'].append('publication_suggestion_cache_seconds')
        source_sections=[g for g in source_sections if g['fields']]
    for section in source_sections:
        # Pair each profile link with its optional displayed metric without adding database fields.
        names=section['fields']
        if table=='profiles' and 'orcid' in names:
            names=[f for key in ('orcid','personal_homepage','google_scholar','dblp','github','cnki') for f in (key,key+'_value') if f in names]
        result.append({**section,'fields':names,'id':'fields-'+names[0],'kind':'fields'})
        if table=='translation_cache':result[-1]['label']='原文与译文'
    tools=[]
    if table=='auth_users':tools.append(('password','密码'))
    if table=='auth_users' and row.get('uid'):tools.append(('sessions','登录会话'))
    if table=='auth_roles':tools.append(('permissions','模块权限'))
    if table=='student_category_displays':tools.append(('matches','匹配学生'))
    if row.get('uid') and (table in CONTENT or table=='translation_cache'):tools.append(('translation','翻译'))
    if table=='translation_cache':tools.append(('source','来源信息'))
    if secret_fields:tools.append(('secrets','服务密钥'))
    result.extend({'id':'tool-'+key,'kind':key,'label':title} for key,title in tools)
    return result

async def reference_choices(r,table,row):
    """按权限只读取有限候选的标识和名称，并补回已保存且不在首批内的关联。"""
    choices={};cache={}
    for name,spec in fields(table).items():
        ref=spec.get('references')
        if not ref:continue
        target,column=ref['table'],ref['column']
        if not r.p['permissions'].get(target,{}).get('can_view'):
            choices[name]=[];continue
        title='title' if target=='media_assets' else TITLE[target]
        key=(target,column,name if target=='media_assets' else '')
        if key not in cache:
            where,args=("status='active'",()) if target=='media_assets' else r.content.scope(target,r.p)
            if target=='media_assets':
                from .media_policy import types_for
                kinds=types_for(table,name);where+=" AND storage_kind IN (?,'external') AND mime_type IN ("+','.join('?' for _ in kinds)+')';args=(r.kind,*kinds)
            # Identifiers are exclusively from the native registry, never from request input.
            select=f'SELECT "{column}" AS value,"{title}" AS label FROM "{target}" WHERE '+where
            if table=='auth_users' and name=='role_uid':
                select="SELECT uid AS value,name || CASE WHEN is_system=1 THEN '（系统管理员）' ELSE '' END AS label FROM auth_roles WHERE "+where+' AND is_active=1'
            # The shared picker owns complete media pagination; the fallback select stays small.
            limit=20 if target=='media_assets' else 100
            vals=await r.sql.query(select+f' ORDER BY id DESC LIMIT {limit}',args)
            cache[key]=(select,args,[(v['value'],v['label'] or v['value']) for v in vals])
        select,args,initial=cache[key];options=list(initial);current=row.get(name)
        if current and current not in {v for v,_ in options}:
            selected=await r.sql.query(select+f' AND "{column}"=? LIMIT 1',(*args,current))
            options.insert(0,(current,(selected[0]['label'] or current) if selected else '当前关联不可用，请重新选择'))
        choices[name]=options
    return choices


async def citation_profile(r):
    """读取首位公开精选教师及当前有效英文姓名；只返回引用高亮所需信息。"""
    from .translation_sources import overlay
    rows=await r.sql.query("SELECT uid,name,name_en FROM profiles WHERE visibility='public' AND is_active=1 AND is_featured=1 ORDER BY sort_order,id LIMIT 1")
    if not rows:return {'name':'','name_en':'','english_source':'missing','names':[]}
    row=rows[0];english=await overlay(r.sql,'profiles',dict(row))
    name=row['name'].strip();name_en=(row.get('name_en') or '').strip();source='manual' if name_en else 'missing'
    if not name_en and english.get('name') and english['name']!=row['name']:
        name_en=english['name'].strip();source='translation'
    return {'name':name,'name_en':name_en,'english_source':source,'names':list(dict.fromkeys(v for v in (name,name_en) if v))}

async def citation_profile_names(r):
    """保留既有姓名列表接口，统一使用精确原文匹配的英文覆盖规则。"""
    return (await citation_profile(r))['names']
