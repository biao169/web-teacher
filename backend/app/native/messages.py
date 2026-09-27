"""留言处理的原生状态、展示和编辑约束；所有写入仍走共用内容事务。"""
from .catalog import Error

STATES={'new':'新留言','read':'已读','replied':'已回复','archived':'已归档'}
STATE_STYLES={'new':'warning','read':'info','replied':'success','archived':'muted'}
TYPE_LABELS={'contact':'联系咨询','news':'新闻留言','cooperation':'合作交流','admission':'招生咨询','other':'其他'}
STATE_HELP='新留言、已读、已回复或已归档；已回复仅为人工标记，不代表系统发送了邮件。查看详情不会自动改为已读。'

def validate(patch,current):
    """仅允许处理状态与可见范围变更；访客原始姓名、邮箱、正文和附件不可修改。"""
    if not current:raise Error('留言由访客提交，后台不能新建原始留言')
    if set(patch)-{'status','visibility'}:raise Error('留言原始信息只读，只能修改处理状态与可见范围')
    if 'status' in patch and patch['status'] not in STATES and patch['status']!=current.get('status'):raise Error('留言状态请选择新留言、已读、已回复或已归档')

def decorate_fields(specs,row):
    """补齐共用编辑控件的中文选项和说明，不更改数据库字段定义。"""
    options=list(STATES.items());state=(row or {}).get('status')
    if state and state not in STATES:options.append((state,'现有自定义状态：'+state[:60]))
    specs['status'].update(widget='select',options=options,help=STATE_HELP)
    for field,spec in specs.items():
        if field not in ('status','visibility'):spec.update(readonly=True,media=False,history=False,help='访客提交的原始信息，仅供查看，不随处理状态保存。')
    specs['email'].update(widget='email',help='访客原始邮箱，只读；复制邮箱不会发送消息。')
    specs['message_type']['help']='留言来源或类型标记，例如contact、news、cooperation；保留已有原值，后台不会发送通知。'
    specs['content']['help']='原始留言只读，按纯文本展示，换行保留；HTML不会执行。新闻来源前缀保留在正文中，没有独立新闻外键。'
    specs['visibility']['help']='控制哪些后台角色可查看此记录；留言不会因此变成前台公开评论。'

def presentation(row):
    """为列表和只读详情提供相同的状态文字、语义样式及类型标签。"""
    state=row.get('status');return {'state_label':STATES.get(state,state or '未设置'),'state_style':STATE_STYLES.get(state,'muted'),
                                  'type_label':TYPE_LABELS.get(row.get('message_type'),row.get('message_type') or '未分类')}
