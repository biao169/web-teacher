"""Explicit privileged restore scopes; no website imports on generic paths."""
AUTH=('auth_roles','auth_users','auth_permissions')
TABLES=('media_assets','profiles','students','research_interests','projects','publications','patents','courses','student_category_displays','news','navigation_items','site_settings','global_settings','messages','translation_cache','operation_logs','tool_settings',*AUTH)
RESTORE_SCOPES=tuple('restore_'+t for t in TABLES)
def is_restore(scope):
    return isinstance(scope,list) and bool(scope) and (scope==['site_clone'] or all(s in RESTORE_SCOPES for s in scope))
def selected_tables(scope):
    if not is_restore(scope):raise ValueError('Invalid restore selection')
    return list(TABLES) if scope==['site_clone'] else [t for t in TABLES if 'restore_'+t in scope]
def normalize(scope):
    if not isinstance(scope,list):return scope
    if not any(isinstance(s,str) and s.startswith('restore_') for s in scope):return scope
    if not is_restore(scope):raise ValueError('Restore scopes cannot mix with ordinary modules')
    tables=set(selected_tables(scope))
    if tables.intersection(AUTH):tables.update(AUTH)
    if 'news' in tables:tables.update(('publications','projects','students'))
    if 'site_settings' in tables:tables.add('profiles')
    if tables.intersection(('profiles','students','research_interests','projects','publications','patents','courses','news','site_settings','global_settings','tool_settings','navigation_items','messages')):tables.add('media_assets')
    return ['restore_'+t for t in TABLES if t in tables]
def meta_record(scope):
    if scope==['site_clone']:return '00meta'
    return '00meta-'+format(sum(1<<TABLES.index(t) for t in selected_tables(scope)),'x')
def meta_scope(record):
    if record=='00meta':return ['site_clone']
    try:
        mask=int(record.removeprefix('00meta-'),16)
        if not record.startswith('00meta-') or mask<=0 or mask>=(1<<len(TABLES)):raise ValueError()
        return ['restore_'+t for i,t in enumerate(TABLES) if mask&(1<<i)]
    except (TypeError,ValueError):raise ValueError('Invalid restore inventory identity')

LABELS=dict(zip(TABLES,('媒体文件','教师资料','学生资料','研究方向','科研项目','论文成果','专利成果','课程资料','学生分类','新闻动态','导航按钮','网站设置','全局设置','访客留言','翻译缓存','操作日志','工具设置','角色','用户账号','权限')))
NOTES={'media_assets':'传输全部媒体及文件元数据，包含未被引用和回收站媒体。','auth_users':'同步账号及密码哈希；与角色、权限一起替换，完成后需重新登录。','auth_roles':'与账号、权限联动选择，统一提交，避免角色关系断裂。','auth_permissions':'与账号、角色联动选择，恢复各模块的访问和管理权限。','site_settings':'站点名称、图标和首页设置；自动包含教师资料及媒体。','news':'新闻正文及关联关系；自动包含论文、项目、学生及媒体。','global_settings':'全局业务配置；部署域名、同步密钥等本站运行配置保留。','tool_settings':'工具业务设置；按记录恢复，本站同步授权与密钥不参与同步。','operation_logs':'导入业务操作日志；不导入同步任务日志和执行租约。','translation_cache':'同步翻译缓存，减少重复翻译。','messages':'同步留言及附件；自动包含媒体文件。'}
def visible_scopes(scope):
    restore=[s for s in scope if s in RESTORE_SCOPES]
    return restore or [s for s in scope if s!='site_clone']
def descriptions(scope):
    return {s:{'label':LABELS.get(s.removeprefix('restore_'),s),'description':NOTES.get(s.removeprefix('restore_'),'同步该类全部记录；引用媒体时会自动选入媒体文件。'),'dependencies':[d for d in normalize([s]) if d!=s] if s in RESTORE_SCOPES else []} for s in visible_scopes(scope)}
