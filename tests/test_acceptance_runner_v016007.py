"""The release runner includes all required gates and reports missing live checks."""
import importlib.util,json,subprocess,sys
from pathlib import Path
from types import SimpleNamespace
ROOT=Path(__file__).resolve().parents[1]
def runner():
    spec=importlib.util.spec_from_file_location('release_acceptance_runner',ROOT/'tests/run_acceptance.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def test_all_offline_gates_and_honest_boundaries(tmp_path,monkeypatch):
    m=runner();calls=[];report=tmp_path/'result.json'
    monkeypatch.setattr(m.platform,'platform',lambda:'isolated-test')
    monkeypatch.setattr(sys,'argv',['acceptance','--dom','--report',str(report)])
    monkeypatch.setattr(m.shutil,'which',lambda _: '/test/node')
    def run(command,**kwargs):
        calls.append(command);assert kwargs['timeout']==1800
        return SimpleNamespace(returncode=0,stdout='passed',stderr='')
    monkeypatch.setattr(m.subprocess,'run',run)
    assert m.main()==0
    data=json.loads(report.read_text());assert len(calls)==6
    assert any('--separate-sync' in command for command in calls)
    assert any('--test' in command for command in calls)
    assert data['results']['simulated_dom']=='passed'
    assert data['results']['real_browser']=='not_run'
    assert data['real_cloudflare_d1_r2']=='not_run' and data['production_deployed'] is False

def test_timeout_is_reported_and_other_gates_continue(tmp_path,monkeypatch):
    m=runner();report=tmp_path/'result.json';calls=[]
    monkeypatch.setattr(m.platform,'platform',lambda:'isolated-test')
    monkeypatch.setattr(sys,'argv',['acceptance','--report',str(report)])
    monkeypatch.setattr(m.shutil,'which',lambda _:None)
    def run(command,**kwargs):
        calls.append(command)
        if len(calls)==1:raise subprocess.TimeoutExpired(command,1800)
        return SimpleNamespace(returncode=0,stdout='',stderr='')
    monkeypatch.setattr(m.subprocess,'run',run)
    assert m.main()==1 and len(calls)==3
    data=json.loads(report.read_text());assert data['results']['python']=='failed'
    assert data['results']['offline_separate_executor']=='passed'
    assert data['results']['native_stream']=='not_run'
