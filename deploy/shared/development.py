"""Dedicated disposable database settings; normal website paths are never reset implicitly."""
import os
from pathlib import Path

FIELDS = {
    'database_path': ('TEACHER_DEV_DATABASE_PATH', 'database/site.sqlite3', 'TEACHER_DATABASE_PATH'),
    'media_dir': ('TEACHER_DEV_MEDIA_DIR', 'media', 'TEACHER_MEDIA_DIR'),
    'cache_dir': ('TEACHER_DEV_CACHE_DIR', 'cache', 'TEACHER_CACHE_DIR'),
    'transfer_database_path': ('TEACHER_DEV_LEGACY_PATH', 'database/legacy-transfer.sqlite3', 'TRANSFER_DATABASE_PATH'),
    'transfer_media_dir': ('TEACHER_DEV_TRANSFER_DIR', 'transfer-data/files', 'TRANSFER_MEDIA_DIR'),
    'transfer_cache_dir': ('TEACHER_DEV_TRANSFER_CACHE', 'transfer-data/cache', 'TRANSFER_CACHE_DIR'),
}


def configure(root_default):
    """Override normal settings only for explicit demo/fresh commands; confine dev paths."""
    from backend.app.config import Settings,PROJECT_ROOT
    raw=Path(os.environ.get('TEACHER_DEV_ROOT',str(root_default))).expanduser().absolute()
    if any(p.is_symlink() for p in (raw,*raw.parents)):
        raise ValueError('Development root must not contain symbolic links')
    root=raw.resolve()
    if root in (Path(root.anchor),Path.home().resolve()) or root==PROJECT_ROOT or (PROJECT_ROOT in root.parents and not root.is_relative_to(PROJECT_ROOT/'data')):
        raise ValueError('Use the dedicated project data directory or an external development directory')
    values={}
    for key,(variable,relative,_) in FIELDS.items():
        path=Path(os.environ.get(variable,str(root/relative))).expanduser()
        if not path.is_absolute():path=root/path
        if any(p.is_symlink() for p in (path,*path.parents)):
            raise ValueError('Development paths must not contain symbolic links')
        path=path.resolve()
        if path==root or not path.is_relative_to(root):raise ValueError(variable+' must be inside TEACHER_DEV_ROOT')
        values[key]=path
    settings=Settings(root,**values)
    claim(settings)
    # Environment consumed by the same child web service; ignore normal TOML and paths.
    os.environ.pop('TEACHER_CONFIG',None)
    os.environ['TEACHER_DATA_DIR']=str(root)
    for key,(_,_,target) in FIELDS.items():os.environ[target]=str(getattr(settings,key))
    os.environ['TEACHER_ORIGIN']='http://127.0.0.1:'+os.environ.get('TEACHER_PORT','8003')
    return settings


def claim(settings):
    """Mark only an empty directory or a previously owned development directory."""
    root=settings.data_dir
    marker=root/'.teacher-development'
    if marker.is_symlink():raise ValueError('Invalid development directory marker')
    if root.exists() and any(root.iterdir()) and not marker.is_file():
        raise ValueError('Non-empty unmarked development directory; select a new TEACHER_DEV_ROOT')
    root.mkdir(parents=True,exist_ok=True)
    if marker.exists() and marker.read_text(encoding='utf-8')!='teacher-site-development-v1\n':
        raise ValueError('Invalid development directory marker')
    marker.write_text('teacher-site-development-v1\n',encoding='utf-8')


def reset(settings):
    """Reset only the dedicated development SQLite file; preserve media/cache files."""
    from backend.app.native.database import Database
    claim(settings)
    Database(settings.database_path).initialize(reset=True)
