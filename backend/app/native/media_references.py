"""从原生外键和经过安全解析的正文派生媒体引用，不增加数据库表或缓存副本。"""
from .source_links import field_link
import hashlib
from .catalog import TABLES, TITLE, MODULES, Error, label
from backend.app.domain.richtext import body_references

MEDIA_FIELDS = tuple((table, field) for table, spec in TABLES.items()
                     for field, value in spec['columns'].items()
                     if value.get('references', {}).get('table') == 'media_assets')
REFERENCE_LOCK = 'media:references'
REFERENCE_LABELS = {'avatar_key':'头像', 'logo_key':'Logo', 'favicon_key':'网站图标',
                    'og_image_key':'分享图片', 'pdf_key':'论文PDF', 'certificate_key':'证书',
                    'cover_key':'封面', 'syllabus_key':'教学大纲', 'material_key':'课程资料', 'attachment_key':'附件'}


class MediaReferences:
    """列表计数、使用位置、公开访问和回收检查共用真实引用解析。"""
    def __init__(self, content):
        """复用内容服务的数据库和可见范围规则。"""
        self.content = content
        self.sql = content.sql

    def scope(self, table, principal):
        """没有目标模块查看权限时只允许输出受保护标记。"""
        if not principal or not principal['permissions'].get(table, {}).get('can_view'):
            return '0', []
        return self.content.scope(table, principal)

    async def news_rows(self, uids, principal=None, public=False):
        """按20条游标分页解析候选正文；URL文字或相似UID不算实际图片/链接。"""
        if not uids:
            return
        where, args = self.content.scope('news', public=True) if public else ('1', [])
        visible, visible_args = ('1', []) if public else self.scope('news', principal)
        # Markdown entities/reference syntax can encode the UID; parse every bounded Markdown candidate.
        candidates = "content_format='markdown' OR "+' OR '.join('instr(content,?)>0' for _ in uids)
        last = 0
        while True:
            rows = await self.sql.query(
                'SELECT id,uid,substr(title,1,240) title,substr(content,1,200001) content,content_format,'
                f'CASE WHEN {visible} THEN 1 ELSE 0 END AS visible FROM news '
                f"WHERE content_format IN ('html','markdown') AND id>? AND ({where}) AND ({candidates}) ORDER BY id LIMIT 20",
                (*visible_args, last, *args, *['/media/' + uid for uid in uids]))
            if not rows:
                break
            for row in rows:
                # Oversized imported HTML is not silently treated as unreferenced.
                row['uncertain'] = len(row['content']) > 200000
                row['refs'] = set(uids) if row['uncertain'] else set(body_references(row['content'],row['content_format'])) & set(uids)
                row['source'] = 'news.content'
                yield row
            last = rows[-1]['id']

    async def body_rows(self, uids, principal=None, public=False):
        """统一原文与当前生效译文；源摘要过时的译文不产生正在使用的引用。"""
        async for row in self.news_rows(uids,principal,public):
            yield row
        if not uids:
            return
        where,args=self.content.scope('news',public=True) if public else ('1',[])
        visible,visible_args=('1',[]) if public else self.scope('news',principal)
        if not public and not (principal and principal['permissions'].get('translation_cache',{}).get('can_view')):
            visible,visible_args='0',[]
        candidates="n.content_format='markdown' OR "+' OR '.join('instr(t.translated_text,?)>0' for _ in uids)
        last=0
        while True:
            rows=await self.sql.query(
                'SELECT t.id,t.uid,substr(n.title,1,240) title,substr(t.translated_text,1,200001) content,'
                f'substr(n.content,1,200001) original,n.content_format,t.source_hash,CASE WHEN {visible} THEN 1 ELSE 0 END AS visible '
                "FROM translation_cache t JOIN news n ON t.source_ref_key='news:'||n.uid||':content' "
                f"WHERE t.is_current=1 AND t.status='success' AND t.target_lang='en' AND n.content_format IN ('html','markdown') "
                f'AND t.id>? AND ({where}) AND ({candidates}) ORDER BY t.id LIMIT 20',
                (*visible_args,last,*args,*['/media/'+uid for uid in uids]))
            if not rows:
                break
            for row in rows:
                row['uncertain']=len(row['content'])>200000 or len(row['original'] or '')>200000
                if not row['uncertain'] and hashlib.sha256((row['original'] or '').encode()).hexdigest()!=row['source_hash']:
                    continue
                row['refs']=set(uids) if row['uncertain'] else set(body_references(row['content'],row['content_format'])) & set(uids)
                row['source']='translation_cache.translated_text'
                yield row
            last=rows[-1]['id']

    async def summaries(self, principal, assets, include_links=False):
        """分组统计当前媒体页；有界返回模块/字段计数，不载入全站人物记录。"""
        result = {a['uid']: {'groups': [], 'protected': False, 'uncertain': False, 'used': False} for a in assets}
        # Forty keys leave room for visibility parameters on D1 as well as SQLite.
        for start in range(0, len(assets), 40):
            chunk = assets[start:start + 40]
            by_key = {a['object_key']: a['uid'] for a in chunk}
            if not chunk:
                continue
            marks = ','.join('?' for _ in chunk)
            for table, field in MEDIA_FIELDS:
                scope, args = self.scope(table, principal)
                extra=(f',min(CASE WHEN {scope} THEN uid END) uid,min(CASE WHEN {scope} THEN substr("{TITLE[table]}",1,240) END) title' if include_links else '')
                rows = await self.sql.query(
                    f'SELECT "{field}" AS key,count(*) AS total,sum(CASE WHEN {scope} THEN 1 ELSE 0 END) AS visible '+extra+' '
                    f'FROM "{table}" WHERE "{field}" IN ({marks}) GROUP BY "{field}"', (*args, *(args*2 if include_links else []), *by_key))
                for row in rows:
                    item = result[by_key[row['key']]]
                    item['used'] = True
                    item['protected'] |= row['visible'] < row['total']
                    if include_links and row['visible']==1:
                        item['direct']={'uid':row['uid'],'title':row['title'],**field_link(principal,table,row['uid'],field)}
                    if row['visible']:
                        item['groups'].append({'source': table + '.' + field,
                                               'label': MODULES[table] + ' · ' + REFERENCE_LABELS.get(field,label(table, field)), 'count': row['visible']})
            body_counts = {}
            async for row in self.body_rows([a['uid'] for a in chunk], principal):
                for uid in row['refs']:
                    item = result[uid]
                    item['used'] = True
                    item['uncertain'] |= row['uncertain']
                    item['protected'] |= not row['visible']
                    if include_links and row['visible']:
                        table,field=row['source'].split('.')
                        item['direct']={'uid':row['uid'],'title':row['title'],**field_link(principal,table,row['uid'],field)}
                    if row['visible']:
                        key=(uid,row['source']);body_counts[key] = body_counts.get(key, 0) + 1
            for (uid,source), count in body_counts.items():
                result[uid]['groups'].append({'source':source, 'label': '新闻动态 · 正文译文' if source.startswith('translation_cache.') else '新闻动态 · 正文', 'count': count})
        if include_links:
            for item in result.values():
                if sum(group['count'] for group in item['groups'])!=1 or item['uncertain']:item.pop('direct',None)
        return result

    async def locations(self, principal, asset, summary, source='', page=1):
        """使用位置按字段分组和每页20条展示，受限来源不返回名称或链接。"""
        groups = summary['groups']
        source = source or (groups[0]['source'] if groups else '')
        group = next((g for g in groups if g['source'] == source), None)
        if source and not group:
            raise Error('此使用位置不存在或无权查看', 404)
        total = group['count'] if group else 0
        try:
            pages = max(1, (total + 19) // 20)
            page = min(pages, max(1, int(page)))
        except (TypeError, ValueError):
            raise Error('页码无效') from None
        rows = []
        if group:
            table, field = source.split('.')
            if source in ('news.content','translation_cache.translated_text'):
                index = 0
                async for row in self.body_rows([asset['uid']], principal):
                    if row['source']!=source or not row['visible'] or asset['uid'] not in row['refs']:
                        continue
                    if (page - 1) * 20 <= index < page * 20:
                        rows.append({'uid': row['uid'], 'title': row['title']})
                    index += 1
                    if index >= page * 20:
                        break
            else:
                scope, args = self.scope(table, principal)
                rows = await self.sql.query(
                    f'SELECT uid,substr("{TITLE[table]}",1,240) AS title FROM "{table}" '
                    f'WHERE "{field}"=? AND {scope} ORDER BY id LIMIT 20 OFFSET ?',
                    (asset['object_key'], *args, (page - 1) * 20))
            for row in rows:
                row.update(field_link(principal,table,row['uid'],field))
                row['field_label']=REFERENCE_LABELS.get(field,row['field_label'])
        return {'source': source, 'rows': rows, 'total': total, 'page': page, 'pages': pages, 'size': 20}

    async def used(self, asset):
        """回收校验覆盖所有可见范围；无法完整解析的正文同样保护媒体。"""
        for table, field in MEDIA_FIELDS:
            if await self.sql.query(f'SELECT 1 FROM "{table}" WHERE "{field}"=? LIMIT 1', (asset['object_key'],)):
                return True
        async for row in self.body_rows([asset['uid']]):
            if asset['uid'] in row['refs']:
                return True
        return False

    async def public_body_reference(self, uid):
        """仅真实、可公开阅读的HTML节点可以授予正文媒体公开访问。"""
        async for row in self.body_rows([uid], public=True):
            if not row['uncertain'] and uid in row['refs']:
                return True
        return False


def reference_guard(keys=(), uids=()):
    """在保存事务内重查媒体仍活跃，避免预检后被回收或并发添加引用。"""
    parts = ["NOT EXISTS(SELECT 1 FROM admin_mutation_guards WHERE uid=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-300 seconds'))"]
    args = [REFERENCE_LOCK]
    for column, values in (('object_key', keys), ('uid', uids)):
        for value in sorted(set(values)):
            parts.append(f"EXISTS(SELECT 1 FROM media_assets WHERE {column}=? AND status='active')")
            args.append(value)
    return ' AND '.join(parts), tuple(args)


async def translated_media(sql,auth,principal,source_ref_key,text,format=None):
    """校验正文译文中可激活的媒体，供手工译文与供应商写入共用事务保护。"""
    if not (source_ref_key or '').startswith('news:') or not source_ref_key.endswith(':content'):
        return []
    if format is None:
        source=await sql.query('SELECT content_format FROM news WHERE uid=?',(source_ref_key[5:-8],))
        format=source[0]['content_format'] if source else 'plain'
    refs=body_references(text or '',format)
    if len(refs)>10:raise Error('正文译文最多引用10个不同文件')
    if refs:auth.require(principal,'media_assets')
    for uid,usage in refs.items():
        asset=await sql.query("SELECT mime_type FROM media_assets WHERE uid=? AND status='active'",(uid,))
        if not asset:
            raise Error('正文译文引用的媒体不存在或已回收')
        if usage=='image':
            from .media_policy import check_type
            check_type('news','body_image',asset[0]['mime_type'])
    return list(refs)
