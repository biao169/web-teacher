import json
from pathlib import Path
import sys
import pytest
HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))
import r2_check


def config(separate=False):
    return {'name': 'teacher-site', 'compatibility_date': '2026-09-14',
            'vars': {'TEACHER_MEDIA_BINDING': 'MEDIA', 'TEACHER_CACHE_BINDING': 'CACHE' if separate else 'MEDIA',
                     'TEACHER_MEDIA_PREFIX': 'media/', 'TEACHER_CACHE_PREFIX': 'cache/'},
            'r2_buckets': [{'binding': 'MEDIA', 'bucket_name': 'teacher-media'}] +
                          ([{'binding': 'CACHE', 'bucket_name': 'teacher-cache'}] if separate else [])}


@pytest.mark.parametrize('remote', [False, True])
@pytest.mark.parametrize('separate', [False, True])
def test_round_trip_exact_cleanup(tmp_path, remote, separate):
    objects = {'teacher-media/media/existing.jpg': b'keep'}
    calls = []
    def runner(name, args, cwd, env):
        calls.append(args)
        path = args[5]
        if name == 'R2-PUT': objects[path] = Path(args[args.index('--file')+1]).read_bytes()
        if name == 'R2-GET': Path(args[args.index('--file')+1]).write_bytes(objects[path])
        if name == 'R2-DELETE': objects.pop(path)
    r2_check.check('node', Path('wrangler.js'), tmp_path, {}, config(separate), runner, lambda *a, **k: None, publish=remote)
    assert objects == {'teacher-media/media/existing.jpg': b'keep'}
    assert len(calls) == 6
    assert all(('--remote' in c) == remote and ('--local' in c) != remote for c in calls)
    assert '/media/.deploy-probe/' in calls[0][5]
    assert '/cache/.deploy-probe/' in calls[3][5]
    assert calls[0][5] != calls[3][5]


@pytest.mark.parametrize('failure', ['R2-PUT', 'R2-GET', 'mismatch', 'R2-DELETE'])
def test_failure_stops_and_always_attempts_exact_delete(tmp_path, failure):
    calls = []
    def runner(name, args, cwd, env):
        calls.append((name,args[5]))
        if name == failure: raise ValueError('simulated ' + failure)
        if name == 'R2-GET':
            Path(args[args.index('--file')+1]).write_bytes(b'incorrect' if failure == 'mismatch' else (tmp_path/'r2-probe.bin').read_bytes())
    with pytest.raises(ValueError):
        r2_check.check('node', Path('wrangler.js'), tmp_path, {}, config(), runner, lambda *a, **k: None, publish=True)
    assert calls[-1][0] == 'R2-DELETE'
    assert len({p for _, p in calls}) == 1


def test_cleanup_failure_reports_path_and_preserves_primary(tmp_path):
    logs=[]
    def runner(name, args, cwd, env): raise ValueError(name)
    with pytest.raises(ValueError, match='R2-PUT'):
        r2_check.check('node', Path('wrangler.js'), tmp_path, {}, config(), runner,
                       lambda *a, **k: logs.append((a,k)), publish=True)
    assert any(a[0] == 'R2-CLEANUP-FAILED' and k['object'].startswith('teacher-media/media/.deploy-probe/') for a,k in logs)


@pytest.mark.parametrize('prefix', ['', '/', '../cache/', 'media/nested/', 'media/', 'a//b/'])
def test_bad_or_overlapping_prefix_rejected(prefix):
    c = config(); c['vars']['TEACHER_CACHE_PREFIX'] = prefix
    with pytest.raises(ValueError): r2_check.targets(c)


def test_missing_binding_rejected():
    c = config(True); c['r2_buckets'].pop()
    with pytest.raises(ValueError, match='Invalid R2 binding'): r2_check.targets(c)
