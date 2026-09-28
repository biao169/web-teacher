"""Single-shot terminal menus and truthful step output; isolated host adapters."""
import os
import sys
import pytest
if os.name!='posix':pytest.skip('Linux manager',allow_module_level=True)
from deploy.linux import tweb
from test_linux_manager_v76 import managed


@pytest.mark.parametrize('answers',[[''],['0'],['6',''],['17',''],['13','']])
def test_empty_selection_exits_without_execution(monkeypatch,answers):
    monkeypatch.setattr(sys.stdin,'isatty',lambda:True)
    entries=iter(answers);monkeypatch.setattr('builtins.input',lambda _:next(entries))
    monkeypatch.setattr(tweb,'execute',lambda a:pytest.fail('unexpected execution'))
    assert tweb.main([])==0


def test_completed_operation_does_not_prompt_again(monkeypatch,capsys):
    monkeypatch.setattr(sys.stdin,'isatty',lambda:True);calls=[]
    def select(prompt):
        calls.append(prompt)
        assert len(calls)==1
        return '4'
    monkeypatch.setattr('builtins.input',select)
    monkeypatch.setattr(tweb,'execute',lambda a:0)
    assert tweb.main([])==0
    assert 'Completed; menu closed' in capsys.readouterr().out


def test_failed_operation_does_not_return_to_menu(monkeypatch,capsys):
    monkeypatch.setattr(sys.stdin,'isatty',lambda:True)
    answers=iter(['4']);monkeypatch.setattr('builtins.input',lambda _:next(answers))
    monkeypatch.setattr(tweb,'execute',lambda a:(_ for _ in ()).throw(RuntimeError('synthetic failure')))
    with pytest.raises(RuntimeError):tweb.main([])
    text=capsys.readouterr().out
    assert 'Failed or interrupted; menu closed' in text and 'Completed; menu closed' not in text


def test_restart_logs_actual_steps_and_skips_shared_services(managed,capsys):
    m,events,_=managed;events.clear();capsys.readouterr();m.restart()
    text=capsys.readouterr().out
    for fragment in ('Stop service','Reload service definitions','Start service','Check website health','Firewall','nginx/Caddy','SKIP'):
        assert fragment in text
    assert text.index('Stop service')<text.index('Start service')<text.index('Check website health')
    assert not any('nginx' in e or 'caddy' in e or 'ufw' in e for e in events)


def test_step_failure_not_reported_as_success(capsys):
    def failure(*args,**kw):raise RuntimeError('failed')
    m=tweb.Manager(runner=failure)
    with pytest.raises(RuntimeError):m.run(['systemctl','stop',tweb.SERVICE])
    text=capsys.readouterr().out
    assert 'START' in text and 'FAILED' in text and ' OK ' not in text


def test_command_logging_does_not_echo_inline_secrets(capsys):
    m=tweb.Manager(runner=lambda *a,**kw:None)
    m.run(['runuser','-u',tweb.USER,'--','env','TOKEN=secret-value','python','-c','private-code'])
    text=capsys.readouterr().out
    assert 'Verify service-account access' in text
    assert 'secret-value' not in text and 'private-code' not in text
