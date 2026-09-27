"""Explicit local import of the additional 30 students / 100 papers; no web/startup hooks."""
import argparse
import asyncio
from copy import deepcopy
import getpass
import hashlib
import json
from pathlib import Path

from .catalog import Error
from .examples import Examples
from .example_catalog import identity as media_identity
from .service_jobs import network_lease

VERSION = 'frontend-130-v1'
GROUPS = {'students': 30, 'publications': 100}


def load_rows():
    """Reject a wrong/truncated batch before writing; stable IDs never depend on displayed names."""
    data = json.loads(Path(__file__).with_name('frontend_example_rows.json').read_text(encoding='utf-8'))
    if data.get('version') != VERSION:
        raise ValueError('扩展示例批次版本不匹配')
    for table, count in GROUPS.items():
        if len(data.get(table, [])) != count:
            raise ValueError('扩展示例数量不匹配: ' + table)
        for i, item in enumerate(data[table], 1):
            expected = hashlib.sha256(f'teacher-examples:{VERSION}:{table}:{i}'.encode()).hexdigest()[:32]
            if item['uid'] != expected or item['values'].get('visibility') != 'public':
                raise ValueError('扩展示例标识或可见性不匹配')
    return data


class FrontendExamples(Examples):
    """Reuse the example permission/lease guards, media checks, native save and atomic audit."""
    def __init__(self, resources):
        super().__init__(resources)
        self.data = load_rows()
        self.original = Examples(resources)

    async def coverage(self, groups):
        result = {}
        for table in groups:
            if table not in GROUPS:
                raise Error('扩展示例组无效')
            self.authorize(table)
            ids = [item['uid'] for item in self.data[table]]
            found = await self.r.sql.query(
                f'SELECT count(*) AS n FROM "{table}" WHERE uid IN (' + ','.join('?' for _ in ids) + ')', ids)
            result[table] = {'total': len(ids), 'existing': found[0]['n'], 'missing': len(ids)-found[0]['n']}
        return result

    async def step(self, group, index):
        if group not in GROUPS or type(index) is not int or not 1 <= index <= GROUPS[group]:
            raise Error('扩展示例项无效')
        self.authorize(group)
        item = self.data[group][index-1]
        uid, r = item['uid'], self.r
        exists = lambda: r.sql.query(f'SELECT uid FROM "{group}" WHERE uid=?', (uid,))
        # Existing rows win even after edits or media removal. Never recreate their attachments.
        media_created = 0
        if not await exists() and item['asset']:
            needed = (1, 2, 3) if group == 'students' else (4,)
            for n in needed:
                result = await self.original.step('media_assets', n)
                media_created += result['status'] == 'created'
        async with network_lease(r, 'examples', 'data_tools', 'create') as lease:
            if await exists():
                return {'status': 'kept', 'uid': uid, 'media_created': media_created}
            row = deepcopy(item['values'])
            if item['asset']:
                media = await self.original.assets(group)
                row['avatar_key' if group == 'students' else 'pdf_key'] = media[item['asset']]['object_key']
            await r.content.save(group, r.p, row, new_uid=uid, creation_guard=self.guard(group, lease))
            return {'status': 'created', 'uid': uid, 'media_created': media_created}


async def import_batch(service, groups=('students', 'publications'), limit=130, emit=print):
    """Stop at the first failure, report persisted progress; reruns fill missing stable IDs only."""
    if type(limit) is not int or not 1 <= limit <= 130:
        raise ValueError('limit 必须在 1–130 之间')
    groups = tuple(groups)
    before = await service.coverage(groups)
    async def media_count():
        found = await service.r.sql.query('SELECT count(*) AS n FROM media_assets WHERE uid IN (?,?,?,?)',
                                          [media_identity('media_assets', i) for i in range(1, 5)])
        return found[0]['n']
    media_before = await media_count()
    report = {'version': VERSION, 'before': before, 'created': 0, 'kept': 0, 'failed': 0,
              'media_created': 0, 'unprocessed': 0, 'groups': {g: {'created': 0, 'kept': 0, 'failed': 0} for g in groups}}
    emit({'event': 'before', 'coverage': before})
    stop = False
    for group in groups:
        for index in range(1, GROUPS[group]+1):
            if stop or report['created'] >= limit:
                report['unprocessed'] += 1
                continue
            try:
                result = await service.step(group, index)
                status = result['status']
                report[status] += 1
                report['groups'][group][status] += 1
                report['media_created'] += result['media_created']
                if (report['created']+report['kept']) % 10 == 0:
                    emit({'event': 'progress', 'group': group, 'index': index,
                          'created': report['created'], 'kept': report['kept']})
            except Exception as exc:
                report['failed'] += 1
                report['groups'][group]['failed'] += 1
                report['error'] = {'group': group, 'index': index, 'uid': service.data[group][index-1]['uid'], 'message': str(exc)}
                stop = True
    report['media_created'] = max(0, await media_count()-media_before)
    report['after'] = await service.coverage(groups)
    report['complete'] = not report['failed'] and all(v['missing'] == 0 for v in report['after'].values())
    emit({'event': 'result', **report})
    return report


async def console(settings, *, username=None, action='status', group='all', limit=130):
    """Use the existing administrator login; never create accounts or print credentials."""
    from .auth import Auth
    from .content import Content
    from .runtime import local
    from .database import Database
    if not settings.database_path.is_file():
        raise ValueError('数据库不存在；请先运行普通启动入口初始化，并沿用相同数据配置。')
    # Check the existing schema without running initialization/migration from this command.
    Database(settings.database_path).verify()
    r = local(settings)
    r.auth = Auth(r.sql, r.passwords)
    username = username or input('Administrator username [admin]: ').strip() or 'admin'
    token = await r.auth.login(username, getpass.getpass('Administrator password: '), 'local-frontend-examples')
    try:
        r.p = await r.auth.principal(token)
        r.content = Content(r.sql, r.auth)
        service = FrontendExamples(r)
        groups = tuple(GROUPS) if group == 'all' else (group,)
        emit = lambda value: print(json.dumps(value, ensure_ascii=False), flush=True)
        if action == 'status':
            emit({'version': VERSION, 'coverage': await service.coverage(groups)})
            return 0
        result = await import_batch(service, groups, limit, emit)
        return int(bool(result['failed']))
    finally:
        principal = await r.auth.principal(token)
        if principal:
            await r.auth.logout(principal)


def main(argv=None, settings=None):
    parser = argparse.ArgumentParser(description='显式追加 30 名学生和 100 篇论文（虚构），保留原数据及已编辑示例')
    parser.add_argument('action', choices=('status', 'add'), nargs='?', default='status')
    parser.add_argument('--username')
    parser.add_argument('--group', choices=('all', *GROUPS), default='all')
    parser.add_argument('--limit', type=int, choices=range(1, 131), metavar='1..130', default=130,
                        help='本次最多新增的业务记录数；再次运行仅补缺失项')
    args = parser.parse_args(argv)
    from backend.app.config import Settings
    settings = settings or Settings.from_env()
    print('Database: ' + str(settings.database_path), flush=True)
    return asyncio.run(console(settings, **vars(args)))


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (Error, ValueError) as exc:
        print(str(exc))
        raise SystemExit(1)
