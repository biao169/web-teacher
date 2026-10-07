"""Local SQLite online backup and explicit stopped-service restore of the exact native schema."""
import argparse,os,sqlite3,shutil
from pathlib import Path
from contextlib import closing
from backend.app.config import Settings,PROJECT_ROOT
from backend.app.native.database import Database
from backend.app.native.locking import RuntimeLock
def backup(source,target):
    """Create a consistent complete SQLite snapshot; media bodies are independently stored."""
    target=Path(target).expanduser().resolve();source=Path(source).expanduser().resolve()
    if target.is_relative_to(PROJECT_ROOT) or target==source:raise ValueError('Backup must be outside source and distinct from database')
    fd=os.open(target,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
    try:
        with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as src,closing(sqlite3.connect(target)) as dst:Database(source).verify(src);src.backup(dst)
    except Exception:target.unlink(missing_ok=True);raise
    return target

def restore(source,target):
    """Replace a stopped local database from a validated native snapshot, without migration."""
    source=Path(source).expanduser().resolve();target=Path(target).expanduser().resolve()
    if source==target or target.is_relative_to(PROJECT_ROOT):raise ValueError('Restore target must be separate and outside source')
    with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as c:Database(source).verify(c)
    target.parent.mkdir(parents=True,exist_ok=True)
    with RuntimeLock(target):
        temp=target.with_name(target.name+'.restore-tmp')
        if temp.exists():raise ValueError('Temporary restore file already exists')
        try:
            shutil.copyfile(source,temp);temp.chmod(0o600)
            for suffix in ('-wal','-shm','-journal'):Path(str(target)+suffix).unlink(missing_ok=True)
            os.replace(temp,target)
        finally:temp.unlink(missing_ok=True)
    return target

def main():
    """Select configured database and explicit backup/restore file."""
    p=argparse.ArgumentParser();p.add_argument('action',choices=['backup','restore']);p.add_argument('--file',type=Path,required=True);a=p.parse_args();s=Settings.from_env()
    print(backup(s.database_path,a.file) if a.action=='backup' else restore(a.file,s.database_path))
if __name__=='__main__':main()
