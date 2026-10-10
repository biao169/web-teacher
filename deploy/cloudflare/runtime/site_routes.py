"""One ownership table for same-origin dispatch and packaging tests."""
from urllib.parse import urlsplit,unquote
ADMIN_ROOTS=('/admin','/api/admin','/api/assistance','/api/backup','/auth','/setup')
def owner(url):
    path=unquote(urlsplit(str(url)).path)
    if path=='/transfer' or path.startswith('/transfer/') or path=='/admin/transfer':return 'transfer'
    if path=='/sync' or path.startswith('/sync/'):return 'sync'
    if path in ('/api/public/session-summary','/api/public/admin-project-fields'):return 'admin'
    if any(path==root or path.startswith(root+'/') for root in ADMIN_ROOTS):return 'admin'
    return 'public'
