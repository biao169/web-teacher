"""Run the startup check in a fresh interpreter, including negative controls."""
from pathlib import Path
import subprocess
import sys
import pytest
HERE=Path(__file__).resolve().parents[1]


def run(runtime):
    return subprocess.run([sys.executable,'-B',str(HERE/'startup_check.py'),'--runtime',str(runtime)],
                          capture_output=True,text=True,timeout=20)


def test_actual_startup_graph_passes():
    result=run(HERE/'runtime')
    assert result.returncode==0,result.stderr


@pytest.mark.parametrize('code',[
    'import secrets; secrets.token_hex(16)',
    'import os; os.urandom(16)',
    'import random; random.SystemRandom().randbytes(8)',
    'import time; time.time()',
    'import datetime; datetime.datetime.now()',
    'import sqlite3; sqlite3.connect(":memory:")',
    'import js',
    'from transfer.backend.codes import Codes; Codes(None)',
    'import socket; socket.create_connection(("127.0.0.1", 9))',
    'import subprocess; subprocess.run(["echo", "unexpected"])',
])
def test_startup_effect_rejected(tmp_path,code):
    (tmp_path/'entrypoint.py').write_text(code)
    result=run(tmp_path)
    assert result.returncode!=0 and ('blocked' in result.stderr or 'Request-only' in result.stderr),result.stderr


def test_startup_write_rejected(tmp_path):
    target=tmp_path/'must-not-exist'
    (tmp_path/'entrypoint.py').write_text('open('+repr(str(target))+', "w").write("bad")')
    result=run(tmp_path)
    assert result.returncode!=0 and not target.exists()


def test_executor_starts_without_main_website_preload():
    result=subprocess.run([sys.executable,'-B',str(HERE/'startup_check.py'),'--executor-only'],capture_output=True,text=True,timeout=20)
    assert result.returncode==0,result.stderr
