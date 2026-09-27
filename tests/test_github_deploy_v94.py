"""GitHub defaults and byte-preserving local Git round trips; no remote or privileged writes."""
import json,os,shutil,subprocess,sys
from pathlib import Path
import pytest
from deploy.vps.release import inventory,verify,write_manifest,EXCLUDED
ROOT=Path(__file__).resolve().parents[1]


def test_bootstrap_defaults_and_override_flags():
    text=(ROOT/'install.sh').read_text()
    assert "repo='https://github.com/biao169/web-teacher.git' branch='web-py'" in text
    if shutil.which('bash'):
        subprocess.run(['bash','-n',ROOT/'install.sh'],check=True)
        help=subprocess.run(['bash',ROOT/'install.sh','--help'],check=True,capture_output=True,text=True).stdout
        assert 'web-py' in help and '--repo' in help and '--python' in help


def test_manager_default_install_but_update_keeps_saved_source():
    if os.name!='posix':pytest.skip('Linux manager')
    from deploy.linux.tweb import parser
    install=parser().parse_args(['install','--domain','teacher.example.org'])
    assert (install.repo,install.branch)==('https://github.com/biao169/web-teacher.git','web-py')
    override=parser().parse_args(['install','--repo','https://github.com/example/other.git','--branch','preview','--domain','teacher.example.org'])
    assert override.branch=='preview' and override.repo.endswith('/other.git')
    update=parser().parse_args(['update']);assert update.repo is None and update.branch is None


def test_refresh_is_explicit_and_verifier_detects_edits(tmp_path):
    (tmp_path/'source.py').write_text('print(1)\n');write_manifest(tmp_path)
    with pytest.raises(FileExistsError):write_manifest(tmp_path)
    (tmp_path/'source.py').write_text('print(2)\n')
    with pytest.raises(ValueError):verify(tmp_path)
    write_manifest(tmp_path,refresh=True);assert verify(tmp_path)['verified']
    assert not list(tmp_path.glob('.manifest-*.tmp'))


@pytest.mark.parametrize('autocrlf',['true','false'])
def test_local_git_clone_retains_release_bytes(tmp_path,autocrlf):
    if not shutil.which('git'):pytest.skip('Git not installed')
    source=tmp_path/'source';source.mkdir()
    for rel in inventory(ROOT):
        target=source/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/rel,target)
    write_manifest(source)
    def git(*args,cwd=source):return subprocess.run(['git',*map(str,args)],cwd=cwd,check=True,capture_output=True,text=True)
    git('init','-b','web-py');git('config','core.autocrlf',autocrlf)
    # Ensure local credentials/data do not enter the Git tree.
    for rel in ('data/database/site.sqlite3','data/media/private.jpg','transfer-data/private.bin','.env','deploy/windows/local.cmd'):
        f=source/rel;f.parent.mkdir(parents=True,exist_ok=True);f.write_text('DO NOT COMMIT')
        git('check-ignore','--',rel)
    git('add','.');git('-c','user.name=Release test','-c','user.email=release@example.invalid','commit','-m','Synthetic release')
    target=tmp_path/'checkout';git('clone','--branch','web-py','--config','core.autocrlf='+autocrlf,source,target,cwd=tmp_path)
    assert verify(target)['verified']
    assert b'\r' not in (target/'install.sh').read_bytes()
    for file in (target/'deploy').rglob('*.cmd'):
        assert b'\r\n' in file.read_bytes(),file
    assert not (target/'data').exists() and not (target/'.env').exists()


def test_fetch_checks_manifest_before_accepting_clone(tmp_path):
    if os.name!='posix':pytest.skip('Linux manager')
    from deploy.linux import tweb
    for corrupt in (False,True):
        base=tmp_path/('bad' if corrupt else 'good');(base/'releases').mkdir(parents=True)
        events=[]
        def runner(args,**kwargs):
            args=list(map(str,args));events.append(args)
            if 'clone' in args:
                target=Path(args[-1]);target.mkdir()
                for rel in inventory(ROOT):
                    f=target/rel;f.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/rel,f)
                write_manifest(target)
                if corrupt:(target/'install.sh').write_text('# changed\n')
                (target/'.git').mkdir()
                return subprocess.CompletedProcess(args,0,stdout='')
            if 'rev-parse' in args:return subprocess.CompletedProcess(args,0,stdout='synthetic-commit\n')
            return subprocess.run(args,**kwargs,check=True,capture_output=True,text=True)
        manager=tweb.Manager(tweb.Layout(base=base),runner)
        if corrupt:
            with pytest.raises(subprocess.CalledProcessError):manager.fetch(tweb.DEFAULT_REPOSITORY,tweb.DEFAULT_BRANCH)
            assert not list((base/'releases').iterdir())
        else:
            release,commit=manager.fetch(tweb.DEFAULT_REPOSITORY,tweb.DEFAULT_BRANCH)
            assert commit=='synthetic-commit' and not (release/'.git').exists()
        assert events[0][events[0].index('--branch')+1]=='web-py'
        assert any('verify' in call for call in events)
