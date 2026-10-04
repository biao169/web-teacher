# 功能函数与源码索引

本索引列出维护网站时的主要入口，不枚举私有小工具。签名直接按当前源码核对；路径相对项目根目录。类方法签名中的 `self` 由实例提供，异步函数必须 `await`。

## 调用约定

- `r`：路由提供的资源对象，包含 `sql`、当前主体 `p`、`auth`、存储与服务；不要从浏览器传入伪造资源。
- `p`：认证主体与权限；`uid` 为记录/任务标识，`stamp` 为读取时版本戳。更新冲突应重新读取。
- `sql.query()` 用于参数化查询，`sql.batch()` 执行原子批次；优先调用业务服务保留权限/引用检查。
- `query` / `options` 是经过入口验证的筛选与分页参数；不要把表名、字段名、路径直接拼接自用户输入。
- 返回值的精确字段以函数实现和对应测试为准；下述示例均为应用内部调用片段。

## 应用、配置与内容

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [backend/app/native/runtime.py](../backend/app/native/runtime.py)<br/>`local(settings=None)` | 同步；从配置构造本地资源对象；测试或本地启动使用，不在每个请求中反复创建。 |
| [backend/app/native/web.py](../backend/app/native/web.py)<br/>`create_app(factory, static_root=None)` | 同步；传入异步资源工厂及项目根目录，返回FastAPI应用。 |
| [backend/app/native/web.py](../backend/app/native/web.py)<br/>`payload(request, limit=500000)` | `await`；有界解析请求正文；超过limit或内容无效时拒绝。 |
| [backend/app/native/content.py](../backend/app/native/content.py)<br/>`Content.listing(self, table, p=None, query=None, base=None, public=False, projection=None, ceiling_id=None, projection_limits=None, homepage_contacts=False, fixed_conditions=None)` | `await`；按主体、查询和固定范围分页读取；公开访问必须走公开投影。 |
| [backend/app/native/content.py](../backend/app/native/content.py)<br/>`Content.get(self, table, uid, p=None, public=False, *, fixed_conditions=None)` | `await`；按UID读取一条并校验范围；public标识决定公开读取约束。 |
| [backend/app/native/content.py](../backend/app/native/content.py)<br/>`Content.save(self, table, p, values, uid=None, stamp=None, base=None, password=None, permissions=None, secret_values=None, navigation=None, media_links=None, new_uid=None, creation_guard=None)` | `await`；创建或更新；更新传uid与stamp，values只能包含该表允许的字段。 |
| [backend/app/native/content.py](../backend/app/native/content.py)<br/>`Content.delete(self, table, p, uid, stamp, base=None, navigation=None)` | `await`；携带记录stamp删除；执行权限、引用与保护检查。 |
| [backend/app/native/content.py](../backend/app/native/content.py)<br/>`Content.audit(self, p, table, action, uid, detail=None)` | 同步；记录已授权操作的审计信息，不把密钥或完整正文塞入detail。 |
| [backend/app/native/student_categories.py](../backend/app/native/student_categories.py)<br/>`match_page(content, principal, keywords, query=None)` | `await`；按分类关键词和查询分页预览学生匹配结果。 |

## 前台、导航与查询

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [backend/app/native/public_home.py](../backend/app/native/public_home.py)<br/>`homepage_rows(r, site)` | `await`；按网站配置获取首页各模块数据。 |
| [backend/app/native/public_data.py](../backend/app/native/public_data.py)<br/>`public_listing(r, table, query, site=None, home=False, profile_overview=False, *, fixed_conditions=None)` | `await`；根据table/query/site读取公开列表；固定筛选在服务端叠加。 |
| [backend/app/native/public_data.py](../backend/app/native/public_data.py)<br/>`project_private_allowed(principal)` | 同步；判断项目私密字段是否允许返回，不应只靠前端隐藏。 |
| [backend/app/native/public_data.py](../backend/app/native/public_data.py)<br/>`people_facets(content, table, *, fixed_conditions=None, lang='zh', query=None)` | `await`；生成公开筛选候选及译名；传入同一固定范围。 |
| [backend/app/native/public_translation.py](../backend/app/native/public_translation.py)<br/>`search(table, term, sql)` | 同步；构造语言搜索映射逻辑，配合公共查询使用。 |
| [backend/app/native/navigation.py](../backend/app/native/navigation.py)<br/>`build_public_path(table, conditions, lang='en')` | 同步；由模块、固定条件和语言生成前台路径。 |
| [backend/app/native/navigation.py](../backend/app/native/navigation.py)<br/>`parse_public_path(path)` | 同步；解析已有前台固定筛选路径；非法条件由原验证处理。 |
| [backend/app/native/navigation.py](../backend/app/native/navigation.py)<br/>`preview(content, principal, data)` | `await`；后台导航编辑器预览目标范围，沿用主体权限。 |
| [backend/app/native/public_auth.py](../backend/app/native/public_auth.py)<br/>`safe_next(value)` | 同步；验证登录后的返回地址，避免任意外部跳转。 |

## 账号与权限

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [auth.py](../backend/app/native/auth.py)<br/>`Auth.bootstrap(self, username, password)` | `await`；仅空站初始化管理员；按部署初始化流程调用。 |
| [auth.py](../backend/app/native/auth.py)<br/>`Auth.login(self, username, password, network)` | `await`；核验账号密码与网络限流，成功返回登录令牌。 |
| [auth.py](../backend/app/native/auth.py)<br/>`Auth.principal(self, token)` | `await`；从会话令牌解析主体，不能用浏览器自报的角色替代。 |
| [auth.py](../backend/app/native/auth.py)<br/>`Auth.require(self, p, module, action='view')` | 同步；检查模块动作权限，未获授权时抛出领域错误。 |
| [auth.py](../backend/app/native/auth.py)<br/>`Auth.guard(self, p, module, action, condition='1', args=())` | 同步；为后续数据库批次生成权限/状态守卫，不单独跳过守卫写表。 |
| [auth.py](../backend/app/native/auth.py)<br/>`Auth.logout(self, p)` | `await`；撤销当前主体会话。 |
| [auth.py](../backend/app/native/auth.py)<br/>`Auth.password(self, p, current, new)` | `await`；验证现密码后更新密码，沿用服务端会话策略。 |

## 媒体、论文与翻译

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [backend/app/native/media.py](../backend/app/native/media.py)<br/>`Media.upload(self, p, filename, request, allowed_mimes=None, metadata=None, validate_bytes=None, new_uid=None, creation_guard=None)` | `await`；从HTTP请求有界上传，验证文件类型/正文并保存媒体记录。 |
| [backend/app/native/media.py](../backend/app/native/media.py)<br/>`Media.readable(self, uid, p=None)` | `await`；取得允许读取的媒体，不绕过可见性检查。 |
| [backend/app/native/media.py](../backend/app/native/media.py)<br/>`Media.status(self, p, uid, stamp, status, base=None, navigation=None)` | `await`；更新媒体状态；需版本戳和原范围。 |
| [backend/app/native/suggestions.py](../backend/app/native/suggestions.py)<br/>`suggestions(content, principal, data, base=None)` | `await`；依据模块和字段请求现有值/辅助建议。 |
| [backend/app/native/metadata_config.py](../backend/app/native/metadata_config.py)<br/>`load_settings(r)` | `await`；读取论文元数据服务配置，不把服务凭据返回公共页面。 |
| [backend/app/native/translation_config.py](../backend/app/native/translation_config.py)<br/>`load_settings(r)` | `await`；读取并解析翻译服务配置。 |
| [backend/app/native/translation_groups.py](../backend/app/native/translation_groups.py)<br/>`TranslationGroups.listing(self)` | `await`；查询译文分组。 |
| [backend/app/native/translation_groups.py](../backend/app/native/translation_groups.py)<br/>`TranslationGroups.members(self, uid, page=1, size=10)` | `await`；分页读取分组成员，避免一次展开所有来源。 |
| [backend/app/native/translation_groups.py](../backend/app/native/translation_groups.py)<br/>`TranslationGroups.choose(self, uid, donor_uid, donor_stamp, target_uid, target_stamp, nav_guard=None)` | `await`；按供体/目标UID与双方版本戳选择共享译文。 |

## 导出与恢复

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [backend/app/native/data_tools.py](../backend/app/native/data_tools.py)<br/>`authorize(r, action='view', tables=())` | 同步；校验数据工具动作和模块范围；在导出/恢复入口首先调用。 |
| [backend/app/native/data_tools.py](../backend/app/native/data_tools.py)<br/>`export(r, tables=None, sensitive=False)` | `await`；导出选定表；敏感模式必须有相应权限。 |
| [backend/app/native/data_tools.py](../backend/app/native/data_tools.py)<br/>`csv_export(value, table)` | 同步；将已授权导出数据转换为指定表CSV。 |
| [backend/app/native/data_restore.py](../backend/app/native/data_restore.py)<br/>`preflight(r, document, tables, mode)` | `await`；恢复前验证文档、表范围和合并模式。 |
| [backend/app/native/data_restore.py](../backend/app/native/data_restore.py)<br/>`stage(r, token, index, request)` | `await`；按恢复票据与序号暂存请求内容。 |
| [backend/app/native/data_restore.py](../backend/app/native/data_restore.py)<br/>`execute(r, token, document, tables, mode, confirmation)` | `await`；携带有效票据和确认执行恢复，不能省略预检。 |
| [backend/app/native/data_restore.py](../backend/app/native/data_restore.py)<br/>`discard(r, token)` | `await`；丢弃对应恢复暂存，不删除任意媒体目录。 |

## 文件互传

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [transfer/backend/integration.py](../transfer/backend/integration.py)<br/>`install(app, resources, root)` | 同步；向主应用挂载快传路由、管理工作区和维护生命周期。 |
| [transfer/backend/native.py](../transfer/backend/native.py)<br/>`Transfers.create(self, p, name, size, folder=None)` | `await`；创建任务；size为文件字节量，folder为文件夹参数。 |
| [transfer/backend/native.py](../transfer/backend/native.py)<br/>`Transfers.chunk(self, p, id, offset, data)` | `await`；提交id对应的offset分片，确认后再推进客户端偏移。 |
| [transfer/backend/native.py](../transfer/backend/native.py)<br/>`Transfers.control(self, p, id, action, expected, stamp=None)` | `await`；带预期状态操作任务，防止过期控制请求覆盖。 |
| [transfer/backend/resources.py](../transfer/backend/resources.py)<br/>`read_chunk(request)` | `await`；读取最多1MiB块，校验声明长度、实际长度和超时。 |
| [transfer/backend/lan.py](../transfer/backend/lan.py)<br/>`Rooms.act(self, r, op, data)` | `await`；在线直连协调动作，资源与数据来自受保护路由。 |
| [transfer/backend/relay.py](../transfer/backend/relay.py)<br/>`Relay.act(self, r, op, data, body=None)` | `await`；在线中继控制/分片；body只在对应动作提供。 |
| [transfer/backend/codes.py](../transfer/backend/codes.py)<br/>`Codes.issue(self, r, data)` | `await`；创建接收码，检查调用者对目标的控制权。 |
| [transfer/backend/codes.py](../transfer/backend/codes.py)<br/>`Codes.resolve(self, r, data)` | `await`；验证接收码、期限和接收权限，返回接收能力。 |
| [transfer/backend/codes.py](../transfer/backend/codes.py)<br/>`Codes.revoke(self, r, data)` | `await`；撤销接收码，不能用接收权限撤销发送端任务。 |
| [transfer/backend/folders.py](../transfer/backend/folders.py)<br/>`Folders.submit(self, id, data)` | `await`；向未封存文件夹分批提交条目。 |
| [transfer/backend/folders.py](../transfer/backend/folders.py)<br/>`Folders.seal(self, id)` | `await`；完成目录清单校验并封存。 |
| [transfer/backend/settings.py](../transfer/backend/settings.py)<br/>`edit(settings, data)` | 同步；返回验证后的配置副本；持久化仍由管理路由完成。 |
| [transfer/backend/offline.py](../transfer/backend/offline.py)<br/>`Maintenance.tick(self, batches=32)` | `await`；推进到期快传清理，限制批次数。 |

## 日志、缓存与维护

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [backend/app/native/public_cache.py](../backend/app/native/public_cache.py)<br/>`PublicReadCache.get(self, key, revision)` | 同步；按查询键与数据修订号读取缓存；不命中返回None。 |
| [backend/app/native/public_cache.py](../backend/app/native/public_cache.py)<br/>`PublicReadCache.put(self, key, revision, rows, ttl)` | 同步；提交有界行集与TTL；过大/无修订号时不缓存。 |
| [backend/app/native/public_cache.py](../backend/app/native/public_cache.py)<br/>`PublicReadCache.invalidate(self)` | 同步；清空本进程缓存与旧修订号。 |
| [backend/app/native/public_cache.py](../backend/app/native/public_cache.py)<br/>`PublicSQL.query(self, statement, args=())` | `await`；只在匿名公开读取边界替代sql.query。 |
| [backend/app/resource_budget.py](../backend/app/resource_budget.py)<br/>`CacheBudget.limits(self)` | 同步；返回动态缓存与模板预算，不等于整个进程内存限制。 |
| [backend/maintenance/policy.py](../backend/maintenance/policy.py)<br/>`load(sql)` | `await`；返回策略版本、值和原始持久化值。 |
| [backend/maintenance/policy.py](../backend/maintenance/policy.py)<br/>`validate(value)` | 同步；同步验证完整策略字段及范围。 |
| [backend/maintenance/runtime.py](../backend/maintenance/runtime.py)<br/>`Maintenance.tick(self, apply=False, batches=1)` | `await`；默认仅预览；apply=True才删除，batches限制1～100。 |
| [backend/maintenance/history.py](../backend/maintenance/history.py)<br/>`History.tick(self, apply=False, after='')` | `await`；按游标处理历史，返回结果供下一轮使用。 |
| [backend/maintenance/monitor.py](../backend/maintenance/monitor.py)<br/>`Monitor.snapshot(self, sql)` | 同步；读取资源和运行状态快照。 |
| [deploy/shared/service.py](../deploy/shared/service.py)<br/>`main(argv=None)` | 同步；配置日志后启动本地主站；通常由脚本/服务调用。 |

## 异地网站同步

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [backend/app/native/site_sync_tasks.py](../backend/app/native/site_sync_tasks.py)<br/>`start(r, direction, scopes, *, previous=None, lightweight=False, prepare_parent=None, requested=None, latest_only=False)` | `await`；创建预览；direction为pull或push，scopes为所选业务表。 |
| [backend/app/native/site_sync_tasks.py](../backend/app/native/site_sync_tasks.py)<br/>`advance(r, uid)` | `await`；推进一次预览步骤，按返回status判断是否就绪。 |
| [backend/app/native/site_sync_tasks.py](../backend/app/native/site_sync_tasks.py)<br/>`choose(r, uid, ids)` | `await`；保存所选候选ID及依赖，尚不执行写入。 |
| [backend/app/native/site_sync_preview.py](../backend/app/native/site_sync_preview.py)<br/>`prepare(r, uid)` | `await`；由已选摘要创建/取得准备子任务。 |
| [backend/app/native/site_sync_apply.py](../backend/app/native/site_sync_apply.py)<br/>`begin(r, uid, confirmation, *, approval=False)` | `await`；使用UI确认文本或审批上下文开始执行。 |
| [backend/app/native/site_sync_apply.py](../backend/app/native/site_sync_apply.py)<br/>`tick(r, uid, cancel=False)` | `await`；推进一小步；cancel=True转入取消/清理，不回滚已提交记录。 |
| [backend/app/native/site_sync_tasks.py](../backend/app/native/site_sync_tasks.py)<br/>`resume(r, uid)` | `await`；保留检查点继续原任务，仍遵守等待门控。 |
| [backend/app/native/site_sync_tasks.py](../backend/app/native/site_sync_tasks.py)<br/>`restart(r, uid)` | `await`；新建同范围预览；不自动沿用旧批准。 |
| [backend/app/native/site_sync_schedule.py](../backend/app/native/site_sync_schedule.py)<br/>`save(r, data)` | `await`；保存后台授权与策略，需要当前revision和明确确认。 |
| [backend/app/native/site_sync_schedule.py](../backend/app/native/site_sync_schedule.py)<br/>`tick(base, *, prune_history=True)` | `await`；根据保存授权推进有限后台工作。 |
| [backend/app/native/site_sync_status.py](../backend/app/native/site_sync_status.py)<br/>`read(r, options=None)` | `await`；只读任务摘要；options支持active与after游标。 |
| [backend/app/native/site_sync_proposals.py](../backend/app/native/site_sync_proposals.py)<br/>`send(r, uid)` | `await`；发送待批准提案，不向对端直接写业务表。 |
| [backend/app/native/site_sync_proposals.py](../backend/app/native/site_sync_proposals.py)<br/>`review(r, request_id)` | `await`；在接收站重新读取待批准提案的差异。 |
| [backend/app/native/site_sync_proposals.py](../backend/app/native/site_sync_proposals.py)<br/>`reject(r, request_id)` | `await`；接收站拒绝指定提案。 |
| [backend/app/native/site_sync_history.py](../backend/app/native/site_sync_history.py)<br/>`prune(sql, uid=None, *, batch=BATCH)` | `await`；有限批次清理符合规则的历史任务。 |

## 部署与打包

| 文件与函数签名 | 调用方法与作用 |
| --- | --- |
| [deploy/vps/release.py](../deploy/vps/release.py)<br/>`render(output, base, teacher_domain, transfer_domain, python, port=8003, service_name='teacher-site.service', service_user='teacher-site', config_dir='/etc/teacher-site')` | 同步；生成实例配置与服务定义；service_name/user/config_dir用于多实例隔离。 |
| [deploy/vps/release.py](../deploy/vps/release.py)<br/>`write_manifest(root, refresh=False)` | 同步；生成发布文件清单；已存在时需refresh=True。 |
| [deploy/vps/release.py](../deploy/vps/release.py)<br/>`verify(root)` | 同步；严格校验清单；与部署CLI默认跳过校验的行为区分。 |
| [deploy/shared/package_release.py](../deploy/shared/package_release.py)<br/>`archive(folder, target)` | 同步；校验并创建一个归档，目标文件必须不存在。 |

## 内部调用示例

```python
# 已由资源工厂取得r，并通过对应入口的权限检查
from backend.app.native.site_sync_status import read
page = await read(r, {"active": True})
if page["next"]:
    following = await read(r, {"active": True, "after": page["next"]})

# 本地清理先预览；不会自动删除
from backend.maintenance.runtime import Maintenance
report = await Maintenance(r.sql, r.settings).tick(apply=False, batches=1)
```

创建、写入、恢复、同步执行等动作应通过原页面确认流程调用，不能把上面的只读例子替换成未经授权的写操作。

## 前端入口与修改位置

| 功能 | 源码位置 | 使用方式 |
| --- | --- | --- |
| 全站字体/颜色 | [public-theme.css](../frontend/shared/static/css/public-theme.css) | 调整公共变量，保持各页面继承 |
| 社交平台链接和数字 | [person-links.html](../frontend/public/templates/person-links.html) | Jinja共享组件，使用row/table/lang；不在浏览器另取私密字段 |
| 教师卡片样式 | [faculty.css](../frontend/public/static/css/faculty.css) | 调整现有主题变量对应布局 |
| 同步任务交互 | [native-site-sync.js](../frontend/admin/static/js/native-site-sync.js) | 模块内处理预览、确认、分页与状态刷新 |
| 同步页面结构 | [native-site-sync.html](../frontend/admin/templates/native-site-sync.html) | DOM标识需与JS一致 |
| 文件互传界面 | [transfer/frontend/native](../transfer/frontend/native/) | 与transfer/backend路由对应；不要另建公开管理接口 |

## 测试与相关设计

测试方法见 [测试说明](../tests/README.md)。功能行为见 [功能手册](FEATURES.md)；详细约束见 [文件互传](reference/file-transfer.md)、[日志缓存](reference/log-cache.md)、[异地同步](reference/site-sync.md)。

## 域名策略基础接口

`backend/app/security/origins.py` 仅依赖 Python 标准库，供 Worker 与本地服务共用。

| 函数 | 用法与返回值 |
| --- | --- |
| `normalize_origin(value, *, root_slash=True)` | 规范化一个完整 HTTP(S) 来源；统一域名大小写、IDNA、IPv6、默认端口。配置允许根目录尾斜杠；请求 Origin 不允许。非法输入抛出 ValueError。 |
| `parse_origins(primary, allowed=None)` | allowed 可为逗号分隔字符串或列表/元组；返回去重元组，主来源始终在首位。禁止通配符、路径和混合协议，HTTP 仅允许本机开发地址。 |
| `OriginPolicy(primary, allowed=())` | 创建不可变策略；allowed 为规范化后的全部允许来源。 |
| `OriginPolicy.request_origin(request)` | 根据唯一 Host 头匹配白名单，返回配置中的公开来源；不读取 Forwarded/X-Forwarded-*。反向代理须保留 Host。 |
| `OriginPolicy.require_same_origin(request)` | 校验 Origin 与本次 Host 对应来源一致，检查 Sec-Fetch-Site；返回当前来源。白名单中的另一来源也不允许跨来源提交。 |
| `OriginPolicy.is_site_url(value)` | 判断绝对 URL 是否属于配置的网站来源；不接受带凭据的 URL。不能替代权限或 CSRF 校验。 |
| `AuthConfig.from_origin(origin, allowed_origins=())` | 位于 backend/app/security/http.py；构造 HTTP 适配配置，origin 保持主来源。request_origin、same_origin、is_site_url 复用以上策略，Host 错误映射为 400，来源错误映射为 403。 |

内部调用示例：

```python
config = AuthConfig.from_origin(
    'https://teacher.example.org',
    'https://lab.example.org,https://teacher.example.net',
)
current_origin = config.same_origin(request)
```

`AuthConfig.from_env()` 读取主来源及 `TEACHER_ALLOWED_ORIGINS`，Worker 的 `resource_factory()` 读取对应绑定变量。未设置白名单时兼容单域名配置。Cookie 保持 host-only，域名间不共享 Cookie。

接入位置：

- `backend/app/native/web.py`：请求中间件通过 `config.valid_host(request)` 校验白名单；公共留言与共用 `csrf(request, r, data)` 调用 `config.same_origin(request)`，随后校验表单或会话令牌。该 CSRF 入口供后台保存、媒体上传、退出和密码操作复用。
- `backend/app/native/public_auth.py`：登录和注册调用同一来源校验；Cookie 绑定当前域名，返回地址采用 `safe_next()` 校验后的相对路径。
- `backend/app/native/media_links.py`：`MediaLinks.resolve()` 调用 `config.is_site_url(value)` 识别所有已配置域名，再按媒体 UID 查找同一资源；权限、类型、状态和版本戳校验继续执行，不下载本站链接作为外链。
- `deploy/cloudflare/runtime/setup.py`：首次管理员初始化使用相同来源规则，并继续要求初始化密钥、空账号库及初始化状态校验。
- `backend/app/native/public_seo.py` 与页面 SEO 字段继续使用 `config.origin` 作为主来源；禁止按请求修改共享配置。

### 文件互传域名接口

| 位置与函数 | 用法 |
| --- | --- |
| `transfer/backend/origins.py`：`check_origin(request, runtime)` | 调用主站 `runtime.config.same_origin()`；旧独立适配器无 config 时从其单个 origin 构造策略。返回校验后的当前来源，不替代身份/CSRF/权限校验。 |
| `transfer/backend/integration.py`：`install(app, resources, root)` | 本地传输资源保留不可变主站 config，origin/teacher_origin 取本次 Host 对应来源；模板得到 transfer_origins。 |
| `deploy/cloudflare/runtime/transfer.py`：`install(app, factory, templates, catalog, stores=None)` | Worker 使用同样来源策略，沿用共享协调器和 SessionSQL。 |
| `transfer/frontend/native/portal-core.js`：`shareURL(text, origin)` | 接受当前域名或服务端模板输出的白名单域名，严格验证分享路径/令牌、拒绝凭据和查询参数；返回转换为当前来源的完整分享链接。 |

`native.py` 的 `check()` 同时校验来源、身份与 CSRF；LAN、relay、codes、receivers 已登录请求复用它，匿名请求只先做来源校验，再由各服务校验接收能力、权限和额度。旧独立 `/bridge` 保留原有指定教师站来源与签名票据校验，不作为多域名登录入口。

### 部署域名配置

- `deploy/cloudflare/domains.py`：`settings(env, name)` 校验主来源、允许来源与显式自定义域名；`apply(config, values)` 写入运行时白名单，合并配置中已有 routes，不重复添加路由。仅设置白名单不会生成 routes。显式自定义域名配置应列全需由部署管理的域名，不能依靠构建自动发现控制台路由。
- `deploy/shared/worker_package.py`：`prepare()` 接受 `--allowed-origins`；`pipeline.prepare_arguments()` 将构建白名单传入生成步骤。
- `deploy/linux/tweb.py`：`domain_names(primary, aliases='')` 验证 DNS 名称；`configured_domains(state, text)` 优先读取已有环境白名单；`domain_env(text, state, names)` 仅替换两个域名变量，保留其他配置。
- `Manager.configure(port=None, allowed_domains=None)`：更新域名/端口、代理示例与安装状态；失败回滚环境、服务和生成配置。None 保留域名列表，空字符串清除别名。`Manager.generate(release, state)` 重新生成时保留已有环境白名单及其他变量。
- `deploy/vps/release.py`：`render(..., allowed_domains='')` 在原参数末尾接受逗号分隔别名，生成一份服务环境和多域名 Caddy 示例。

### 同步任务轻量元数据

`backend/app/native/site_sync_tasks.header(sql, uid)` 为异步只读接口，仅返回 UID、状态、工作检查点、审批关联和执行错误；拒绝已清理或不兼容格式的任务。后台执行前检查与审批回执更新使用此接口，避免读取正文和完整媒体列表。返回值不含 `_raw_state`，不能传给 `persist()` 作为可写快照。实际执行器仍通过 `get()` 加载任务并执行原有授权与并发校验。

### 同步进度证据

| 位置与函数 | 用法 |
| --- | --- |
| `backend/app/native/site_sync_checkpoint.py`：`projection()` | 生成有界SQLite/D1进度游标投影，不提取业务正文。 |
| 同文件：`observe(prior, checkpoint, at, *, finished=False, failed=False, uncertain=False)` | 比较持久化检查点并返回累计进展、失败和停滞计数；不决定重试。 |
| 同文件：`recovery_state(work, phase=None, *, at)` | 从工作状态及UTC截止时间派生监控状态。 |
| `backend/app/native/site_sync_work.py`：`position(sql, uid)`、`step(name)` | 读取窄检查点；装饰器在原租约下记录尝试及持久化位置变化。 |
| `frontend/admin/static/js/native-site-sync.js`：`localTime(value)` | 模块内统一格式化所有同步时间，沿用后台时区偏好，默认北京时间；保留完整ID。 |

### 同步局部读写

| 位置与函数 | 用法 |
| --- | --- |
| `backend/app/native/site_sync_patch.py`：`load(sql, uid)` | `await`；返回媒体下载/清理/终态的局部快照，其他阶段返回None。只供持有执行租约的内部流程使用。 |
| 同文件：`changes(task)`、`persist(sql, task, statements=(), status=None)` | 计算已加载字段差异；在原子批次中检查修订令牌并写入变化。不要将局部快照用作完整任务。 |
| `backend/app/native/site_sync_apply.py`：`execution_task(sql, uid)` | `await`；优先读取局部快照，复杂阶段回退完整读取；执行和异常核对共用。 |
| `backend/app/native/site_sync_tasks.py`：`persist(...)` | 自动路由局部/完整保存；保留原调用参数和批次一致性。 |
| `backend/app/native/site_sync_work.py`：`position(sql, uid, *, checkpoint=True)` | 冷却预检查传checkpoint=False，省去无需使用的检查点计算。 |


### 按进度恢复参数

- `backend/app/native/site_sync_limits.py`：`STANDARD/WORKER['no_progress_retry_limit']`分别为8/30；`retry_seconds`为等待阶梯，末档重复使用。
- `backend/app/native/site_sync_work.py`：`retry_state(error, prior, resource=None, *, checkpointed=False, progressed=False)`返回重试计数、资格和UTC截止时间；仅经持久化检查点核对后才能传`progressed=True`。`step(name)`统一处理捕获失败与running未确认状态。
- `backend/app/native/site_sync_schedule.py`：`step()`允许running任务重新核对，即使仍存在旧执行错误；`tick()`沿用对应任务的恢复决定。
- `frontend/admin/static/js/native-site-sync.js`：`api()`按保存检查点变化计算浏览器恢复额度，并遵守服务端冷却和永久暂停。任务新建及非推进操作不自动重放。

### 后台续跑与只读等待状态

| 位置与函数 | 用法 |
| --- | --- |
| `backend/app/native/site_sync_gate.py`：`checkpoint(sql, uid)`、`waiting(row, at)` | 读取窄任务状态、判断回执/重试等待、终态及子任务衔接；Worker入口与监控共用。 |
| 同文件：`lease_until(sql, uid=None)` | `await`；读取相关租约到期时间，只用于说明等待原因，不修改锁。 |
| `backend/app/native/site_sync_schedule.py`：`creation_link(r, s, before)` | 内部回调工厂，生成后台状态条件更新语句；交给`tasks.start(..., on_create=...)`与新任务同批提交。 |
| 同文件：`finish_task(r, s, row, interval)` | `await`；补记已结束任务的审批回执和本轮结束状态，不重放业务执行。 |
| 同文件：`status(sql)` | 返回策略、后台记录、`current_task`、`wait_reason`和`next_attempt_at`。恢复时间是最早时间，不承诺Cron执行时刻。 |
| `backend/app/native/site_sync_status.py`：`read(r, options=None)` | 为每项附加`advance_mode`、`wait_reason`、`next_attempt_at`；只读且保持有界分页。 |
