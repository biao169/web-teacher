"""One storage configuration for Windows, Linux and Workers; environment overrides TOML."""
from dataclasses import dataclass
from pathlib import Path
import os,re,tomllib
PROJECT_ROOT=Path(__file__).resolve().parents[2]

@dataclass(frozen=True)
class Settings:
    data_dir: Path
    asset_mode: str='local'
    database_path: Path|None=None
    cache_dir: Path|None=None
    media_dir: Path|None=None
    transfer_database_path: Path|None=None
    transfer_cache_dir: Path|None=None
    transfer_media_dir: Path|None=None
    database_binding: str='DB'
    cache_binding: str='MEDIA'
    media_binding: str='MEDIA'
    transfer_database_binding: str='TRANSFER_DB'
    cache_prefix: str='cache/'
    media_prefix: str='media/'
    transfer_media_binding: str='TRANSFER_FILES'
    transfer_cache_binding: str='TRANSFER_FILES'
    transfer_media_prefix: str='transfer/media/'
    transfer_cache_prefix: str='transfer/cache/'

    def __post_init__(self):
        """Resolve storage; source-local runtime files are confined to data/ or transfer-data/."""
        root=Path(self.data_dir).expanduser().resolve();object.__setattr__(self,'data_dir',root)
        # Runtime data may live in the reserved project data directory; legacy source is separate.
        if (root==PROJECT_ROOT or PROJECT_ROOT in root.parents) and not root.is_relative_to(PROJECT_ROOT/'data'):raise ValueError('data_dir inside source must use the dedicated data directory')
        defaults={'database_path':root/'database/site.sqlite3','cache_dir':root/'cache','media_dir':root/'media','transfer_database_path':root/'transfer.sqlite3','transfer_cache_dir':root/'transfer-cache','transfer_media_dir':root/'transfer-media'}
        for key,default in defaults.items():
            value=Path(getattr(self,key) or default).expanduser().resolve()
            if value==PROJECT_ROOT or PROJECT_ROOT in value.parents:
                allowed=value.is_relative_to(PROJECT_ROOT/'data') and value!=PROJECT_ROOT/'data'
                transfer_allowed=key in ('transfer_cache_dir','transfer_media_dir') and value.is_relative_to(PROJECT_ROOT/'transfer-data') and value!=PROJECT_ROOT/'transfer-data'
                if not (allowed or transfer_allowed):raise ValueError(f'{key} must use a dedicated data or transfer-data subdirectory')
            object.__setattr__(self,key,value)
        if self.database_path==self.transfer_database_path:raise ValueError('Main and transfer databases must be separate')
        if self.asset_mode not in ('local','cdn'):raise ValueError('asset_mode must be local or cdn')
        for key in ('database_binding','cache_binding','media_binding','transfer_database_binding','transfer_media_binding','transfer_cache_binding'):
            if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',getattr(self,key)):raise ValueError(f'Invalid {key}')
        for key in ('cache_prefix','media_prefix','transfer_media_prefix','transfer_cache_prefix'):
            value=getattr(self,key).strip('/')
            if not re.fullmatch(r'[A-Za-z0-9_/-]+',value) or '..' in value:raise ValueError(f'Invalid {key}')
            object.__setattr__(self,key,value+'/')
        if self.cache_binding==self.media_binding and (self.cache_prefix.startswith(self.media_prefix) or self.media_prefix.startswith(self.cache_prefix)):raise ValueError('Cache and media prefixes must not overlap')

        for db in (self.database_path,self.transfer_database_path):
            for cache in (self.cache_dir,self.transfer_cache_dir):
                if db.is_relative_to(cache):raise ValueError('Database files cannot live inside disposable cache directories')
        for cache,media in ((self.cache_dir,self.media_dir),(self.transfer_cache_dir,self.transfer_media_dir)):
            if cache.is_relative_to(media) or media.is_relative_to(cache):raise ValueError('Media and cache directories must not overlap')
        if self.transfer_cache_binding==self.transfer_media_binding and (self.transfer_cache_prefix.startswith(self.transfer_media_prefix) or self.transfer_media_prefix.startswith(self.transfer_cache_prefix)):raise ValueError('Transfer cache and media prefixes must not overlap')

    @classmethod
    def from_env(cls,env=None):
        """Read TEACHER_CONFIG TOML locally; Worker vars use the same TEACHER_* keys."""
        env=os.environ if env is None else env
        source=env.get('TEACHER_CONFIG');values={};base=Path.cwd()
        if source:
            config=Path(source).expanduser().resolve();base=config.parent
            values=tomllib.loads(config.read_text(encoding='utf-8')).get('storage',{})
        names={'data_dir':'TEACHER_DATA_DIR','asset_mode':'TEACHER_ASSET_MODE','database_path':'TEACHER_DATABASE_PATH','cache_dir':'TEACHER_CACHE_DIR','media_dir':'TEACHER_MEDIA_DIR','transfer_database_path':'TRANSFER_DATABASE_PATH','transfer_cache_dir':'TRANSFER_CACHE_DIR','transfer_media_dir':'TRANSFER_MEDIA_DIR','database_binding':'TEACHER_DATABASE_BINDING','cache_binding':'TEACHER_CACHE_BINDING','media_binding':'TEACHER_MEDIA_BINDING','transfer_database_binding':'TRANSFER_DATABASE_BINDING','cache_prefix':'TEACHER_CACHE_PREFIX','media_prefix':'TEACHER_MEDIA_PREFIX','transfer_media_binding':'TRANSFER_MEDIA_BINDING','transfer_cache_binding':'TRANSFER_CACHE_BINDING','transfer_media_prefix':'TRANSFER_MEDIA_PREFIX','transfer_cache_prefix':'TRANSFER_CACHE_PREFIX'}
        unknown=set(values)-set(names)
        if unknown:raise ValueError('Unknown storage keys: '+', '.join(sorted(unknown)))
        for key,var in names.items():
            if var in env:values[key]=str(env[var])
        # Direct Settings(path) remains useful for isolated tests. Deployed local defaults
        # keep transfer payloads in the explicitly excluded project-root directory.
        values.setdefault('transfer_media_dir',str(PROJECT_ROOT/'data/transfer-data/files'))
        values.setdefault('transfer_cache_dir',str(PROJECT_ROOT/'data/transfer-data/cache'))
        values.setdefault('data_dir',str(PROJECT_ROOT/'data'))
        for key in names:
            if key.endswith(('_path','_dir')) and values.get(key):
                p=Path(values[key]).expanduser();values[key]=p if p.is_absolute() else base/p
        return cls(**values)
