"""Role editor grouping and action dependencies over the existing permission columns."""
from .catalog import MODULES,Error

GROUPS=(
    ('content','教学与科研',('profiles','students','student_category_displays','research_interests','projects','publications','patents','courses','news')),
    ('resources','内容资源',('translation_cache','media_assets','messages')),
    ('settings','网站配置',('navigation_items','site_settings','global_settings')),
    ('management','管理与工具',('auth_users','auth_roles','operation_logs','data_tools','transfer')),
)

def groups():
    """Use readable module names from the shared registry; keep all 20 grants in one form."""
    return [{'key':key,'label':label,'modules':[(m,MODULES[m]) for m in modules]} for key,label,modules in GROUPS]

def validate(permissions):
    """Reject orphan actions before any role, grant or audit write; do not rewrite old roles on reads."""
    if not isinstance(permissions,dict) or set(permissions)-set(MODULES):raise Error('权限模块无效')
    for module,actions in permissions.items():
        if not isinstance(actions,list) or any(not isinstance(a,str) for a in actions) or set(actions)-{'view','create','edit','delete','export'}:raise Error('权限操作无效')
        if actions and 'view' not in actions:raise Error(MODULES[module]+'：请先开启“允许进入”，或清除该模块的操作权限')


def lock_references(principal,specs,row):
    """Keep inaccessible related fields out of the save payload and avoid reading their labels."""
    for field,spec in specs.items():
        target=spec.get('references',{}).get('table')
        if target and not principal['permissions'].get(target,{}).get('can_view'):
            spec.update(readonly=True,media=False,history=False,readonly_text='已设置（保持原关联）' if row.get(field) else '未设置',help='需要“'+MODULES.get(target,target)+'”的进入权限才能修改此项；其他内容可照常编辑。')
