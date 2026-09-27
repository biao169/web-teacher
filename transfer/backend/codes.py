"""Shared receive-only short codes. Existing room IDs and share links stay valid."""
import asyncio
import hashlib
import hmac
import re
import secrets
import string
import time
from fastapi import Request
from backend.app.native.catalog import Error
from backend.app.native.auth import sha
from backend.app.native.web import payload
from .lan import identity, valid_key

DAY = 86400000
LIVE_TTL = 30 * 60000

def ms():
    return int(time.time() * 1000)


def capability(row, share):
    signature = hmac.new(share['secret_hash'].encode(), ('transfer-code:' + row['id']).encode(), hashlib.sha256).hexdigest()
    return 'tc.' + row['id'] + '.' + signature


async def find_share(sql, token):
    """Original bearer token or derived receive-only token; no sender secret is stored."""
    if not isinstance(token, str):
        return []
    if re.fullmatch(r'[A-Za-z0-9_-]{43}', token):
        return await sql.query("SELECT s.*,r.updated_at FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE s.secret_hash=? AND s.state='ready' AND s.expires_at>?", (sha(token), ms()))
    if not re.fullmatch(r'tc\.[a-f0-9]{32}\.[a-f0-9]{64}', token):
        return []
    rows = await sql.query("SELECT * FROM transfer_codes WHERE id=? AND mode='offline' AND state='active' AND expires_at>?", (token.split('.')[1], ms()))
    if not rows:
        return []
    shares = await sql.query("SELECT s.*,r.updated_at FROM temporary_shares s JOIN recovery_tasks r ON r.id=s.id WHERE s.id=? AND s.state='ready' AND s.expires_at>?", (rows[0]['target'], ms()))
    return shares if shares and hmac.compare_digest(token, capability(rows[0], shares[0])) else []


class Limiter:
    """Bounded one-minute windows, both per client and process-wide."""
    def __init__(self):
        self.buckets = {}
        self.window = 0
        self.total = 0

    def take(self, client):
        window = int(time.monotonic() // 60)
        if window != self.window:
            self.window = window
            self.buckets.clear()
            self.total = 0
        count = self.buckets.get(client, 0)
        if self.total >= 600 or count >= 20 or (client not in self.buckets and len(self.buckets) >= 2048):
            raise Error('传输码操作过于频繁，请稍后重试', 429)
        self.total += 1
        self.buckets[client] = count + 1


class Codes:
    def __init__(self, app):
        self.app = app
        self.instance = secrets.token_hex(16)
        self.lock = asyncio.Lock()
        self.limiter = Limiter()

    def rooms(self, mode):
        return self.app.state.lan_rooms if mode == 'lan' else self.app.state.online_relay

    async def owner(self, r, mode, target, key):
        if mode == 'offline':
            if not r.p:
                raise Error('请先登录', 401)
            share = await r.service.task(target, r.p)
            if share['state'] != 'ready' or share['expires_at'] <= ms():
                raise Error('分享尚未完成或已失效', 410)
            await r.service.policy(r.p, 'send')
            return share['expires_at']
        valid_key(key)
        manager = self.rooms(mode)
        async with manager.lock:
            manager.sweep()
            room = manager.rooms.get(target)
            peer = room and room['peers']['send']
            if not peer or identity(peer['p']) != identity(r.p) or not hmac.compare_digest(peer['key'], key):
                raise Error('没有发送方权限或会话已失效', 403)
            # Reuse current policies without advancing signaling/poll throttles.
            if mode == 'lan':
                from .lan import policy
            else:
                from .relay import policy
            await policy(r, r.p, 'send', room['size'], room.get('folder'))
        return ms() + LIVE_TTL

    async def issue(self, r, data):
        mode, target = data.get('mode'), data.get('target')
        if mode not in ('lan', 'relay', 'offline') or not isinstance(target, str) or not re.fullmatch('[a-f0-9]{32}', target):
            raise Error('传输模式或任务编号无效')
        expires = await self.owner(r, mode, target, data.get('key'))
        instance = '' if mode == 'offline' else self.instance
        at = ms()
        await r.sql.batch([
            ("UPDATE transfer_codes SET state='expired' WHERE state='active' AND (expires_at<=? OR (mode!='offline' AND instance!=?))", (at, self.instance)),
            ("DELETE FROM transfer_codes WHERE state!='active' AND expires_at<?", (at-DAY,)),
        ])
        rows = await r.sql.query("SELECT * FROM transfer_codes WHERE mode=? AND target=? AND instance=? AND state='active'", (mode, target, instance))
        if not rows:
            for _ in range(32):
                code = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(2)) + ''.join(secrets.choice(string.digits) for _ in range(4))
                await r.sql.batch([("INSERT OR IGNORE INTO transfer_codes(id,code,mode,target,instance,state,created_at,expires_at) VALUES (?,?,?,?,?,'active',?,?)", (secrets.token_hex(16), code, mode, target, instance, at, expires))])
                rows = await r.sql.query("SELECT * FROM transfer_codes WHERE mode=? AND target=? AND instance=? AND state='active'", (mode, target, instance))
                if rows:
                    break
            if not rows:
                raise Error('传输码分配繁忙，请稍后重试', 503)
        row = rows[0]
        return {'code': row['code'], 'mode': mode, 'expires_at': row['expires_at']}

    async def resolve(self, r, data):
        code = data.get('code')
        if not isinstance(code, str) or not re.fullmatch('[A-Za-z]{2}[0-9]{4}', code.strip()):
            raise Error('传输码应为两位字母和四位数字')
        rows = await r.sql.query("SELECT * FROM transfer_codes WHERE code=? AND state='active' AND expires_at>?", (code.strip().upper(), ms()))
        if not rows:
            raise Error('传输码不存在或已失效', 404)
        row = rows[0]
        if row['mode'] == 'offline':
            shares = await r.sql.query('SELECT * FROM temporary_shares WHERE id=?', (row['target'],))
            if not shares:
                raise Error('传输码不存在或已失效', 404)
            token = capability(row, shares[0])
            from .receivers import Receiver
            info = await Receiver(r).inspect(token)
            return {'mode': 'offline', 'token': token, 'expires_at': row['expires_at'], 'file': info}
        if row['instance'] != self.instance:
            raise Error('在线会话已失效，请重新创建', 410)
        session = await self.rooms(row['mode']).act(r, 'join', {'code': row['target'], 'key': data.get('key')})
        return {'mode': row['mode'], 'session': session, 'expires_at': row['expires_at']}

    async def revoke(self, r, data):
        code = data.get('code')
        if not isinstance(code, str) or not re.fullmatch('[A-Za-z]{2}[0-9]{4}', code.strip()):
            raise Error('传输码无效')
        rows = await r.sql.query('SELECT * FROM transfer_codes WHERE code=?', (code.strip().upper(),))
        if not rows:
            raise Error('传输码不存在', 404)
        row = rows[0]
        if row['mode'] != 'offline' and row['instance'] != self.instance:
            raise Error('在线会话已失效', 410)
        await self.owner(r, row['mode'], row['target'], data.get('key'))
        await r.sql.batch([("UPDATE transfer_codes SET state='revoked' WHERE id=?", (row['id'],))])
        return {'revoked': True}


def install(app, get, check):
    codes = Codes(app)
    app.state.transfer_codes = codes

    @app.post('/api/codes/{op}')
    async def action(op: str, request: Request):
        if op not in ('issue', 'resolve', 'revoke'):
            raise Error('操作不存在', 404)
        # Count malformed and unauthenticated attempts too; no untrusted XFF parsing.
        codes.limiter.take(request.client.host if request.client else 'unknown')
        r = await get(request, False)
        if request.headers.get('origin') != r.origin:
            raise Error('请求来源无效', 403)
        if r.p:
            check(request, r, {})
        try:
            data = await asyncio.wait_for(payload(request, 2048), 10)
        except asyncio.TimeoutError:
            raise Error('请求超时', 408)
        allowed = {'issue': {'mode', 'target', 'key'}, 'resolve': {'code', 'key'}, 'revoke': {'code', 'key'}}
        if not isinstance(data, dict) or set(data) - allowed[op]:
            raise Error('请求字段无效')
        async with codes.lock:
            return await getattr(codes, op)(r, data)
