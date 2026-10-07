"""Original names are metadata, never storage paths; headers use RFC 5987 encoding."""
import unicodedata
from urllib.parse import quote
from .catalog import Error

def original_name(value):
    if not isinstance(value,str):raise Error('文件名无效')
    name=value.replace('\\','/').rsplit('/',1)[-1]
    if not name.strip() or name in ('.','..') or len(name)>255 or any(unicodedata.category(c).startswith('C') for c in name):raise Error('文件名为空、超过255字符或包含控制字符')
    return name

def disposition(row,mime,suffix,inline):
    fallback='media.'+(suffix if suffix and mime!='application/octet-stream' else 'bin')
    name=row.get('original_filename')
    try:name=original_name(name) if name else fallback
    except Error:name=fallback
    from .media_policy import EXTENSIONS
    from pathlib import PurePosixPath
    if mime=='application/octet-stream':name=fallback
    elif mime in EXTENSIONS and PurePosixPath(name).suffix.lower().lstrip('.') not in EXTENSIONS[mime]:name=PurePosixPath(name).stem+'.'+EXTENSIONS[mime][0]
    return ('inline' if inline else 'attachment')+'; filename="'+fallback+'"; filename*=UTF-8\'\''+quote(name,safe='')
