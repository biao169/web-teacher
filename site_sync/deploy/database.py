"""Local automatic provisioning and D1 plan build CLI. No production HTTP route."""
import argparse
import asyncio
import json
from pathlib import Path
from .schema import Plan, ensure
from .migrations import registered

ROOT = Path(__file__).resolve().parents[2]


async def provision_d1(binding, plan_json, *, backup_callback=None):
    from site_sync.adapters.d1 import D1
    # Called once by the future deploy controller, NOT fetch/scheduled requests.
    plan = Plan.load(plan_json)
    return await ensure(D1(binding, backup_callback=backup_callback), plan, migrations=registered(plan))


def main():
    p = argparse.ArgumentParser()
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument('--sqlite', type=Path)
    group.add_argument('--emit-d1-plan', type=Path)
    p.add_argument('--check', action='store_true')
    args = p.parse_args()
    plan = Plan.compile(ROOT / 'database/schema.sql')
    if args.emit_d1_plan:
        args.emit_d1_plan.write_text(plan.dump(), encoding='utf-8')
        print(json.dumps({'action': 'plan-built', 'version': plan.version, 'schema_sha256': plan.source_sha256}))
        return
    from site_sync.adapters.sqlite import SQLite
    if args.check and not args.sqlite.is_file():
        p.error('--check requires an existing database; no empty file created')
    adapter = SQLite(args.sqlite)
    try:
        print(json.dumps(asyncio.run(ensure(adapter, plan, migrations=registered(plan), check_only=args.check)), ensure_ascii=False))
    finally:
        adapter.close()


if __name__ == '__main__': main()
