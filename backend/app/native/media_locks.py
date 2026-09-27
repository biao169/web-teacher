"""复用原生写保护表协调媒体操作；清理意图独立于可清理缓存保存。"""
import hashlib
from contextlib import asynccontextmanager
from .catalog import now

def purge_key(uid):
    """固定长度清理标识，兼容原生UID上限。"""
    return 'media:purge:'+hashlib.sha256(uid.encode()).hexdigest()

def pending_guard(uid):
    """待清理条目不能编辑或恢复，直到管理员重试并完成清理。"""
    return 'NOT EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=?)',(purge_key(uid),)

def live_lease(key,owner):
    """提交时检查当前租约仍由本次请求持有且未过期。"""
    return "EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=? AND target_uid=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-300 seconds'))",(key,owner)

@asynccontextmanager
async def lease(r,key,action='view'):
    """短批次串行化；异常释放本次锁，进程中断遗留锁可在5分钟后重试。"""
    r.auth.require(r.p,'media_assets',action);owner,guard=r.auth.guard(r.p,'media_assets',action);at=now()
    await r.sql.batch([guard,('DELETE FROM admin_mutation_guards WHERE uid=? AND created_at<?',(key,now(seconds=-300))),('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?)',(key,'media_assets',owner,at,at)),('DELETE FROM admin_mutation_guards WHERE uid=?',(owner,))])
    try:yield owner
    finally:await r.sql.batch([('DELETE FROM admin_mutation_guards WHERE uid=? AND target_uid=?',(key,owner))])
