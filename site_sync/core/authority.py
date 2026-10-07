"""Fresh grant predicates shared by all commit paths; no website dependencies."""
SCHEMA_VERSION = 4
LIVE = """EXISTS(SELECT 1 FROM sync_grants g JOIN sync_peers p ON p.peer_id=t.peer_id
 WHERE g.grant_id=t.grant_id AND g.revision=t.grant_revision AND g.enabled=1
 AND (g.expires_at=0 OR g.expires_at>?) AND p.enabled=1 AND p.revision=t.peer_revision
 AND NOT EXISTS(SELECT 1 FROM json_each(t.scope_json) scope
   WHERE scope.value NOT IN (SELECT value FROM json_each(g.scopes_json))))"""
SCHEMA = '(SELECT version=4 AND maintenance=0 FROM sync_schema WHERE singleton=1)'


def guard(task, now, *, write=False):
    clause = f'''t.task_id=? AND t.status='running' AND t.lease_token=?
      AND t.attempt_id=? AND t.lease_until>? AND t.grant_enabled=1
      AND {LIVE} AND {SCHEMA}'''
    args = (task['task_id'],task['lease_token'],task['attempt_id'],now,now)
    if write:
        clause += " AND t.write_authorized=1 AND EXISTS(SELECT 1 FROM sync_grants WHERE grant_id=t.grant_id AND can_write=1)"
    return clause,args


class AuthorizationError(Exception):
    pass


class ConflictError(Exception):
    pass


class ResourceError(Exception):
    """Caller classifies a confirmed resource error, e.g. HTTP error 1102."""
    pass


class CredentialRetryError(Exception):
    """Peer key/authentication unavailable: retry without granting any access."""
    pass
