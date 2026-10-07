from site_sync.tests.schema_fixture import core_plan
"""Real process death and disk reopen; this does not emulate Worker termination."""
import asyncio
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest

from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.tasks import Tasks
from site_sync.deploy.schema import Plan, ensure

ROOT = Path(__file__).resolve().parents[2]
run = asyncio.run

# Child dies without finally/close/finish. Only the SQLite process is killed.
CHILD = r'''
import asyncio, os, signal, sys
from site_sync.adapters.sqlite import SQLite
from site_sync.adapters.tasks import Tasks
run = asyncio.run
db = SQLite(sys.argv[1])
repo = Tasks(db, lease_seconds=10, platform='local')
task = run(repo.claim(102))
assert task is not None
mode = sys.argv[2]
if mode == 'candidate':
    run(repo.add_item(task, item_id='i', module='news', record_id='i', source_version='v1', now=102))
elif mode in ('committed', 'uncommitted'):
    if mode == 'uncommitted':
        # Die inside the actual production batch after its business statement.
        def trace(sql):
            if sql.startswith('UPDATE sync_schema SET version=CASE WHEN changes()=1'):
                os.kill(os.getpid(), signal.SIGKILL)
        db.connection.set_trace_callback(trace)
    run(repo.commit_item(task, 'i', ("UPDATE news SET writes=writes+1 WHERE id='i'", ()), 102))
os.kill(os.getpid(), signal.SIGKILL)
'''


@unittest.skipUnless(os.name == 'posix', 'Requires POSIX SIGKILL')
class ProcessRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'website.db'
        self.db = SQLite(self.path)
        run(ensure(self.db, core_plan(ROOT / 'database/schema.sql')))
        self.db.connection.execute("INSERT INTO sync_peers VALUES('p','https://peer.invalid','env:KEY','r1',1)")
        self.repo = Tasks(self.db, lease_seconds=10, platform='local')
        run(self.repo.put_grant(grant_id='g', principal_id='admin', scope=['news'], can_write=True, can_delete=True))
        self.task = run(self.repo.create(peer_id='p', grant_id='g', scope=['news'], operation_id='op', mode='scheduled', now=100))
        self.db.connection.execute('CREATE TABLE news(id TEXT PRIMARY KEY, writes INTEGER NOT NULL)')
        self.db.connection.execute("INSERT INTO news VALUES('i',0)")

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def prepared(self):
        task = run(self.repo.claim(100))
        run(self.repo.add_item(task, item_id='i', module='news', record_id='i', source_version='v1', now=100))
        run(self.repo.advance(task, 'await_confirmation', 100))
        run(self.repo.finish(task, 100))
        task = run(self.repo.claim(101))
        run(self.repo.mark_staged(task, 'i', 0, 101))
        run(self.repo.advance(task, 'apply', 101))
        run(self.repo.finish(task, 101))

    def crash(self, mode):
        self.db.close()
        result = subprocess.run([sys.executable, '-c', CHILD, str(self.path), mode], cwd=ROOT,
                                capture_output=True, text=True, timeout=10)
        self.db = SQLite(self.path)
        self.repo = Tasks(self.db, lease_seconds=10, platform='local')
        self.assertEqual(result.returncode, -signal.SIGKILL, result.stderr)
        self.assertEqual(self.db.connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        self.assertFalse(run(self.repo.reconcile_one(111)))
        self.assertIsNone(run(self.repo.claim(111)))
        self.assertTrue(run(self.repo.reconcile_one(112)))
        self.assertFalse(run(self.repo.reconcile_one(112)))
        return run(self.repo.read(self.task['task_id']))

    def test_death_after_claim_counts_once_and_shrinks(self):
        row = self.crash('claim')
        self.assertEqual(row['total_errors'], 1)
        self.assertEqual(row['no_progress_count'], 1)
        self.assertEqual(row['slice_bytes'], self.task['slice_bytes'] // 2)
        self.assertIsNone(run(self.repo.claim(row['next_run_at'] - 1)))
        self.assertIsNotNone(run(self.repo.claim(row['next_run_at'])))

    def test_durable_candidate_resets_failure_streak(self):
        self.db.connection.execute('UPDATE sync_tasks SET no_progress_count=20')
        row = self.crash('candidate')
        self.assertEqual(row['no_progress_count'], 0)
        self.assertEqual(self.db.connection.execute('SELECT count(*) FROM sync_items').fetchone()[0], 1)

    def test_death_after_business_commit_does_not_replay(self):
        self.prepared()
        row = self.crash('committed')
        self.assertEqual(row['no_progress_count'], 0)
        task = run(self.repo.claim(row['next_run_at']))
        self.assertFalse(run(self.repo.commit_item(task, 'i', ("UPDATE news SET writes=writes+1 WHERE id='i'", ()), row['next_run_at'])))
        self.assertEqual(self.db.connection.execute('SELECT writes FROM news').fetchone()[0], 1)

    def test_death_inside_business_batch_rolls_back_and_retries(self):
        self.prepared()
        row = self.crash('uncommitted')
        self.assertEqual(row['no_progress_count'], 1)
        self.assertEqual(self.db.connection.execute('SELECT writes FROM news').fetchone()[0], 0)
        self.assertEqual(self.db.connection.execute('SELECT status FROM sync_items').fetchone()[0], 'staged')
        task = run(self.repo.claim(row['next_run_at']))
        self.assertTrue(run(self.repo.commit_item(task, 'i', ("UPDATE news SET writes=writes+1 WHERE id='i'", ()), row['next_run_at'])))
        self.assertEqual(self.db.connection.execute('SELECT writes FROM news').fetchone()[0], 1)
