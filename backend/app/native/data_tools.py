"""Business backup registry, safe exports and bounded native-row validation.

The browser owns encryption; neither a backup password nor a decrypted media bundle
is written to the server. Authentication/runtime tables have separate maintenance.
"""
import csv,hashlib,io,json,re
from .catalog import TABLES,SECRET,MODULES,Error,now,defaults,normalize

BUSINESS=tuple(t for t in TABLES if not t.startswith('auth_') and t!='operation_logs')
FORMAT='academic-cms-python-data-v1'
OMIT={'translation_job_state','error_message'}
MAX_ROWS=20000
IMPORT_ROWS=500
DATA_LIMIT=4*1024*1024
TABLE_LIMIT=900*1024
MEDIA_LIMIT=24*1024*1024


def encoded(value):
    """Use deterministic UTF-8 for file digests and bounded JSON SQL parameters."""
    return json.dumps(value,ensure_ascii=False,separators=(',',':'),sort_keys=True,allow_nan=False).encode()


def digest(value):
    """Hash data without disclosing its fields in a preflight response or audit log."""
    return hashlib.sha256(encoded(value)).hexdigest()


def authorize(r,action='view',tables=()):
    """Whole-table backup is restricted to a current system administrator and module grants."""
    r.auth.require(r.p,'data_tools',action)
    if not r.p['is_system']:raise Error('跨表备份与恢复仅系统管理员可操作',403)
    for table in tables:r.auth.require(r.p,table,'view' if action=='view' else 'export' if action=='export' else 'edit')


def selection(value):
    """Accept a non-empty explicit subset of business tables, never SQL identifiers from a file."""
    if not isinstance(value,list) or not value or any(not isinstance(t,str) or t not in BUSINESS for t in value) or len(set(value))!=len(value):raise Error('请选择支持的业务表，不包含账号及内部运行表')
    return [t for t in BUSINESS if t in value]


async def snapshot(r):
    """Capture bounded UID/update-token inventories in one SQLite/D1 read transaction."""
    counts=await r.sql.query('SELECT '+ '+'.join('(SELECT count(*) FROM "'+t+'")' for t in BUSINESS)+' n')
    if counts[0]['n']>MAX_ROWS:raise Error('在线预检的业务记录总量最多20000条，请使用数据库维护备份')
    rows=await r.sql.query(' UNION ALL '.join("SELECT '"+t+"' AS name,uid,updated_at FROM \""+t+'\"' for t in BUSINESS)+' ORDER BY name,uid LIMIT 20001')
    if len(rows)>MAX_ROWS:raise Error('在线预检记录过多，请使用数据库维护备份')
    result={t:[] for t in BUSINESS}
    for row in rows:result[row['name']].append({'uid':row['uid'],'updated_at':row['updated_at']})
    return result


async def export(r,tables=None,sensitive=False):
    """Export complete fields rather than the abbreviated list projection; omit runtime state."""
    tables=selection(list(BUSINESS) if tables is None else tables);authorize(r,'export',tables)
    statements=[];size=count=0;budgets=[]
    for table in tables:
        columns=[c for c in TABLES[table]['columns'] if c not in OMIT and (sensitive or c not in SECRET)]
        stats=(await r.sql.query('SELECT count(*) n,coalesce(sum('+ '+'.join('length(coalesce(CAST("'+c+'" AS BLOB),x\'\'))' for c in columns)+'),0) bytes FROM "'+table+'"'))[0]
        budgets.append('(SELECT coalesce(sum('+ '+'.join('length(coalesce(CAST(\"'+c+'\" AS BLOB),x\'\'))' for c in columns)+'),0) FROM \"'+table+'\")')
        count+=stats['n'];size+=stats['bytes']
        if count>MAX_ROWS or size>DATA_LIMIT:raise Error('导出最多20000条、4MiB字段内容，请缩小所选表或使用数据库备份')
        statements.append(('SELECT '+','.join('"'+c+'"' for c in columns)+' FROM "'+table+'" ORDER BY id',()))
    condition='('+ '+'.join(budgets)+')<=4194304 AND ('+ '+'.join('(SELECT count(*) FROM \"'+t+'\")' for t in tables)+')<=20000'
    condition+=' AND '+ ' AND '.join('EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module=? AND can_export=1)' for _ in tables)
    gid,guard=r.auth.guard(r.p,'data_tools','export',condition,tuple(v for t in tables for v in (r.p['role_uid'],t)))
    batches=await r.sql.batch([guard,*statements,('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))]);rows=batches[1:-1]
    value={'format':FORMAT,'created_at':now(),'sensitive':bool(sensitive),'tables':dict(zip(tables,rows)), 'media':[],
           'omitted':['authentication','sessions','runtime state','deployment credentials','transfer database/files']+([] if sensitive else ['database credentials'])}
    data=encoded(value)
    if len(data)>8*1024*1024:raise Error('编码后导出超过8MiB，请缩小范围')
    return data


def csv_cell(value):
    """Escape formula-like cells consistently for business backups and operation-log CSV files."""
    text='' if value is None else str(value)
    return "'"+text if text.lstrip().startswith(('=','+','-','@')) or text.startswith(('\t','\r','\n')) else text


def csv_export(value,table):
    """Single-table UTF-8 CSV with formula-injection neutralization and complete cell values."""
    out=io.StringIO(newline='');writer=csv.writer(out);columns=[c for c in TABLES[table]['columns'] if c not in SECRET|OMIT]
    writer.writerow(columns)
    for row in value['tables'][table]:
        writer.writerow([csv_cell(row.get(c)) for c in columns])
    return b'\xef\xbb\xbf'+out.getvalue().encode()


def row_values(table,row,sensitive=False):
    """Validate all native backup fields using the editor's scalar rules, including reserved fields."""
    if not isinstance(row,dict) or set(row)-set(TABLES[table]['columns']):raise Error('包含未知字段或记录不是对象')
    if any(k in row for k in OMIT):raise Error('不能导入内部任务或错误状态')
    if not sensitive and set(row)&SECRET:raise Error('安全JSON不能包含服务密钥')
    if not isinstance(row.get('uid'),str) or not re.fullmatch('[A-Za-z0-9_.:-]{1,120}',row['uid']):raise Error('UID格式无效')
    result=normalize(table,{k:v for k,v in row.items() if k!='id'},restore=True)
    result.pop('id',None)
    return result


def validate_domain(table,row):
    """Reuse provider, category, navigation and rich-text validators for restored full records."""
    if table=='global_settings':
        from .metadata_config import parse_settings
        from .translation_config import parse_settings as translation_settings
        parse_settings(row);translation_settings(row)
    if table=='student_category_displays':
        from .student_categories import parse_keywords
        parse_keywords(row.get('keywords'))
    if table=='navigation_items' and row.get('location')=='admin-sidebar':
        from .navigation import parse_path,build_path,scope_conditions
        target,base=parse_path(row.get('path') or '')
        if not row.get('url_name'):raise Error('后台导航必须填写ASCII导航标识')
        row['path']=build_path(target,scope_conditions(base))
    if table=='news':
        from backend.app.domain.richtext import render_body
        rendered=render_body(row.get('content') or '',row.get('content_format'))
        if row.get('content_format')=='html':row['content']=rendered[0]
    if table=='media_assets':
        from .media_links import external_url
        from .storage import key_path
        from .media_policy import ALL_TYPES
        if row['storage_kind']=='external':external_url(row['object_key'])
        else:key_path(row['object_key'])
        if row['mime_type'] not in ALL_TYPES:raise Error('不支持此媒体类型')
        if row['status'] not in ('active','trash'):raise Error('媒体状态无效')
    if table=='translation_cache':
        if row.get('source_hash')!=hashlib.sha256((row.get('source_text') or '').encode()).hexdigest():raise Error('翻译源摘要与原文不一致')
        if row.get('is_current') and row.get('status')!='success':raise Error('当前译文必须成功完成')
