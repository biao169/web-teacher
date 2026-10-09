"""Fresh canonical initialization, exact schema verification and bounded SQL transactions."""
import json,sqlite3,hashlib
from contextlib import closing
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
SCHEMA=ROOT/'database/native'
from .schema_sources import initialization_sql
class Database:
    supports_text_hash=True
    def __init__(self,path,kind='teacher'):
        """保存构造参数和适配器，供此对象后续操作复用。"""
        self.path=Path(path);self.kind=kind
        from .public_cache import PublicReadCache
        self.public_cache=PublicReadCache()
    def cache_revision(self):
        """Detect other-process commits/replacement too, without keeping SQLite handles open."""
        try:
            result=[]
            for path in (self.path,Path(str(self.path)+'-wal')):
                try:
                    st=path.stat();result.append((st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns))
                except FileNotFoundError:result.append(None)
            return tuple(result) if result[0] is not None else None
        except OSError:return None
    def connect(self):
        """Open a short-lived, foreign-key enforcing connection with a 2 MiB cache."""
        c=sqlite3.connect(self.path,timeout=5);c.row_factory=sqlite3.Row
        c.create_function('ts_sha256',1,lambda value:hashlib.sha256(value.encode()).hexdigest() if isinstance(value,str) else None,deterministic=True)
        c.execute('PRAGMA foreign_keys=ON');c.execute('PRAGMA cache_size=-2048');return c
    def initialize(self,reset=False):
        """Create only an empty database; deletion occurs only with explicit reset=True."""
        self.path.parent.mkdir(parents=True,exist_ok=True)
        if reset:
            from .locking import RuntimeLock
            with RuntimeLock(self.path):
                return self._reset()
        if self.kind=='teacher' and self.path.is_file():
            with closing(self.connect()) as probe:
                existing=probe.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone()
                if existing:
                    try:self.verify(probe)
                    except ValueError:
                        from .schema_upgrade import migrate
                        migrate(self)
        with closing(self.connect()) as c, c:
            self._initialize_connection(c)
        self.path.chmod(0o600)
    def _reset(self):
        """Delete only the configured SQLite file and sidecars under an exclusive process lock."""
        # Caller holds the process lock; never recurse through media or cache roots.
        for suffix in ('','-wal','-shm','-journal'):
            p=Path(str(self.path)+suffix)
            if p.is_symlink():raise ValueError('Refusing to reset a symlink database')
            p.unlink(missing_ok=True)
        with closing(self.connect()) as c, c:self._initialize_connection(c)
        self.path.chmod(0o600)
    def _initialize_connection(self,c):
        """Initialize an empty native schema; existing schema must compare exactly."""
        if not c.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchone():
            c.executescript('BEGIN IMMEDIATE;\n'+initialization_sql(self.kind)+'\nCOMMIT;')
            if self.kind=='transfer':c.execute('PRAGMA user_version=8')
            c.commit()
        self.verify(c);c.execute('PRAGMA journal_mode=WAL')
    def verify(self,c=None):
        """Compare every executable table/index definition with original final SQL."""
        own=c is None;c=c or self.connect();c.row_factory=sqlite3.Row
        try:
            expected={o['name']:o['sql'] for o in json.loads((SCHEMA/(self.kind+'.json')).read_text())['objects']}
            actual={r['name']:r['sql'] for r in c.execute("SELECT name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'")}
            if actual!=expected:raise ValueError('Database schema differs from academic-cms. Stop services, back up, and run: python -m backend.cli migrate. Unknown schemas require inspection; never reset to upgrade. No data was modified.')
            if c.execute('PRAGMA foreign_key_check').fetchone():raise ValueError('Foreign key violation')
            return {'tables':len([o for o in json.loads((SCHEMA/(self.kind+'.json')).read_text())['objects'] if o['type']=='table']),'schema':'exact'}
        finally:
            if own:c.close()
    async def query(self,sql,args=()):
        """Parameterized read; identifiers must come from the native catalog."""
        with closing(self.connect()) as c, c:return [dict(r) for r in c.execute(sql,args)]
    async def batch(self,statements):
        """Commit writes and audit together; RETURNING results remain inside one transaction."""
        return await self._batch(statements,25)
    async def restore_batch(self,statements):
        """Commit a bounded full restore atomically; ordinary mutations retain their 25-statement cap."""
        return await self._batch(statements,64)
    async def _batch(self,statements,limit):
        """Enforce the caller-specific transaction budget in either native adapter."""
        if not 1<=len(statements)<=limit:raise ValueError('Too many statements per transaction')
        bump=None
        try:
            with closing(self.connect()) as c, c:
                c.execute('BEGIN IMMEDIATE')
                results=[[dict(r) for r in c.execute(sql,args)] for sql,args in statements]
                from .public_revision import revision_write
                bump=revision_write(statements) if self.kind=='teacher' else None
                if bump:c.execute(*bump)
                return results
        finally:
            if bump:self.public_cache.invalidate()
