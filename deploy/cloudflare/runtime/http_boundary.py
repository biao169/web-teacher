"""No templates, storage or request-body parsing on the error response path."""
BODY=b'{"error":"Request interrupted; saved progress is retained. Retry after cooldown.","code":"worker_request_failed"}'

async def unavailable(scope,receive,send):
    await send({'type':'http.response.start','status':503,'headers':[
        (b'content-type',b'application/json; charset=utf-8'),(b'cache-control',b'no-store'),
        (b'retry-after',b'60'),(b'x-content-type-options',b'nosniff')]})
    await send({'type':'http.response.body','body':BODY})

class Boundary:
    def __init__(self,app):self.app=app
    async def __call__(self,scope,receive,send):
        started=False
        async def guarded(message):
            nonlocal started
            if message['type']=='http.response.start':
                started=True
                if message.get('status',200)>=500:
                    message={**message,'headers':[(k,v) for k,v in message.get('headers',[]) if k.lower()!=b'cache-control']+[(b'cache-control',b'no-store')]}
            await send(message)
        try:await self.app(scope,receive,guarded)
        except Exception as exc:
            from worker_runtime.diagnostics import emit,failure
            emit('HTTP-BOUNDARY','ERROR',exceptions=failure(exc))
            if started or scope.get('type')!='http':raise
            await unavailable(scope,receive,send)
