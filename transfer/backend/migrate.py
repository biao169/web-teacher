"""Stopped-service local import with byte verification, snapshots and guarded rollback.
Usage: python -m transfer.backend.migrate import --source-db ... --source-files ...
       --source-cache ... --receipt ...
       python -m transfer.backend.migrate rollback --receipt ...
"""
import argparse,hashlib,json,os,shutil,sqlite3,uuid
from pathlib import Path
from contextlib import ExitStack,closing
from backend.app.config import Settings
from backend.app.native.database import Database,SCHEMA
from backend.app.native.locking import RuntimeLock
from backend.app.native.storage import key_path

TABLES=[o['name'] for o in json.loads((SCHEMA/'transfer.json').read_text())['objects'] if o['type']=='table']


def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(1048576),b''):h.update(block)
    return h.hexdigest()


def objects(c):
    return dict(c.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"))


def expected(name):return {o['name']:o['sql'] for o in json.loads((SCHEMA/name).read_text())['objects']}


def validate(c):
    if c.execute('PRAGMA integrity_check').fetchone()[0]!='ok' or c.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Database integrity check failed')


def content_hash(c):
    """Logical content hash remains stable across WAL checkpoint and VACUUM."""
    h=hashlib.sha256()
    for name,sql in sorted(objects(c).items()):h.update(json.dumps([name,sql]).encode())
    for (name,) in c.execute("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"):
        columns=[r[1] for r in c.execute('PRAGMA table_info("'+name+'")')]
        h.update(name.encode())
        for row in c.execute('SELECT * FROM "'+name+'" ORDER BY '+','.join('"'+v+'"' for v in columns)):
            h.update(json.dumps(list(row),ensure_ascii=False,separators=(',',':')).encode());h.update(b'\n')
    return h.hexdigest()


def safe_path(value):
    path=Path(value).expanduser().absolute()
    if any(p.is_symlink() for p in [path,*path.parents]):raise ValueError('Symlink paths are not accepted for migration')
    return path.resolve()


def snapshot(c,path):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(fd)
    with closing(sqlite3.connect(path)) as dst:c.backup(dst)


def receipt_write(path,data):
    tmp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp')
    with tmp.open('x',encoding='utf-8') as f:
        json.dump(data,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
    tmp.chmod(0o600);os.replace(tmp,path)


def file_inventory(root):
    if not root.is_dir():raise ValueError('Source directory missing: '+str(root))
    for path in sorted(root.rglob('*')):
        if path.is_symlink():raise ValueError('Source contains symlinks')
        if path.is_dir():continue
        if not path.is_file():raise ValueError('Source contains non-regular file')
        key=path.relative_to(root).as_posix();key_path(key)
        yield key,{'bytes':path.stat().st_size,'sha256':digest(path)}


def verify_parts(c,root):
    """Validate referenced remaining chunks; prior completed cleanup may omit its prefix."""
    for row in c.execute('SELECT id,point,extra,state FROM recovery_tasks'):
        task,point,extra,state=row;point=json.loads(point);extra=json.loads(extra)
        parts=point.get('parts',[]);skip=int(extra.get('cleanup_index',0))
        if not isinstance(parts,list) or skip<0:raise ValueError('Invalid checkpoint')
        for part in parts[skip:]:
            key=key_path(part['key']);path=safe_path(root/key)
            if not key.startswith(task+'/') or not isinstance(part['size'],int) or not 0<part['size']<=1048576:raise ValueError('Invalid checkpoint chunk')
            if not path.is_file() or path.stat().st_size!=part['size'] or digest(path)!=part['sha256']:raise ValueError('Missing or corrupt task chunk: '+key)
    for task,manifest,point in c.execute("SELECT s.id,s.manifest,r.point FROM temporary_shares s LEFT JOIN recovery_tasks r ON r.id=s.id WHERE s.state='ready'"):
        if not point or json.loads(manifest or '{}')!=json.loads(point):raise ValueError('Ready task checkpoint mismatch: '+task)


def import_legacy(settings,source_db,source_files,source_cache,receipt):
    source_db,source_files,source_cache,receipt=map(safe_path,(source_db,source_files,source_cache,receipt))
    target=safe_path(settings.database_path);destinations=[safe_path(settings.transfer_media_dir),safe_path(settings.transfer_cache_dir)]
    if target==source_db or not target.is_file() or not source_db.is_file():raise ValueError('Two distinct existing databases required')
    roots=[source_files,source_cache,*destinations]
    if any(a==b or a in b.parents or b in a.parents for i,a in enumerate(roots) for b in roots[i+1:]):raise ValueError('Source and destination directories must be disjoint')
    if any(receipt.is_relative_to(p) or target.is_relative_to(p) or source_db.is_relative_to(p) for p in roots):raise ValueError('Database/receipt cannot be inside transfer storage')
    receipt.parent.mkdir(parents=True,exist_ok=True)
    # Reserve the journal name before copying anything; retries use a new receipt.
    fd=os.open(receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(fd)
    record={'format':'teacher-transfer-import-v1','status':'preparing','id':uuid.uuid4().hex,'target':str(target),'source':str(source_db),'files':[]}
    receipt_write(receipt,record)
    with ExitStack() as stack:
        for db in sorted((target,source_db)):stack.enter_context(RuntimeLock(db))
        main=stack.enter_context(closing(sqlite3.connect(target)));source=stack.enter_context(closing(sqlite3.connect(source_db)))
        main.execute('PRAGMA foreign_keys=ON');source.execute('PRAGMA foreign_keys=ON')
        validate(main);validate(source)
        schema=objects(main);old=False;v66=False
        if schema!=expected('teacher.json'):raise ValueError('Upgrade the selected v0.15.160 website with backend.cli migrate before importing standalone transfer data')
        if objects(source)!=expected('transfer.json'):raise ValueError('Unknown legacy transfer schema')
        if not old and any(main.execute('SELECT 1 FROM "'+t+'"'+(" WHERE key != 'public_cache_revision'" if t=='service_meta' else '')+' LIMIT 1').fetchone() for t in TABLES):raise ValueError('Target transfer tables are not empty; no data overwritten')
        record['main_backup']=str(receipt.with_name(receipt.name+'.main.sqlite3'));record['source_backup']=str(receipt.with_name(receipt.name+'.transfer.sqlite3'))
        snapshot(main,record['main_backup']);snapshot(source,record['source_backup'])
        record['backup_sha256']=digest(record['main_backup']);record['source_backup_sha256']=digest(record['source_backup'])
        # Runtime locks stop application processes; SQLite locks also fence other writers.
        main.execute('BEGIN IMMEDIATE');source.execute('BEGIN IMMEDIATE')
        record['before_hash']=content_hash(main);record['source_hash']=content_hash(source)
        with closing(sqlite3.connect(record['main_backup'])) as saved:
            if content_hash(saved)!=record['before_hash']:raise ValueError('Main changed while taking its backup')
        with closing(sqlite3.connect(record['source_backup'])) as saved:
            if content_hash(saved)!=record['source_hash']:raise ValueError('Source changed while taking its backup')
        receipt_write(receipt,record)
        verify_parts(source,source_files)
        for area,src,dst in zip(('files','cache'),(source_files,source_cache),destinations):
            for key,info in file_inventory(src):
                output=dst/key;safe_path(output)
                if output.exists():
                    if not output.is_file() or output.stat().st_size!=info['bytes'] or digest(output)!=info['sha256']:raise ValueError('Destination conflict: '+key)
                else:
                    output.parent.mkdir(parents=True,exist_ok=True)
                    tmp=output.with_name(output.name+'.'+record['id']+'.tmp')
                    with (src/key).open('rb') as inp, tmp.open('xb') as out:
                        shutil.copyfileobj(inp,out,1048576);out.flush();os.fsync(out.fileno())
                    tmp.chmod(0o600)
                    if digest(tmp)!=info['sha256']:raise ValueError('Source changed during copy: '+key)
                    os.replace(tmp,output)
                record['files'].append({'area':area,'key':key,'destination':str(output),**info})
        # Detect unexpected old-service/external writes before committing metadata.
        if content_hash(source)!=record['source_hash'] or content_hash(main)!=record['before_hash']:raise ValueError('Database changed during migration')
        verify_parts(source,destinations[0]);record['counts']={}
        try:
            if old or v66:
                from backend.app.native.schema_migrations import statements_for
                for statement in statements_for('0.15.65' if old else '0.15.66'):
                    main.execute(statement)
            for table in TABLES:
                cursor=source.execute('SELECT * FROM "'+table+'"');count=0
                while rows:=cursor.fetchmany(128):
                    main.executemany('INSERT INTO "'+table+'" VALUES ('+','.join('?' for _ in rows[0])+')',rows);count+=len(rows)
                record['counts'][table]=count
                if main.execute('SELECT count(*) FROM "'+table+'"'+(" WHERE key != 'public_cache_revision'" if table=='service_meta' else '')).fetchone()[0]!=count:raise ValueError('Row count mismatch')
            main.execute("INSERT INTO service_meta(key,value) VALUES ('integrated-source',?)",(json.dumps({'id':record['id'],'source':str(source_db)}),))
            from .chunks import index_legacy
            index_legacy(main)
            if objects(main)!=expected('teacher.json'):raise ValueError('Result schema mismatch')
            validate(main);record['after_hash']=content_hash(main);record['status']='ready-to-commit';receipt_write(receipt,record)
            main.commit()
        except Exception:main.rollback();raise
        record['status']='complete';receipt_write(receipt,record)
    return {'imported':True,'receipt':str(receipt),'files':len(record['files']),'rows':record['counts'],'legacy_originals_preserved':True}


def rollback(receipt):
    receipt=safe_path(receipt);record=json.loads(receipt.read_text());target=safe_path(record['target']);backup=safe_path(record['main_backup'])
    if record.get('format')!='teacher-transfer-import-v1' or record.get('status') not in ('complete','ready-to-commit'):raise ValueError('Receipt is not a committed import')
    if digest(backup)!=record['backup_sha256']:raise ValueError('Backup checksum mismatch')
    with RuntimeLock(target),closing(sqlite3.connect(target)) as current:
        if content_hash(current)!=record['after_hash']:raise ValueError('Main database changed after import; automatic rollback refused to preserve newer work')
        with closing(sqlite3.connect(backup)) as saved:validate(saved);saved.backup(current)
        validate(current)
        if content_hash(current)!=record['before_hash']:raise ValueError('Rollback verification failed')
    record['status']='rolled-back';receipt_write(receipt,record)
    return {'rolled_back':True,'copied_files_preserved':True,'restart':'Use the original release and original transfer paths'}


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='action',required=True)
    imp=sub.add_parser('import');imp.add_argument('--source-db',required=True);imp.add_argument('--source-files',required=True);imp.add_argument('--source-cache',required=True);imp.add_argument('--receipt',required=True)
    rev=sub.add_parser('rollback');rev.add_argument('--receipt',required=True)
    a=p.parse_args()
    try:result=rollback(a.receipt) if a.action=='rollback' else import_legacy(Settings.from_env(),a.source_db,a.source_files,a.source_cache,a.receipt)
    except (ValueError,OSError,sqlite3.Error,KeyError) as e:p.exit(1,'Migration stopped: '+str(e)+'\nOriginal files and completed backups are retained.\n')
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
