"""One invocation, one bounded handler or one expired-attempt reconciliation."""
from .authority import AuthorizationError, ConflictError, ResourceError
from .journal import failure
import asyncio
from .trace import scope,current,invocation,record
import time


class Engine:
    def __init__(self, repository, handlers, clock, *, step_timeout=None):
        self.repo,self.handlers,self.clock=repository,handlers,clock
        self.step_timeout=step_timeout

    async def tick(self):
        # Do not catch BaseException: hard termination deliberately leaves the
        # durable attempt marker to be reconciled after its lease expires.
        if await self.repo.reconcile_one(self.clock()):
            return {'action':'reconciled'}
        task=await self.repo.claim(self.clock())
        if task is None:
            return {'action':'idle'}
        with scope(**dict(current() or invocation('local-runner','local'),task_id=task['task_id'],sync_mode=task.get('mode'),stage=task['phase'],sub_stage='handler',attempt_id=task.get('attempt_id'),checkpoint={'phase':task['phase'],'progress_seq':task.get('progress_seq')},retry_count=task.get('no_progress_count',0))):
            started=time.monotonic();record('SYNC-STEP-START',task_stage=task['phase'],slice_bytes=task.get('slice_bytes'))
            try:
                handler=self.handlers.get(task['phase'])
                if handler is None:
                    raise ConflictError('No handler installed for '+task['phase'])
                work=handler(Context(self.repo,task,self.clock))
                if self.step_timeout is None:await work
                else:
                    try:await asyncio.wait_for(work,self.step_timeout)
                    except asyncio.TimeoutError as exc:raise ResourceError("Sync step deadline exceeded") from exc
            except (AuthorizationError,ConflictError) as exc:
                await self.repo.finish(task,self.clock(),error=type(exc).__name__,permanent=True,diagnostic=failure(exc))
            except Exception as exc:
                cause=exc
                for _ in range(4):
                    if cause is None:break
                    if getattr(cause,'code',None)=='SYNC_PAUSED':
                        await self.repo.defer(task,self.clock(),diagnostic=failure(exc))
                        return {'action':'deferred','task_id':task['task_id']}
                    cause=cause.__cause__
                # Persist a bounded classification, not exception bodies/credentials.
                await self.repo.finish(task,self.clock(),error=type(exc).__name__,resource=isinstance(exc,ResourceError),diagnostic=failure(exc))
            else:
                await self.repo.finish(task,self.clock())
            finally:
                record('SYNC-STEP-END',finished_at=time.time(),duration_ms=round((time.monotonic()-started)*1000,2),task_stage=task['phase'])
            return {'action':'stepped','task_id':task['task_id']}


class Context:
    def __init__(self, repo, task, clock):
        self.repo,self.task,self.clock=repo,task,clock

    def describe(self,sub_stage,**values):
        from .trace import annotate
        annotate(sub_stage=sub_stage,**values)

    async def advance(self, phase):
        return await self.repo.advance(self.task,phase,self.clock())

    async def add_item(self, **item):
        return await self.repo.add_item(self.task,now=self.clock(),**item)

    async def commit_item(self,item_id,statement):
        return await self.repo.commit_item(self.task,item_id,statement,self.clock())
