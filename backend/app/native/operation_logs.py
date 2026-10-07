"""只读日志列表、详情与有界CSV/JSON导出；复用内容筛选和账号事务门禁。"""
import csv,io,json
from .catalog import Error
from .log_privacy import record,DETAIL_LIMIT
from .data_tools import csv_cell

COLUMNS=('uid','created_at','updated_at','actor_uid','actor_name','action','module','target_uid','summary','status')
MAX_BYTES=24*1024*1024

class Logs:
    def __init__(self,r):
        """接收请求内的原生内容、认证和SQL适配器。"""
        self.r=r

    def query(self,query):
        """仅允许可展示列参与筛选排序，详情JSON不作为搜索或排序的旁路。"""
        query=dict(query or {});query.setdefault('sort','created_at');query.setdefault('direction','desc')
        for key,value in query.items():
            if key.startswith(('f.','c.')) and key[2:] not in COLUMNS:raise Error('此日志字段不支持筛选')
        if query['sort'] not in COLUMNS:raise Error('此日志字段不支持排序')
        return query

    async def listing(self,query=None,include_detail=False,ceiling_id=None):
        """只读取白名单列和有限文本，每页最多100条；长详情不会进入普通列表。"""
        columns=(*COLUMNS,*(('detail_json',) if include_detail else ()))
        result=await self.r.content.listing('operation_logs',self.r.p,self.query(query),projection=columns,ceiling_id=ceiling_id,
                                          projection_limits={key:DETAIL_LIMIT+1 if key=='detail_json' else 2049 for key in columns})
        result['rows']=[record(row,include_detail) for row in result['rows']]
        return result

    async def get(self,uid):
        """读取一个脱敏日志，不自动更改状态，也不返回原始JSON。"""
        result=await self.listing({'f.uid':uid,'size':10},True)
        if not result['rows']:raise Error('日志不存在',404)
        return result['rows'][0]

    async def export(self,query):
        """固定最大ID后分批编码；默认2万条、含详情5千条，交付前再次核对权限。"""
        r=self.r;r.auth.require(r.p,'operation_logs','export');query=self.query(query)
        fmt=query.get('format','json');details=query.get('details','0')
        if fmt not in ('json','csv') or details not in ('0','1'):raise Error('日志导出格式无效')
        include=details=='1';cap=5000 if include else 20000
        ceiling=(await r.sql.query('SELECT coalesce(max(id),0) n FROM operation_logs'))[0]['n']
        options=query|{'size':20 if include else 100,'page':1};first=await self.listing(options,include,ceiling)
        if first['total']>cap:raise Error('本次最多导出'+str(cap)+'条日志，请先筛选')
        out=io.BytesIO();columns=(*COLUMNS,*(('detail_json',) if include else ()))
        def append(data):
            """编码后检查24MiB硬上限，超限时不交付部分成功文件。"""
            if out.tell()+len(data)>MAX_BYTES:raise Error('日志导出超过24MiB，请缩小筛选范围')
            out.write(data)
        def csv_line(values):
            """复用备份CSV的公式防护，为单行分配短期缓冲。"""
            line=io.StringIO(newline='');csv.writer(line).writerow([csv_cell(v) for v in values]);return line.getvalue().encode()
        append(b'\xef\xbb\xbf'+csv_line(columns) if fmt=='csv' else b'{"table":"operation_logs","rows":[')
        count=0
        for page in range(1,first['pages']+1):
            listing=first if page==1 else await self.listing(options|{'page':page},include,ceiling)
            for row in listing['rows']:
                if fmt=='csv':append(csv_line(json.dumps(row[c],ensure_ascii=False) if c=='detail_json' else row.get(c) for c in columns))
                else:append((b',' if count else b'')+json.dumps(row,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode())
                count+=1
        if fmt=='json':append(b']}')
        gid,guard=r.auth.guard(r.p,'operation_logs','export',"EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module='operation_logs' AND can_view=1)",(r.p['role_uid'],))
        await r.sql.batch([guard,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
        return out.getvalue(),fmt
