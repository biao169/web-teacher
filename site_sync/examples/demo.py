"""Local lifecycle demo with in-memory fixture data, never a website connection."""
import asyncio
from pathlib import Path
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.tasks import Tasks
from site_sync.adapters.staging import StagingStore
from site_sync.core.engine import Engine
from site_sync.deploy.schema import Plan,ensure


async def main():
    db=SQLite()
    try:
        await ensure(db,Plan.compile(Path(__file__).resolve().parents[2]/'database/schema.sql'))
        db.connection.execute("INSERT INTO sync_peers VALUES('peer','https://example.invalid','env:UNUSED','p1',1)")
        db.connection.execute('CREATE TABLE demo_news(id TEXT PRIMARY KEY,body TEXT)')
        repo=Tasks(db,platform='local');clock=[100]
        await repo.put_grant(grant_id='grant',principal_id='demo-admin',scope=['news'],can_write=True,can_delete=False)
        task=await repo.create(peer_id='peer',grant_id='grant',scope=['news'],operation_id='demo-operation',now=clock[0],mode='scheduled')
        async def discover(ctx):
            await ctx.add_item(item_id='item',module='news',record_id='one',source_version='v1')
            await ctx.advance('await_confirmation')
        async def transfer(ctx):
            t=ctx.task
            await StagingStore(db).append(task_id=t['task_id'],item_id='item',field='body',lease=t['lease_token'],grant_revision=t['grant_revision'],source_version='v1',expected_seq=t['progress_seq'],offset=0,data=b'hello',now=clock[0])
            await repo.mark_staged(t,'item',5,clock[0]);await ctx.advance('apply')
        async def apply(ctx):
            await ctx.commit_item('item',("INSERT INTO demo_news SELECT 'one',CAST(data AS TEXT) FROM sync_parts WHERE task_id=? AND item_id='item' AND field='body' AND offset=0",(ctx.task['task_id'],)))
            await ctx.advance('cleanup')
        async def cleanup(ctx):
            if not await repo.cleanup_one(ctx.task,clock[0]):await ctx.advance('done')
        engine=Engine(repo,{'discover':discover,'transfer':transfer,'apply':apply,'cleanup':cleanup},lambda:clock[0])
        for _ in range(8):
            await engine.tick();row=await repo.read(task['task_id'])
            print(row['phase'],row['status'],'progress_seq='+str(row['progress_seq']))
            if row['status']=='done':break
            clock[0]+=1
        assert row['status']=='done'
        print(await db.query('SELECT * FROM demo_news'))
    finally:db.close()


if __name__=='__main__':asyncio.run(main())
