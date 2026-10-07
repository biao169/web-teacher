"""Initialize only empty D1 databases; validate schemas without Python SQLite.

The locked Wrangler creates a disposable local reference from canonical SQL.
Remote inspection never reads user rows and never repairs/drops existing tables.
"""
import json
import re
import subprocess

CATALOG = "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name NOT GLOB '_cf_*' AND name != 'd1_migrations' ORDER BY type,name"
TOKEN = re.compile(r"--[^\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|`(?:``|[^`])*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*|\S")


def normalized(sql):
    # Ignore formatting/comments, retain literal contents and expression order.
    return tuple(t if t[:1] in "'\"`[" else t.lower() for t in TOKEN.findall(sql or '')
                 if not t.startswith(('--', '/*')) and t != ';')


def catalog(rows):
    return {(r['type'], r['name']): normalized(r['sql']) for r in rows}


def validate(expected, actual):
    want, got = catalog(expected), catalog(actual)
    missing = sorted('/'.join(k) for k in want.keys() - got.keys())
    changed = sorted('/'.join(k) for k in want.keys() & got.keys() if want[k] != got[k])
    extra = sorted('/'.join(k) for k in got.keys() - want.keys())
    if missing or changed or extra:
        raise ValueError('D1 结构不一致；未修改已有数据 / Schema mismatch; existing data untouched: ' +
                         json.dumps(dict(missing=missing, changed=changed, extra=extra), ensure_ascii=False))


def execute_json(command, cwd, env):
    try:
        result = subprocess.run(command, cwd=cwd, env=env, text=True,
                                capture_output=True, timeout=300, check=False)
    except subprocess.TimeoutExpired:
        raise ValueError('D1 命令超时；请检查数据库状态后重试 / D1 timeout; inspect database before retry') from None
    if result.returncode:
        # Wrangler diagnostics only; never print commands/environment containing credentials.
        raise ValueError('D1 命令失败 / D1 command failed; check D1 binding and API token D1 Edit permission:\n' +
                         (result.stderr or result.stdout)[-4000:])
    # File import stdout may contain progress/confirmation text even with --json.
    # Exit status gates import; setup() always re-queries and validates the schema.
    if '--file' in command:
        return []
    try:
        payload = json.loads(result.stdout)
        if not isinstance(payload, list) or not payload or any(
                not isinstance(p, dict) or p.get('success') is not True for p in payload):
            raise ValueError()
        if '--command' in command and any(not isinstance(p.get('results'), list) for p in payload):
            raise ValueError()
        return [row for p in payload for row in p.get('results', [])] if '--command' in command else []
    except (ValueError, TypeError):
        raise ValueError('D1 返回结果无法确认成功；停止发布 / Invalid D1 JSON response; publication stopped') from None


def setup(node, wrangler, stage, env, config, log, *, publish, query=execute_json):
    mode = env.get('TEACHER_D1_INIT', 'auto').strip().lower()
    if mode not in ('auto', 'check', 'upgrade'):
        raise ValueError('TEACHER_D1_INIT 仅支持 auto、check 或 upgrade / Expected auto or check or upgrade')
    # Minimal dedicated configuration avoids loading the application for SQL commands.
    cfg = stage / 'd1-check.json'
    cfg.write_text(json.dumps({'name': config['name'], 'compatibility_date': '2026-09-01',
        'd1_databases': [{'binding': 'DB', 'database_name': config['dbname'],
                          'database_id': config['database']}]}), encoding='utf-8')
    base = [node, str(wrangler), 'd1', 'execute', 'DB', '--config', str(cfg), '--json']
    local = [*base, '--local', '--persist-to', str(stage / '.d1-reference')]
    log('D1-REFERENCE', '校验初始化 SQL / Validate canonical SQL locally')
    query([*local, '--file', str(stage/'initialize.sql')], stage, env)
    expected = query([*local, '--command', CATALOG], stage, env)
    if not expected:
        raise ValueError('初始化 SQL 未产生表结构 / Empty reference schema')
    if not publish:
        log('D1-REFERENCE', '本地结构检查完成；未访问远程 D1 / Local schema verified; no remote access', objects=len(expected))
        return
    remote = [*base, '--remote']
    log('D1-CHECK', '读取远程表结构 / Inspect remote schema', database=config['dbname'], mode=mode)
    actual = query([*remote, '--command', CATALOG], stage, env)
    if not actual:
        if mode == 'check':
            raise ValueError('D1 为空；check 模式不初始化，请设置 TEACHER_D1_INIT=auto / Empty D1; enable auto initialization')
        log('D1-INIT', '空库初始化 / Initialize empty database')
        # No IF NOT EXISTS rewrite: concurrent/partial initialization must fail closed.
        query([*remote, '--file', str(stage/'initialize.sql'), '--yes'], stage, env)
        actual = query([*remote, '--command', CATALOG], stage, env)
    if actual and catalog(actual)!=catalog(expected) and mode!='check':
        from site_sync.integration.migration import definitions,statements
        old=definitions('teacher-v0.15.160.json')
        want={name:normalized(sql) for name,sql in old.items()}
        got={r['name']:normalized(r['sql']) for r in actual if r['sql'] is not None}
        if got!=want:raise ValueError('Schema mismatch: unknown predecessor; only exact v0.15.160 accepted; database unchanged')
        import asyncio,os,secrets
        from pathlib import Path
        from site_sync.deploy.d1_remote import RemoteD1
        account=env.get('CLOUDFLARE_ACCOUNT_ID','');token=env.get('CLOUDFLARE_API_TOKEN','')
        if not account or not token:raise ValueError('Auto migration requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN with D1 Edit')
        result=subprocess.run([node,str(wrangler),'d1','time-travel','info','DB','--config',str(cfg),'--json'],cwd=stage,env=env,text=True,capture_output=True,timeout=60)
        if result.returncode:raise ValueError('Cannot obtain D1 recovery bookmark; migration stopped')
        data=json.loads(result.stdout)
        if isinstance(data,list) and len(data)==1:data=data[0]
        bookmark=data.get('bookmark') if isinstance(data,dict) else None
        if not isinstance(bookmark,str) or not bookmark:raise ValueError('Missing recovery bookmark')
        recovery=Path(env.get('TEACHER_RECOVERY_DIR',str(Path.cwd()/'sync-recovery')))
        recovery.mkdir(parents=True,exist_ok=True)
        dest=recovery/('before-v0.16.001-'+secrets.token_hex(8)+'.json')
        fd=os.open(dest,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'w') as f:
            json.dump({'database_id':config['database'],'bookmark':bookmark},f);f.flush();os.fsync(f.fileno())
        async def backup():return str(dest)
        db=RemoteD1(account,config['database'],token,backup)
        async def upgrade():
            latest=await db.query(CATALOG)
            if {r['name']:normalized(r['sql']) for r in latest if r['sql'] is not None}!=want:raise ValueError('Predecessor changed before migration')
            await db.batch([(sql,()) for sql in statements()])
        asyncio.run(upgrade())
        log('D1-UPGRADE','v0.15.160 -> v0.16.001; old sync tasks retained in recovery bookmark',recovery=str(dest))
        actual=query([*remote,'--command',CATALOG],stage,env)
    validate(expected, actual)
    log('D1-READY', '结构检查通过；不重置、不覆盖已有记录 / Schema verified; existing records preserved', objects=len(actual))
