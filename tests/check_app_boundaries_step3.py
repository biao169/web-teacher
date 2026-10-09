"""Fresh-process factory check; also runs against the actual staged Worker source."""
import argparse,json,sys
from pathlib import Path

def check(source,role):
    sys.path.insert(0,str(source))
    def no_resources(request):
        raise AssertionError('Factory performed request work during construction')
    if role=='public':
        from backend.app.native.web_public import create_public_app
        app=create_public_app(no_resources)
        forbidden=('backend.app.native.web','backend.app.native.web_admin','backend.app.native.editor',
                   'backend.app.native.media_admin','backend.app.native.data_admin','backend.app.native.session_admin',
                   'backend.app.native.maintenance_admin','site_sync','transfer')
        loaded=[n for n in sys.modules if any(n==f or n.startswith(f+'.') for f in forbidden)]
        assert not loaded,loaded
        assert not any(getattr(r,'path','').startswith(('/admin','/api/admin','/sync','/auth')) for r in app.routes)
    elif role=='admin':
        from backend.app.native.web_admin import create_admin_app
        app=create_admin_app(no_resources,lazy_sync=True)
        assert 'backend.app.native.web_public' not in sys.modules
        assert not any(getattr(r,'path','') in ('/','/{lang}','/media/{uid}') for r in app.routes)
    else:
        from backend.app.native.web import create_full_app
        app=create_full_app(no_resources,lazy_sync=True)
    from fastapi import FastAPI
    assert isinstance(app,FastAPI)
    assert not any(isinstance(getattr(r,'app',None),FastAPI) for r in app.routes)
    assert not app.router.on_startup and not app.router.on_shutdown
    assert sum(getattr(m.kwargs.get('dispatch'),'__name__','')=='headers' for m in app.user_middleware)==1
    paths=[{'path':getattr(r,'path',type(r).__name__),'methods':sorted(getattr(r,'methods',[]) or [])} for r in app.routes]
    assert len(paths)==len({(r['path'],tuple(r['methods'])) for r in paths})
    print(json.dumps({'role':role,'routes':paths,'project_modules':sorted(n for n in sys.modules if n.startswith(('backend','site_sync','transfer')))}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--role',choices=('public','admin','full'),required=True)
    a=p.parse_args();check(a.source.resolve(),a.role)
