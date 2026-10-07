"""Disposable native runtime for list tests; never opens the user's configured data."""
import asyncio
from pathlib import Path
from fastapi.testclient import TestClient
from backend.app.config import Settings, PROJECT_ROOT
from backend.app.native.runtime import local
from backend.app.native.auth import Auth
from backend.app.native.content import Content
from backend.app.native.catalog import MODULES, TABLES, defaults
from backend.app.native.web import create_app
from backend.app.security.http import AuthConfig


def client_at(directory, origin='http://127.0.0.1:8765'):
    r = local(Settings(Path(directory)))
    r.config = AuthConfig.from_origin(origin)

    async def seed():
        auth = Auth(r.sql, r.passwords)
        await auth.bootstrap('list-test-admin', 'Synthetic-test-only-032')
        token = await auth.login('list-test-admin', 'Synthetic-test-only-032', 'test')
        p = await auth.principal(token)
        content = Content(r.sql, auth)
        for table in MODULES:
            if table not in TABLES or table in ('auth_users', 'auth_roles', 'operation_logs', 'media_assets', 'translation_cache', 'global_settings', 'site_settings', 'messages'):
                continue
            from backend.app.native.catalog import TITLE, fields
            for n in range(3):
                values = {k: v for k, v in defaults(table).items() if k in fields(table) and v is not None}
                if 'is_active' in fields(table):
                    values['is_active'] = 1
                if TITLE[table] in fields(table):
                    values[TITLE[table]] = ['Alpha', 'Bravo', 'Charlie'][n]
                if table == 'navigation_items':
                    values.update(path='/zh', url_name='test-' + str(n))
                if table == 'news':
                    values.update(slug='test-' + str(n), published_at='2020-01-01T00:00:00.000Z')
                if table == 'student_category_displays':
                    values.update(key='test-' + str(n), keywords='["测试"]')
                await content.save(table, p, values)
        return token

    token = asyncio.run(seed())
    client = TestClient(create_app(lambda request: r, PROJECT_ROOT), base_url=origin)
    client.cookies.set(r.config.name('session'), token)
    return client, r
