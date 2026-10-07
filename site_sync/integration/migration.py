"""Exact v0.15.160 -> v0.16.001 migration; no other website predecessor."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def definitions(name):
    return {o['name']:o['sql'] for o in json.loads((ROOT/'database/native'/name).read_text())['objects']}
def statements():
    old=definitions('teacher-v0.15.160.json');new=definitions('teacher.json')
    legacy={'sync_task_items','sync_tasks','sync_peers'}
    if any(old[n]!=new.get(n) for n in old if n not in legacy):raise ValueError('Non-sync schema changed unexpectedly')
    return ['DROP TABLE '+n for n in ('sync_task_items','sync_tasks','sync_peers')]+[sql for n,sql in new.items() if n not in old or n in legacy]+['INSERT INTO sync_schema(singleton,version,maintenance) VALUES(1,4,0)']
