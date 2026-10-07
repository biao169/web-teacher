"""Probe effective media/cache prefixes with a small disposable binary object."""
import json
import re
from uuid import uuid4


def targets(config):
    bindings = {b['binding']: b for b in config.get('r2_buckets', [])}
    variables = config.get('vars', {})
    result = []
    for role in ('MEDIA', 'CACHE'):
        binding = variables.get('TEACHER_' + role + '_BINDING')
        bucket = bindings.get(binding, {}).get('bucket_name', '')
        prefix = variables.get('TEACHER_' + role + '_PREFIX', '')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', bucket):
            raise ValueError('R2 绑定缺失或桶名无效 / Invalid R2 binding: ' + role)
        if (not isinstance(prefix, str) or not prefix.endswith('/') or prefix.startswith('/')
                or any(p in ('', '.', '..') for p in prefix[:-1].split('/'))
                or '\\' in prefix or any(ord(c) < 32 for c in prefix)):
            raise ValueError('R2 对象前缀无效 / Invalid R2 prefix: ' + role)
        result.append((role, bucket, prefix, bindings[binding].get('jurisdiction')))
    _, mb, mp, _ = result[0]
    _, cb, cp, _ = result[1]
    if mb == cb and (mp.startswith(cp) or cp.startswith(mp)):
        raise ValueError('媒体与缓存前缀不能重叠 / Media and cache prefixes overlap')
    return result


def check(node, wrangler, stage, env, config, runner, log, *, publish):
    selected = targets(config)
    # Keep probe configuration free of application entrypoints and remote dev bindings.
    cfg = stage/'r2-check.json'
    cfg.write_text(json.dumps({'name': config['name'], 'compatibility_date': config['compatibility_date'],
                              'r2_buckets': config['r2_buckets']}), encoding='utf-8')
    run_id = uuid4().hex
    payload = b'teacher-site-r2-probe\x00\xff\r\n' + bytes(range(256)) + run_id.encode('ascii')
    source = stage/'r2-probe.bin'
    source.write_bytes(payload)
    base = [node, str(wrangler), 'r2', 'object']
    flags = ['--config', str(cfg)]
    flags += ['--remote'] if publish else ['--local', '--persist-to', str(stage/'.r2-reference')]
    log('R2-CHECK', '检查媒体与缓存读写 / Check media and cache read/write', mode='remote' if publish else 'local')
    for role, bucket, prefix, jurisdiction in selected:
        path = bucket + '/' + prefix + '.deploy-probe/' + run_id + '.bin'
        download = stage/('r2-read-' + role.lower() + '.bin')
        options = flags + (['--jurisdiction', jurisdiction] if jurisdiction else [])
        log('R2-TARGET', '临时检查对象 / Temporary probe object', role=role, object=path)
        error = None
        try:
            runner('R2-PUT', [*base, 'put', path, *options, '--file', str(source), '--force'], stage, env)
            runner('R2-GET', [*base, 'get', path, *options, '--file', str(download)], stage, env)
            if not download.is_file() or download.read_bytes() != payload:
                raise ValueError('R2 返回内容不一致 / R2 binary round-trip mismatch: ' + role)
        except BaseException as exc:
            error = exc
            raise
        finally:
            # PUT may have succeeded remotely even when its response was lost.
            # Delete this exact random key only; never scan or delete a prefix.
            try:
                runner('R2-DELETE', [*base, 'delete', path, *options, '--force'], stage, env)
            except BaseException as cleanup:
                log('R2-CLEANUP-FAILED', '无法确认测试对象已删除；请按此路径检查 / Probe cleanup unconfirmed; inspect this exact object', object=path)
                if error is None:
                    raise ValueError('R2 测试对象清理失败，停止发布 / R2 cleanup failed: ' + path) from cleanup
                log('R2-PRIMARY-ERROR', str(error))
                # Preserve the original failure while leaving the cleanup path in logs.
            download.unlink(missing_ok=True)
        log('R2-OK', '二进制读写及删除命令通过 / Binary round-trip and deletion succeeded', role=role)
    log('R2-READY', '存储检查通过 / Storage checks passed', mode='remote' if publish else 'local')
