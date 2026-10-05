"""Shared session-bound CSRF and origin checks."""
import hmac
from .catalog import Error

def csrf(request,r,data):
    """Require the current allowed origin plus session-bound CSRF, including fetch and multipart alternatives."""
    r.config.same_origin(request)
    if not r.p:raise Error('请先登录',401)
    value=data.get('_csrf') or request.headers.get('x-csrf-token','')
    if not hmac.compare_digest(str(value),r.p['csrf']):raise Error('页面验证已过期，请刷新',403)
