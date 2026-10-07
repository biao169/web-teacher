"""Supported navigation choices and safe sidebar presentation; database values remain native."""
from .catalog import CONTENT,MODULES

# Labels describe actual Python behavior, including reserved display locations.
OPTIONS={
 'kind':[
  ('route','站内页面','使用站内完整路径；前台与后台内容模块均可保存固定条件并预览，文本支持等于或包含。'),
  ('external','外部链接','前台支持HTTP/HTTPS外链；后台固定入口不支持外链。'),
  ('anchor','页面锚点','使用包含锚点的站内路径，例如 /zh#main；下方工具可将锚点写入路径。'),
  ('button','按钮链接','目标仍由路径决定；后台侧栏可使用强调样式，前台按所选强调或描边样式呈现。'),
 ],
 'location':[
  ('admin-sidebar','后台侧栏','仅显示已启用、符合角色可见范围且有目标模块查看权限的入口。'),
  ('header','前台顶部导航','按启用及可见范围显示；英文页面优先使用英文标题，并复用有效译文。'),
  ('hero','首页主区域','显示在首页介绍区的按钮位置，继续遵循启用与可见范围。'),
  ('footer','页脚','显示在HTML页脚的受控占位区；没有占位区时显示在页脚文字下方。'),
 ],
 'icon':[
  ('file','文件 / 内容','使用现有文件图标。后台侧栏、前台顶部及首页按钮使用此配置。'),
  ('user','人物 / 团队','使用现有人物图标。后台侧栏、前台顶部及首页按钮使用此配置。'),
  ('book','书籍 / 教学','使用现有书籍图标。后台侧栏、前台顶部及首页按钮使用此配置。'),
  ('search','搜索 / 筛选','使用现有搜索图标。后台侧栏、前台顶部及首页按钮使用此配置。'),
 ],
 'style':[
  ('normal','普通','后台侧栏采用标准链接样式；前台采用普通链接样式。'),
  ('primary','强调','后台侧栏以淡色背景强调此入口，当前项高亮仍保持可辨认；前台为强调按钮。'),
  ('secondary','描边','后台侧栏以边框提示此入口；前台为描边按钮；不会改变访问权限。'),
 ],
}
PRESETS=[{'value':'/zh','label':'中文首页'},{'value':'/en','label':'英文首页'}]+[
 {'value':'/zh/'+table,'label':MODULES[table]} for table in CONTENT
]+[{'value':'/zh/contact','label':'联系留言'},{'value':'/auth/login','label':'登录'},{'value':'/admin','label':'后台概览'},{'value':'/transfer','label':'文件快传'}]

def decorate_fields(specs,row=None):
    """Offer known choices while retaining any existing blank or custom value without normalization."""
    row=row or {}
    for field,entries in OPTIONS.items():
        options=[('', '未设置'),*[(key,text) for key,text,_ in entries]]
        current=row.get(field)
        hints={'':'未设置时保留空值；后台图标按文件、样式按普通显示。' if field in ('icon','style') else '可留空；显示行为仍取决于位置和完整路径。',**{key:help_text for key,_,help_text in entries}}
        if current and current not in {key for key,_ in options}:
            options.append((current,'当前自定义值：'+str(current)))
            hints[current]='已有自定义值会原样保留；当前没有对应专用呈现，请按实际位置和路径核对。'
        specs[field].update(widget='select',options=options,option_help=hints,wide=False)
    specs['url_name']['label']='入口标识（ASCII）'
    specs['visibility']['help']='前台：公开对所有人可见；登录用户需登录；内部成员需角色含staff范围。隐藏与所有者范围不在公共页脚输出。按钮可见不等于获得目标页面的访问权限。'
    specs['fragment']['help']='可选页面锚点，如main；会覆盖路径中原有的锚点。'

def sidebar_presentation(row):
    """Only bundled symbols and supported semantic styles can affect the shared sidebar."""
    return {'icon':row.get('icon') if row.get('icon') in {x[0] for x in OPTIONS['icon']} else 'file',
            'style':row.get('style') if row.get('style') in {x[0] for x in OPTIONS['style']} else 'normal'}


MENU_GROUPS=(
 ('content','内容管理',('profiles','students','student_category_displays','research_interests','projects','publications','patents','courses','news')),
 ('resources','资源与工具',('media_assets','translation_cache','messages','transfer')),
 ('website','网站配置',('navigation_items','site_settings','global_settings')),
 ('system','系统管理',('auth_users','auth_roles','operation_logs','data_tools','site-sync','runtime-maintenance')),
 ('custom','自定义入口',()),
)

def grouped_menu(entries):
    """Group presentation only; preserve authorized entries and relative custom order."""
    buckets={key:[] for key,_,_ in MENU_GROUPS}
    for entry in entries:
        key=next((key for key,_,modules in MENU_GROUPS if entry['key'] in modules),'custom')
        buckets[key].append(entry)
    return [{'key':key,'label':label,'entries':buckets[key]} for key,label,_ in MENU_GROUPS if buckets[key]]
