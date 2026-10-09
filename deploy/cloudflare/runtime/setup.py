"""One-time administrator form, using the existing transactional Auth.bootstrap."""
import hmac
import html
from fastapi import Request
from fastapi.responses import HTMLResponse
from backend.app.native.auth import Auth
from backend.app.native.catalog import Error
from backend.app.native.web_common import payload, IntegrityError
from .diagnostics import emit, failure, phase

PATH = '/setup'


class SetupHashFailure(Exception):
    """Distinguish password calculation from later transactional writes."""


class SetupPasswords:
    def __init__(self, passwords):
        self.passwords = passwords

    async def hash(self, password):
        try:
            with phase('SETUP-HASH'):
                return await self.passwords.hash(password)
        except Error:
            raise
        except Exception as exc:
            raise SetupHashFailure() from exc



def page(message='', status=200, form=False):
    fields = '''<form method="post" action="/setup" autocomplete="off">
<label>初始化密钥 / Setup token<input name="token" type="password" required maxlength="256" autocomplete="off"></label>
<label>管理员账号 / Administrator<input name="username" required minlength="3" maxlength="64" autocomplete="username"></label>
<label>密码 / Password<input name="password" type="password" required minlength="6" maxlength="128" autocomplete="new-password"></label>
<label>确认密码 / Confirm password<input name="confirm" type="password" required minlength="6" maxlength="128" autocomplete="new-password"></label>
<button type="submit">创建管理员 / Create administrator</button></form>''' if form else ''
    body = '''<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>首次设置 / Initial setup</title><style>body{font:16px/1.6 system-ui;background:#f2f5f7;color:#203041;margin:0;padding:32px 16px}main{max-width:520px;margin:4vh auto;background:white;padding:28px;border-radius:16px}h1{font-size:24px;margin-top:0}label{display:block;margin:16px 0}input,button{box-sizing:border-box;width:100%;padding:12px;border:1px solid #bccbd3;border-radius:8px;font:inherit}button{background:#195f63;color:white;cursor:pointer}p{overflow-wrap:anywhere}a{color:#195f63}</style>
<main><h1>首次设置 / Initial setup</h1><p>仅用于空账号库。创建后入口自动关闭。<br>For the first administrator only; closes after setup.</p>'''
    return HTMLResponse(body+'<p role="status">'+html.escape(message)+'</p>'+fields+'</main></html>',
                        status_code=status, headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow',
                                                     'Referrer-Policy':'same-origin'})


def install(app, factory):
    original_routes = len(app.router.routes)
    async def available(request):
        env = request.scope['env']
        secret = str(getattr(env, 'TEACHER_SETUP_TOKEN', ''))
        if not 32 <= len(secret) <= 256:
            return None, None, page('入口未开启 / Setup is disabled.', 404)
        r = factory(request)
        try:
            users = await r.sql.query('SELECT uid FROM auth_users LIMIT 1')
            marker = await r.sql.query('SELECT id FROM auth_bootstrap_state LIMIT 1')
        except Exception as exc:
            emit('SETUP-CHECK', 'ERROR', exceptions=failure(exc))
            if 'no such table' in str(exc).lower():
                return None, None, page('请先在 D1 中导入 database/schema.sql，再返回此页面。 / Initialize D1 with database/schema.sql first.', 503)
            return None, None, page('无法检查初始化状态，请查看 SETUP-CHECK 日志后刷新页面。 / Cannot check setup state; inspect SETUP-CHECK logs and reload.', 503)
        if users or marker:
            return None, None, page('初始化已完成，入口已关闭。 / Setup is complete and closed.', 404)
        return r, secret, None

    @app.get(PATH, include_in_schema=False)
    async def setup_form(request: Request):
        _, _, blocked = await available(request)
        return blocked if blocked is not None else page(form=True)

    @app.post(PATH, include_in_schema=False)
    async def setup_submit(request: Request):
        r, secret, blocked = await available(request)
        if blocked is not None:
            return blocked
        origin = request.headers.get('origin')
        if not r.config.origin_matches(request):
            emit('SETUP-ORIGIN', 'REJECTED', reason='missing' if not origin else 'null' if origin == 'null' else 'mismatch')
            return page('请求来源不匹配，请从允许的网站域名重新打开本页；检查 TEACHER_ALLOWED_ORIGINS 和页面来源策略。 / Origin mismatch. Reopen using the an allowed site origin; check TEACHER_ALLOWED_ORIGINS and referrer policy.', 403)
        try:
            data = await payload(request, limit=8192)
            token = data.get('token', '')
            if not isinstance(token, str) or not hmac.compare_digest(token.encode(), secret.encode()):
                return page('初始化密钥不正确 / Invalid setup token.', 403, form=True)
            if data.get('password') != data.get('confirm'):
                return page('两次密码不一致 / Passwords do not match.', 422, form=True)
            with phase('SETUP-BOOTSTRAP'):
                await Auth(r.sql, SetupPasswords(r.passwords)).bootstrap(data.get('username', ''), data.get('password', ''))
        except Error as exc:
            return page(exc.message, exc.status, form=True)
        except SetupHashFailure:
            return page('密码计算失败，尚未写入管理员。请检查 SETUP-HASH 日志与部署版本，修复后重新打开本页。 / Password hashing failed before administrator writes. Check SETUP-HASH logs and deployment version, then reload after fixing.', 503)
        except IntegrityError:
            # Preserve the existing app's local SQLite conflict handler (409).
            raise
        except Exception as exc:
            emit('SETUP-SUBMIT', 'ERROR', exceptions=failure(exc))
            return page('初始化未能确认完成。请查看 SETUP-SUBMIT 日志并重新打开本页确认状态，不要清空数据库。 / Setup completion could not be confirmed. Inspect SETUP-SUBMIT logs and reload to check state; do not reset the database.', 500)
        return page('管理员已创建。请访问 /auth/login 登录，并在 Cloudflare 删除 TEACHER_SETUP_TOKEN。 / Administrator created. Sign in at /auth/login and remove the setup secret.')

    # The existing /{lang} route must not consume /setup before this handler.
    app.router.routes[:] = app.router.routes[original_routes:] + app.router.routes[:original_routes]
