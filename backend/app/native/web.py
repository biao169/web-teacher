"""Compatibility entry point: compose route groups on one application."""
from .web_common import payload,IntegrityError

def create_full_app(factory,static_root=None,*,lazy_sync=False):
    from .web_common import create_base
    from .web_admin import install as install_admin
    from .web_public import install as install_public
    app,resources,csrf,render=create_base(factory,static_root)
    install_admin(app,factory,resources,csrf,render,lazy_sync=lazy_sync)
    if static_root:
        from transfer.backend.integration import install
        install(app,resources,static_root)
    install_public(app,factory,resources,csrf,render)
    return app

def create_app(factory,static_root=None,*,lazy_sync=False):
    return create_full_app(factory,static_root,lazy_sync=lazy_sync)

def create_public_app(factory,static_root=None):
    from .web_public import create_public_app as build
    return build(factory,static_root)

def create_admin_app(factory,static_root=None,*,lazy_sync=False):
    from .web_admin import create_admin_app as build
    return build(factory,static_root,lazy_sync=lazy_sync)
