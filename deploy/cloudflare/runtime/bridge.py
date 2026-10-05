"""Normalize Python/JavaScript boundaries for existing D1 and R2 adapters."""


def normalize(value):
    from pyodide.ffi import jsnull
    if value is None or value is jsnull:
        return None
    if hasattr(value, 'to_py'):
        value = value.to_py()
    if isinstance(value, dict):
        return {key: normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [normalize(item) for item in value]
    return value


class Statement:
    def __init__(self, native):
        self.native = native

    def bind(self, *args):
        from pyodide.ffi import jsnull
        values = [jsnull if item is None else int(item) if isinstance(item, bool) else item for item in args]
        return Statement(self.native.bind(*values))

    async def all(self):
        return normalize(await self.native.all())


class Database:
    def __init__(self, native):
        self.native = getattr(native, '_binding', native)

    def prepare(self, sql):
        return Statement(self.native.prepare(sql))

    async def batch(self, statements):
        from pyodide.ffi import to_js
        # Existing D1SQL still owns transaction bounds and domain error handling.
        values = to_js([statement.native for statement in statements])
        return normalize(await self.native.batch(values))


class Bucket:
    """Preserve native binary/stream objects; normalize only absent results."""
    def __init__(self, native):
        self.native = getattr(native, '_binding', native)

    @staticmethod
    def optional(value):
        from pyodide.ffi import jsnull
        return None if value is jsnull or value is None else value

    async def get(self, *args):
        return self.optional(await self.native.get(*args))

    async def head(self, *args):
        return self.optional(await self.native.head(*args))

    async def put(self, *args):
        return self.optional(await self.native.put(*args))

    async def delete(self, *args):
        return await self.native.delete(*args)

    async def list(self, *args):
        return await self.native.list(*args)


class Environment:
    """Wrap configured binding names, without copying secrets or changing global state."""
    def __init__(self, native):
        self.native = native
        db = str(getattr(native, 'TEACHER_DATABASE_BINDING', 'DB'))
        media = str(getattr(native, 'TEACHER_MEDIA_BINDING', 'MEDIA'))
        cache = str(getattr(native, 'TEACHER_CACHE_BINDING', media))
        self._database = db
        self._buckets = {media, cache}
        self.bindings = {}

    def __getattr__(self, name):
        if name not in self.bindings:
            if name == self._database:
                self.bindings[name] = Database(getattr(self.native, name))
            elif name in self._buckets:
                self.bindings[name] = Bucket(getattr(self.native, name))
            else:
                return getattr(self.native, name)
        return self.bindings[name]


class BoundApplication:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if 'env' in scope:
            scope = {**scope, 'env': Environment(scope['env'])}
            # Cloudflare supplies this header at the public edge; preserve it through DO forwarding.
            peer = dict(scope.get('headers', [])).get(b'cf-connecting-ip')
            if peer:
                scope['client'] = (peer.decode('ascii', errors='replace'), 0)
        await self.app(scope, receive, send)
