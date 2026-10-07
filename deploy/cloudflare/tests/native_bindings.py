"""Run local binding acceptance with a disposable SQL list; never execute remote SQL.
Usage: python deploy/cloudflare/tests/native_bindings.py /outside/stage-with-node_modules
The stage must contain the locked Wrangler/Miniflare installation from npm ci.
"""
import argparse
import json
from pathlib import Path
import sqlite3
import subprocess
import tempfile


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('stage',type=Path);args=p.parse_args()
    root=Path(__file__).resolve().parents[3]
    statements=[];pending=''
    for line in (root/'database/schema.sql').read_text(encoding='utf-8').splitlines(True):
        pending+=line
        if sqlite3.complete_statement(pending):statements.append(pending);pending=''
    if pending.strip():raise ValueError('Incomplete schema statement')
    with tempfile.TemporaryDirectory(prefix='teacher-binding-probe-') as folder:
        path=Path(folder)/'statements.json';path.write_text(json.dumps(statements),encoding='utf-8')
        subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),str(args.stage.resolve()),str(path)],check=True)

if __name__=='__main__':main()
