from site_sync.deploy.schema import Plan
from dataclasses import replace
NAMES={'sync_events','sync_events_task','sync_tasks_delete','service_meta','sync_schema','sync_peers','sync_grants','sync_tasks','sync_tasks_due','sync_items','sync_parts','sync_files','sync_file_parts','sync_schedules','sync_schedules_due'}
def core_plan(path):
    full=Plan.compile(path)
    import sqlite3
    c=sqlite3.connect(':memory:');c.executescript(path.read_text())
    ddl=[r[0] for r in c.execute("SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY rowid") if any(r[0].startswith('CREATE TABLE '+n+' ') or r[0].startswith('CREATE INDEX '+n+' ') or r[0].startswith('CREATE UNIQUE INDEX '+n+' ') for n in NAMES)]
    c.close()
    return replace(full,statements=tuple(ddl)+('INSERT INTO sync_schema(singleton,version) VALUES(1,4)',),expected={k:v for k,v in full.expected.items() if k in NAMES})
