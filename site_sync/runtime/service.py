"""Shared local/Worker host wiring. Dependencies supplied only by trusted code."""
import importlib
import time
from site_sync.adapters.tasks import Tasks
from site_sync.adapters.transfer import Transfer,Cleanup
from site_sync.core.engine import Engine
from site_sync.core.authority import SCHEMA_VERSION,ConflictError
from .schedules import Schedules
from site_sync.admin.retention import Retention


def load_factory(spec):
    module,sep,name=spec.partition(':')
    if not sep or not module or not name.isidentifier():raise ValueError('Expected module:factory')
    return getattr(importlib.import_module(module),name)


class Runtime:
    def __init__(self,db,adapter,peer_factory,media_factory,*,platform,clock=lambda:int(time.time()),history_days=90):
        self.db,self.adapter,self.peer_factory,self.media_factory,self.clock=db,adapter,peer_factory,media_factory,clock
        self.repo=Tasks(db,platform=platform,lease_seconds=60 if platform=='worker' else 300)
        self.schedules=Schedules(self.repo)
        self.retention=Retention(db,history_days)
        for name in ('discover','apply','check'):
            if not callable(getattr(adapter,name,None)):raise ValueError('Website adapter missing '+name)
        if callable(getattr(adapter,'bind',None)):adapter.bind(self)
        self.engine=Engine(self.repo,{'discover':adapter.discover,'apply':adapter.apply,'transfer':self.transfer,'cleanup':self.cleanup},clock,step_timeout=25 if platform=='worker' else None)
    async def check(self):
        rows=await self.db.query('SELECT version,maintenance FROM sync_schema WHERE singleton=1')
        if rows!=[{'version':SCHEMA_VERSION,'maintenance':0}]:raise ConflictError('Deployment schema check required')
        await self.adapter.check(self.db)
    async def transfer(self,ctx):
        peer=await self.peer_factory(ctx.task)
        await Transfer(self.repo,peer,self.media_factory(self.repo))(ctx)
    async def cleanup(self,ctx):await Cleanup(self.repo,self.media_factory(self.repo))(ctx)
    async def tick(self):
        # Runtime check is cheap; full catalog fingerprint/DDL belongs to deploy.
        rows=await self.db.query('SELECT version,maintenance FROM sync_schema WHERE singleton=1')
        if rows!=[{'version':SCHEMA_VERSION,'maintenance':0}]:raise ConflictError('Wrong runtime schema')
        # Repair anomalous retry dates without changing scheduled-plan intervals.
        repaired=await self.db.batch([("UPDATE sync_tasks SET next_run_at=?,revision=revision+1 WHERE task_id=(SELECT task_id FROM sync_tasks WHERE status='waiting' AND phase!='await_confirmation' AND no_progress_count>0 AND lease_until<=? AND next_run_at>? LIMIT 1)",(self.clock()+1800,self.clock(),self.clock()+1800))])
        if repaired[0]['meta']['changes']:return {'action':'retry-clamped'}
        pruned=await self.retention.step(self.clock(),requested_only=True)
        if pruned['action']!='idle':return pruned
        # A periodic scheduler slot prevents a very long transfer from starving
        # schedules for other peers; still at most one action per invocation.
        if self.clock()//60%10==0:
            scheduled=await self.schedules.tick(self.clock())
            if scheduled['action']!='idle':return scheduled
        result=await self.engine.tick()
        if result['action']=='idle':
            result=await self.schedules.tick(self.clock())
            if result['action']=='idle':return await self.retention.step(self.clock())
        return result
