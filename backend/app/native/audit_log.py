"""Shared audit SQL; caller commits it with its guarded mutation."""
import json,secrets
from .catalog import MODULES

def audit(p,table,action,uid,detail=None):
    """Audit metadata only; never serialize submitted passwords or provider credentials."""
    values=(secrets.token_hex(16),p['uid'],p['display_name'] or p['username'],action,table,uid,MODULES.get(table,table)+' '+action,'success')
    if detail is not None:
        # Only server-constructed metadata is accepted here; never log submitted message bodies.
        return ('INSERT INTO operation_logs(uid,actor_uid,actor_name,action,module,target_uid,summary,status,detail_json) VALUES (?,?,?,?,?,?,?,?,?)',(*values,json.dumps(detail,ensure_ascii=False)))
    return ('INSERT INTO operation_logs(uid,actor_uid,actor_name,action,module,target_uid,summary,status) VALUES (?,?,?,?,?,?,?,?)',values)
