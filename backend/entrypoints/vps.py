"""Local main service; the configured SQLite runtime lock prevents accidental live reset."""
from backend.app.native.runtime import local
from backend.app.native.web import create_app
from backend.app.native.locking import RuntimeLock
from backend.app.config import PROJECT_ROOT
r=local()
lock=RuntimeLock(r.settings.database_path);lock.__enter__()
app=create_app(lambda request:r,PROJECT_ROOT)
from backend.app.native.site_sync_schedule import install_local
install_local(app,r)
@app.on_event('shutdown')
async def release():
    """Release only this service's database lock when shutdown finishes."""
    lock.__exit__(None,None,None)
