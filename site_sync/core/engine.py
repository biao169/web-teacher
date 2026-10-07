"""One invocation, one bounded handler or one expired-attempt reconciliation."""
from .authority import AuthorizationError, ConflictError, ResourceError
from .journal import failure


class Engine:
    def __init__(self, repository, handlers, clock):
        self.repo,self.handlers,self.clock=repository,handlers,clock

    async def tick(self):
        # Do not catch BaseException: hard termination deliberately leaves the
        # durable attempt marker to be reconciled after its lease expires.
        if await self.repo.reconcile_one(self.clock()):
            return {'action':'reconciled'}
        task=await self.repo.claim(self.clock())
        if task is None:
            return {'action':'idle'}
        try:
            handler=self.handlers.get(task['phase'])
            if handler is None:
                raise ConflictError('No handler installed for '+task['phase'])
            await handler(Context(self.repo,task,self.clock))
        except (AuthorizationError,ConflictError) as exc:
            await self.repo.finish(task,self.clock(),error=type(exc).__name__,permanent=True,diagnostic=failure(exc))
        except Exception as exc:
            # Persist a bounded classification, not exception bodies/credentials.
            await self.repo.finish(task,self.clock(),error=type(exc).__name__,resource=isinstance(exc,ResourceError),diagnostic=failure(exc))
        else:
            await self.repo.finish(task,self.clock())
        return {'action':'stepped','task_id':task['task_id']}


class Context:
    def __init__(self, repo, task, clock):
        self.repo,self.task,self.clock=repo,task,clock

    async def advance(self, phase):
        return await self.repo.advance(self.task,phase,self.clock())

    async def add_item(self, **item):
        return await self.repo.add_item(self.task,now=self.clock(),**item)

    async def commit_item(self,item_id,statement):
        return await self.repo.commit_item(self.task,item_id,statement,self.clock())
