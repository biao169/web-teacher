import tomllib
import pytest
import build

def values():
    return (
        tomllib.loads((build.ROOT/'pyproject.toml').read_text())['project'],
        tomllib.loads((build.HERE/'pyproject.toml').read_text())['project'],
        tomllib.loads((build.HERE/'uv.lock').read_text()),
    )

def test_release_lock_matches():
    build.check_lock(*values())

@pytest.mark.parametrize('target',['root','manifest','lock','missing'])
def test_stale_version_rejected(target):
    project,manifest,lock=values()
    if target=='root':project['version']='old'
    elif target=='manifest':manifest['version']='old'
    elif target=='missing':lock['package']=[]
    else:
        next(p for p in lock['package'] if p['name']==manifest['name'])['version']='old'
    with pytest.raises(build.BuildError,match='Version mismatch'):
        build.check_lock(project,manifest,lock)
