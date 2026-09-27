"""留言与操作日志的共用只读详情HTTP页面；业务编辑继续使用统一表单。"""
import json
from fastapi import Request
from .catalog import MODULES,Error

def install(app,resources,render):
    """注册两个详情入口，共用模板、目录、复制控件和固定底栏。"""
    @app.get('/admin/messages/{uid}/view')
    @app.get('/admin/operation_logs/{uid}/view')
    async def detail(request:Request,uid:str):
        """仅在模块查看权限内显示记录；GET不标记已读，日志始终使用脱敏投影。"""
        r=await resources(request);table=request.url.path.split('/')[2]
        if table=='operation_logs':
            from .operation_logs import Logs
            row=await Logs(r).get(uid)
            groups=[{'id':'record-overview','label':'操作概览','fields':['created_at','actor_name','actor_uid','module','action','target_uid','summary','status','uid']},
                    {'id':'record-content','label':'脱敏详情','fields':['detail_json']}]
            row['detail_json']=json.dumps(row['detail_json'],ensure_ascii=False,indent=2)
            message_view=None;states={};attachment=None
        else:
            from .messages import STATES,presentation
            row=await r.content.get(table,uid,r.p);message_view=presentation(row);states=STATES;attachment=None
            if row.get('attachment_key') and r.p['permissions'].get('media_assets',{}).get('can_view'):
                rows=await r.sql.query("SELECT uid,title FROM media_assets WHERE object_key=? AND status='active'",(row['attachment_key'],))
                if rows:attachment=rows[0]
            groups=[{'id':'record-overview','label':'留言信息','fields':['subject','name','email','message_type','status','visibility','created_at','updated_at','uid']},
                    {'id':'record-content','label':'留言正文与附件','fields':['content','attachment_key']}]
        return await render(r,'admin/native-record-detail.html',table,MODULES[table]+'详情',row=row,groups=groups,message_view=message_view,message_states=states,
                            attachment=attachment,can_edit=table=='messages' and bool(r.p['permissions'][table].get('can_edit')))
