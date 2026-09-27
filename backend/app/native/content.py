"""Native CRUD, visibility, fixed navigation scopes, category matching and safe exports."""
import json,re,secrets,hashlib
from .filtering import compile_conditions,contains_predicate,search_predicate
from .navigation import parse_path,build_path,in_scope,navigation_guard,FixedScope,scope_conditions
from .catalog import TABLES,EDITORS,MODULES,CONTENT,TITLE,SECRET,Error,now,normalize,fields,deletable

class Content:
    def __init__(self,sql,auth):"""保存构造参数和适配器，供此对象后续操作复用。""";self.sql=sql;self.auth=auth
    def scope(self,table,p=None,public=False,*,fixed_conditions=None):
        """Physical native visibility is checked in SQL; public queries never expose hidden rows."""
        columns=TABLES[table]['columns'];parts=[];args=[]
        if 'visibility' in columns:
            allowed=['public'] if public or not p else p['scopes']
            parts.append('visibility IN ('+','.join('?' for _ in allowed)+')' if allowed else '0');args+=allowed
        if public and 'is_active' in columns:parts.append('is_active=1')
        if public and table=='news':parts.append('(published_at IS NOT NULL AND published_at<=?)');args.append(now())
        if fixed_conditions is not None:
            clause,values=compile_conditions(table,fixed_conditions,public=public);parts.append(clause);args+=values
        return ' AND '.join(parts) or '1',args
    async def navigation(self,key,p):
        """Resolve ASCII navigation ID; mandatory base filters stay in native path server-side."""
        if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,79}',key):raise Error('导航不存在',404)
        rows=await self.sql.query("SELECT * FROM navigation_items WHERE url_name=? AND location='admin-sidebar' AND enabled=1",(key,))
        if len(rows)!=1:raise Error('导航不存在或标识重复',404)
        row=rows[0];table,filters=self.parse_navigation(row['path'] or '')
        self.auth.require(p,table)
        if row['visibility'] not in p['scopes']:raise Error('导航不可见',403)
        return row,table,filters
    def parse_navigation(self,path):
        """Allowlisted fixed equality/contains predicates; repeated or unknown fields are errors."""
        return parse_path(path)
    async def listing(self,table,p=None,query=None,base=None,public=False,projection=None,ceiling_id=None,projection_limits=None,homepage_contacts=False,fixed_conditions=None):
        """Compose authorization AND fixed filters AND user filters, then page using 10/20/50/100."""
        if table not in TABLES:raise Error('功能不存在',404)
        if not public:self.auth.require(p,table)
        query=query or {};columns=TABLES[table]['columns'];where,args=self.scope(table,p,public)
        if fixed_conditions is not None:
            clause,values=compile_conditions(table,fixed_conditions,public=public)
            where+=' AND '+clause;args+=values
        # Internal snapshot bounds keep immutable-log exports stable while newer events arrive.
        if ceiling_id is not None:
            if public or type(ceiling_id) is not int or ceiling_id<0:raise Error('无效读取边界')
            where+=' AND id<=?';args.append(ceiling_id)
        if isinstance(base,FixedScope):
            clause,values=compile_conditions(table,scope_conditions(base));where+=' AND '+clause;args+=values
        for filt in ({} if isinstance(base,FixedScope) else base or {},{k[2:]:v for k,v in query.items() if k.startswith('f.') and v!=''}):
            for key,value in filt.items():
                if public:
                    from .public_data import public_filter
                    clause,values=public_filter(table,key,value);where+=' AND '+clause;args+=values
                else:
                    if key not in columns or key in SECRET:raise Error('未知筛选列')
                    where+=' AND "'+key+'"=?';args.append(value)
        for key,value in query.items():
            if not key.startswith('c.') or not value:continue
            field=key[2:]
            if field not in columns or field in SECRET or columns[field]['kind'] not in ('text','json'):raise Error('未知文本筛选列')
            if public:
                clause,values=compile_conditions(table,[{'field':field,'operator':'contains','value':value}],public=True)
            else:clause,values=contains_predicate(table,field,str(value)[:500])
            where+=' AND '+clause;args+=values
        prefix=''
        term=str(query.get('q','')).strip()[:200]
        if term:
            clause,values=search_predicate(table,term,public=public)
            if public:
                from .public_translation import search
                prefix,translated,extra=search(table,term,self.sql)
                clause='('+clause+' OR '+translated+')';values+=extra
            where+=' AND '+clause;args+=values
        sort=query.get('sort','sort_order' if 'sort_order' in columns else 'id')
        grouped=public and table=='students' and sort=='student_category'
        if not grouped and (sort not in columns or sort in SECRET):raise Error('未知排序列')
        direction='DESC' if query.get('direction')=='desc' else 'ASC'
        try:size=int(query.get('size',20));page=max(1,int(query.get('page',1)))
        except (TypeError,ValueError):raise Error('页码无效') from None
        if size not in (10,20,50,100):raise Error('每页支持10、20、50、100条')
        count=(await self.sql.query(prefix+f'SELECT count(*) n FROM "{table}" WHERE '+where,args))[0]['n'];pages=max(1,(count+size-1)//size);page=min(page,pages)
        if projection is not None:
            if not projection or any(k not in columns or k in SECRET for k in projection):raise Error('预览字段不正确')
            if public:
                from .public_data import PUBLIC_FIELDS
                if any(k not in PUBLIC_FIELDS.get(table,()) for k in projection):raise Error('公开列表字段不正确')
            limits=projection_limits or {}
            if any(k not in projection or type(v) is not int or not 1<=v<=65537 for k,v in limits.items()):raise Error('无效读取长度')
            def projected(k):
                value='substr("'+k+'",1,'+str(limits.get(k,500))+')' if columns[k]['kind'] in ('text','json') else '"'+k+'"'
                if public and k in ('email','phone','office') and 'contact_visibility' in columns and not (homepage_contacts and table=='profiles' and k in ('email','office')):value="CASE WHEN contact_visibility='public' THEN "+value+" ELSE NULL END"
                return value+' AS "'+k+'"'
            selected=','.join(projected(k) for k in projection)
        else:selected=','.join('"'+k+'"' for k in columns if k not in SECRET)
        order=f'"{sort}" {direction},id {direction if public else "ASC"}';order_args=[];rules=[]
        if grouped:
            from .public_students import rules_for,group_expression,annotate
            rules=await rules_for(self);expression,order_args=group_expression(rules)
            # Configured category order is authoritative; direction controls within-group order.
            order=expression+f' ASC,sort_order {direction},id {direction}'
        elif public and table=='students' and sort in ('enrollment_date','graduation_date'):
            order=f'(nullif(trim("{sort}"),\'\') IS NULL) ASC,'+order
        rows=await self.sql.query(prefix+f'SELECT {selected} FROM "{table}" WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?',(*args,*order_args,size,(page-1)*size))
        if grouped:annotate(rows,rules)
        return {'rows':rows,'page':page,'pages':pages,'size':size,'total':count}
    async def get(self,table,uid,p=None,public=False,*,fixed_conditions=None):
        """Read a single authorized record, excluding all password/provider secrets."""
        if table not in TABLES:raise Error('功能不存在',404)
        if not public:self.auth.require(p,table)
        where,args=self.scope(table,p,public)
        if fixed_conditions is not None:
            clause,values=compile_conditions(table,fixed_conditions,public=public);where+=' AND '+clause;args+=values
        selected=','.join('"'+k+'"' for k in TABLES[table]['columns'] if k not in SECRET)
        rows=await self.sql.query(f'SELECT {selected} FROM "{table}" WHERE uid=? AND '+where,(uid,*args))
        if not rows:raise Error('条目不存在或不可见',404)
        return rows[0]
    async def save(self,table,p,values,uid=None,stamp=None,base=None,password=None,permissions=None,secret_values=None,navigation=None,media_links=None,new_uid=None,creation_guard=None):
        """Native writes use updated_at CAS and audit in the same authorization-guarded batch."""
        action='edit' if uid else 'create';self.auth.require(p,table,action)
        if new_uid is not None and (uid or not isinstance(new_uid,str) or not re.fullmatch('[a-f0-9]{32}',new_uid)):raise Error('新增标识无效')
        if table=='operation_logs':raise Error('操作日志只读')
        if table in ('media_assets','translation_cache') and not uid:raise Error('请使用上传或从源内容建立翻译')
        current=await self.get(table,uid,p) if uid else {};patch=normalize(table,values)
        if table in ('auth_users','auth_roles','auth_permissions') and not p['is_system']:raise Error('账号与授权仅系统管理员可以更改',403)
        if secret_values:
            allowed=SECRET & set(TABLES['global_settings']['columns'])
            if table!='global_settings' or set(secret_values)-allowed:raise Error('密钥字段无效')
            for key,value in secret_values.items():
                if not isinstance(value,str) or len(value)>8192:raise Error('密钥格式无效')
                if value:patch[key]=value
        merged=current|patch
        if table=='messages':
            from .messages import validate
            validate(patch,current)
        if table=='global_settings' and any(k in patch for k in ('publication_metadata_provider','publication_metadata_providers','publication_suggestion_cache_seconds')):
            from .metadata_config import parse_settings
            parse_settings(merged)
        if table=='global_settings':
            from .translation_config import parse_settings,PUBLIC_FIELDS,KEY_FIELDS
            if set(patch)&set((*PUBLIC_FIELDS,*KEY_FIELDS.values())):parse_settings(merged)
        if table=='student_category_displays':
            # Saving and preview share keyword limits; enabling an existing rule is validated too.
            from .student_categories import parse_keywords
            parse_keywords(merged.get('keywords'))
        if 'visibility' in patch and patch['visibility'] not in p['scopes']:raise Error('不能设置超出角色范围的可见性',403)
        if current and not in_scope(table,current,base):raise Error('条目不在固定筛选范围内',403)
        if not in_scope(table,merged,base):raise Error('保存内容必须满足导航的固定筛选条件')
        media_keys=[];media_uids=[]
        for key,spec in TABLES[table]['columns'].items():
            reference=spec.get('references',{}).get('table')
            if key in patch and reference and not p['permissions'].get(reference,{}).get('can_view'):
                if patch[key]!=current.get(key):raise Error('没有关联功能的进入权限，无法修改此项',403,'access_denied')
                continue
            if key in patch and spec.get('references') and patch[key]:
                target=spec['references']['table'];column=spec['references']['column']
                if target=='media_assets':
                    if patch[key]!=current.get(key):self.auth.require(p,'media_assets')
                    asset=await self.sql.query('SELECT mime_type FROM media_assets WHERE object_key=? AND status=\'active\'',(patch[key],))
                    if not asset and media_links and patch[key] in media_links.pending:asset=[media_links.pending[patch[key]]]
                    if not asset:raise Error('媒体不存在或已在回收站')
                    from .media_policy import check_type
                    check_type(table,key,asset[0]['mime_type'])
                    media_keys.append(patch[key])
                elif target in CONTENT:
                    await self.get(target,patch[key],p)
        if table=='news' and merged.get('content_format') in ('html','markdown') and ('content' in patch or 'content_format' in patch):
            from backend.app.domain.richtext import render_body
            # Switching format also validates the retained body, even without a content patch.
            rendered,refs=render_body(merged.get('content') or '',merged['content_format'])
            if merged['content_format']=='html':patch['content']=rendered
            media_uids=list(refs)
            if refs:
                self.auth.require(p,'media_assets')
                for media_uid,usage in refs.items():
                    asset=await self.sql.query("SELECT mime_type FROM media_assets WHERE uid=? AND status='active'",(media_uid,))
                    if not asset:raise Error('正文引用的媒体不存在或已回收')
                    if usage=='image':
                        from .media_policy import check_type
                        check_type('news','body_image',asset[0]['mime_type'])
        if table=='news' and uid and merged.get('content_format') in ('html','markdown'):
            # Returning to an earlier source text can reactivate a cached translation.
            from .media_references import translated_media
            digest=hashlib.sha256((patch.get('content',merged.get('content')) or '').encode()).hexdigest()
            source_ref='news:'+uid+':content'
            cached=await self.sql.query("SELECT translated_text FROM translation_cache WHERE source_ref_key=? AND source_hash=? AND target_lang='en' AND is_current=1 AND status='success' LIMIT 1",(source_ref,digest))
            if cached:media_uids+=await translated_media(self.sql,self.auth,p,source_ref,cached[0]['translated_text'],merged['content_format'])
        if table=='navigation_items' and merged.get('location')=='admin-sidebar':
            target,fixed=self.parse_navigation(merged.get('path') or '')
            patch['path']=build_path(target,scope_conditions(fixed))
            if not merged.get('url_name'):raise Error('后台导航需要ASCII标识')
            if await self.sql.query('SELECT 1 FROM navigation_items WHERE url_name=? AND uid<>?',(merged['url_name'],uid or '')):raise Error('导航标识已存在')
        if table=='navigation_items':
            from .navigation import has_public_conditions,parse_public_path,build_public_path,PUBLIC_LOCATIONS
            if has_public_conditions(merged.get('path')):
                if merged.get('location') not in PUBLIC_LOCATIONS or merged.get('kind') not in ('route','button',None,'') or merged.get('fragment'):
                    raise Error('前台固定筛选仅支持顶部、首页或页脚的站内页面/按钮，不支持外链或锚点')
                target,conditions,lang=parse_public_path(merged['path'])
                patch['path']=build_public_path(target,conditions,lang)
                if not merged.get('url_name'):raise Error('前台固定筛选需要ASCII入口标识')
                if await self.sql.query('SELECT 1 FROM navigation_items WHERE url_name=? AND uid<>?',(merged['url_name'],uid or '')):raise Error('导航标识已存在')
        active_role=None
        if table=='auth_users':
            if not uid or ('role_uid' in patch and patch['role_uid']!=current.get('role_uid')) or (patch.get('status')=='active' and current.get('status')!='active'):
                active_role=merged.get('role_uid')
                if not active_role:raise Error('请选择所属角色')
                await self.get('auth_roles',active_role,p)
                if not await self.sql.query('SELECT 1 FROM auth_roles WHERE uid=? AND is_active=1',(active_role,)):raise Error('所选角色已停用，请选择启用的角色',409)
            if password:patch['password_hash']=await self.auth.passwords.hash(password)
            elif not uid:raise Error('新账号需要密码')
            if uid==p['uid'] and (patch.get('status','active')!='active' or patch.get('role_uid',p['role_uid'])!=p['role_uid']):raise Error('不能停用当前账号或移除自身管理角色')
        if table=='auth_roles' and current.get('is_system'):
            if patch.get('is_active',1)!=1:raise Error('不能停用系统管理角色')
            if permissions is not None:raise Error('系统管理员保留完整权限')
        if table=='translation_cache':
            if 'translated_text' in patch:
                patch.update(is_manual=1,is_current=int(bool(patch['translated_text'])),status='success' if patch['translated_text'] else 'pending',error_message=None)
                # Explicit manual saves may restore a previously disabled cache without losing batch metadata.
                from .translation_batch import metadata
                refs,_=metadata(current);refs[0].pop('_inactive',None)
                # Explicit review may establish a legacy body's format, only for an unchanged live source.
                from .translation_sources import split_reference,source_format
                try:
                    st,su,sf=split_reference(current.get('source_ref_key'));sr=await self.get(st,su,p)
                    if sr.get(sf)==merged.get('source_text'):refs[0]['_format']=source_format(st,sr,sf)
                except Error:pass
                patch['source_refs']=json.dumps(refs,ensure_ascii=False)
            text=merged.get('source_text','');patch['source_hash']=hashlib.sha256(text.encode()).hexdigest()
            patch['source_ref_key']=current.get('source_ref_key') or 'manual:'+secrets.token_hex(16)
            from .media_references import translated_media
            media_uids+=await translated_media(self.sql,self.auth,p,patch['source_ref_key'],merged.get('translated_text'))
        uid=uid or new_uid or secrets.token_hex(16);at=now(after=current.get('updated_at'))
        condition=f'EXISTS(SELECT 1 FROM "{table}" WHERE uid=? AND updated_at=?)' if current else '1'
        condition_args=(uid,stamp) if current else ()
        if active_role:
            condition+=' AND EXISTS(SELECT 1 FROM auth_roles WHERE uid=? AND is_active=1)';condition_args+=(active_role,)
        if creation_guard and not current:condition+=' AND ('+creation_guard[0]+')';condition_args+=creation_guard[1]
        nav_condition,nav_args=navigation_guard(navigation);condition+=' AND '+nav_condition;condition_args+=nav_args
        if table=='messages':
            condition+=" AND EXISTS(SELECT 1 FROM auth_permissions WHERE role_uid=? AND module='messages' AND can_view=1)"
            condition_args+=(p['role_uid'],)
        if table=='media_assets':
            from .media_locks import pending_guard
            pending_condition,pending_args=pending_guard(uid);condition+=' AND '+pending_condition;condition_args+=pending_args
        if media_keys or media_uids or table in ('news','translation_cache'):
            from .media_references import reference_guard
            media_condition,media_args=reference_guard(media_keys,media_uids)
            condition+=' AND '+media_condition;condition_args+=media_args
        # Enforce navigation-name uniqueness inside the mutation batch without adding a schema index.
        if table=='navigation_items' and (merged.get('location')=='admin-sidebar' or has_public_conditions(merged.get('path'))):
            condition+=' AND NOT EXISTS(SELECT 1 FROM navigation_items WHERE url_name=? AND uid<>?)';condition_args+=(merged['url_name'],uid)
        guard_id,guard=self.auth.guard(p,table,action,condition,condition_args)
        patch['updated_at']=at
        if current:
            sql=f'UPDATE "{table}" SET '+','.join('"'+k+'"=?' for k in patch)+' WHERE uid=? RETURNING uid'
            mutation=(sql,(*patch.values(),uid))
        else:
            patch={'uid':uid,**patch};keys=','.join('"'+k+'"' for k in patch)
            mutation=(f'INSERT INTO "{table}" ({keys}) VALUES ('+','.join('?' for _ in patch)+') RETURNING uid',tuple(patch.values()))
        statements=[guard,mutation]
        if table=='auth_users' and current and any(k in patch and patch[k]!=current.get(k) for k in ('password_hash','role_uid','status')):
            statements.append(("UPDATE auth_sessions SET revoked_at=?,revoke_reason='security_policy' WHERE user_uid=? AND revoked_at IS NULL",(at,uid)))
        if table=='translation_cache' and patch.get('is_current') and patch.get('status',current.get('status'))=='success':
            statements.insert(1,('UPDATE translation_cache SET is_current=0,updated_at=? WHERE source_ref_key=? AND target_lang=? AND uid<>? AND is_current=1',(at,patch.get('source_ref_key',current.get('source_ref_key')),patch.get('target_lang',current.get('target_lang')),uid)))
        if table=='auth_roles' and permissions is not None:
            from .permissions import validate
            validate(permissions)
            statements.append(('DELETE FROM auth_permissions WHERE role_uid=?',(uid,)))
            for module,actions in permissions.items():
                if not isinstance(actions,list) or any(not isinstance(a,str) for a in actions) or set(actions)-{'view','create','edit','delete','export'}:raise Error('权限操作无效')
                statements.append(('INSERT INTO auth_permissions(uid,role_uid,module,can_view,can_create,can_edit,can_delete,can_export) VALUES (?,?,?,?,?,?,?,?)',(secrets.token_hex(16),uid,module,*[int(a in actions) for a in ('view','create','edit','delete','export')])))
        detail={'fields':{'status':{'before':current.get('status'),'after':patch['status']}}} if table=='messages' and 'status' in patch and patch['status']!=current.get('status') else None
        statements += [self.audit(p,table,action,uid,detail),('DELETE FROM admin_mutation_guards WHERE uid=?',(guard_id,))]
        # New external registrations and content references commit together or roll back together.
        if media_links:statements=media_links.statements()+statements
        await self.sql.batch(statements);return uid
    def audit(self,p,table,action,uid,detail=None):
        """Audit metadata only; never serialize submitted passwords or provider credentials."""
        values=(secrets.token_hex(16),p['uid'],p['display_name'] or p['username'],action,table,uid,MODULES.get(table,table)+' '+action,'success')
        if detail is not None:
            # Only server-constructed metadata is accepted here; never log submitted message bodies.
            return ('INSERT INTO operation_logs(uid,actor_uid,actor_name,action,module,target_uid,summary,status,detail_json) VALUES (?,?,?,?,?,?,?,?,?)',(*values,json.dumps(detail,ensure_ascii=False)))
        return ('INSERT INTO operation_logs(uid,actor_uid,actor_name,action,module,target_uid,summary,status) VALUES (?,?,?,?,?,?,?,?)',values)
    async def delete(self,table,p,uid,stamp,base=None,navigation=None):
        """Keep shared authorization/CAS and add atomic account-specific dependency guards."""
        self.auth.require(p,table,'delete');current=await self.get(table,uid,p)
        if not deletable(table) or table in ('media_assets','messages'):raise Error('此类条目不能直接删除；留言请改为已归档')
        if not in_scope(table,current,base):raise Error('条目不在固定筛选范围内',403)
        if current['updated_at']!=stamp:raise Error('条目已变化，请刷新后重试',409)
        extra,args,cleanup='1',(),[]
        if table in ('auth_users','auth_roles'):
            from .accounts import deletion_plan
            extra,args,cleanup=await deletion_plan(self.sql,p,table,current)
        nav_condition,nav_args=navigation_guard(navigation)
        scope,scope_args=self.scope(table,p)
        gid,guard=self.auth.guard(p,table,'delete',f'EXISTS(SELECT 1 FROM "{table}" WHERE uid=? AND updated_at=? AND '+scope+') AND '+nav_condition+' AND ('+extra+')',(uid,stamp,*scope_args,*nav_args,*args))
        await self.sql.batch([guard,*cleanup,(f'DELETE FROM "{table}" WHERE uid=?',(uid,)),self.audit(p,table,'delete',uid),('DELETE FROM admin_mutation_guards WHERE uid=?',(gid,))])
    async def matches(self,p,category,query=None):
        """按共享关键词规则返回授权学生的匹配总数和当前页，不写入分类关系。"""
        from .student_categories import match_page
        return await match_page(self,p,category.get('keywords'),query)
