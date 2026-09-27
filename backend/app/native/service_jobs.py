"""Short site-wide network leases in the existing native guard table, not a worker daemon."""
from contextlib import asynccontextmanager
from .catalog import Error,now

@asynccontextmanager
async def network_lease(r,kind,module,action='edit'):
    """Serialize translation/test calls across local processes and Worker requests for 180 seconds."""
    r.auth.require(r.p,module,action);owner,guard=r.auth.guard(r.p,module,action);key='service:network:'+kind;at=now()
    result=await r.sql.batch([guard,('DELETE FROM admin_mutation_guards WHERE uid=? AND created_at<?',(key,now(seconds=-180))),('INSERT INTO admin_mutation_guards(uid,module,target_uid,expected_updated_at,created_at) VALUES (?,?,?,?,?) ON CONFLICT(uid) DO NOTHING RETURNING uid',(key,module,owner,at,at)),('DELETE FROM admin_mutation_guards WHERE uid=?',(owner,))])
    if not result[2]:raise Error('已有同类服务请求正在处理，请稍后重试',409)
    try:yield key,owner
    finally:await r.sql.batch([('DELETE FROM admin_mutation_guards WHERE uid=? AND target_uid=?',(key,owner))])
