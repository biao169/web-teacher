# 源码、函数与路由索引

对应v0.16.133。用法先读[功能手册](README.md)及[部署手册](OPERATIONS.md)，再按完整文件路径查本索引。本文从当前Python定义提取实际函数名、参数与路由；不使用旧文档推测函数名。包含运行源码和部署工具，不包含测试、历史prototype/example程序或第三方vendor。列出符号不等于所有旧适配均是推荐入口。

## 如何调用

- r：当前请求经过资源工厂/会话校验得到的资源对象，常含sql、auth、content、media_store、config及p；p为实时principal；不要从浏览器身份显示快照构造p。
- self/cls：实例/类方法隐式首参，调用时不重复传self；async函数必须await，普通函数同步调用。
- app/resources/csrf/render：由web_common.create_base与web_context.renderer提供，在install时依赖注入；install只用于组装路由，不是每个请求调用一遍。
- uid/stamp：记录标识与已读updated_at版本令牌；导航上下文也有独立版本，不能跳过。
- install.save、install.public、main.inner之类名称表示定义所在闭包，用于源码定位，**不是对象可调用属性**。注册后的HTTP处理器由框架调用；nested helper只在外层生命周期可用。
- 以_开头或__dunder__标注的函数是内部步骤/协议方法。缺少独立docstring时仅给定位，不将其假装成可外部调用的稳定接口；具体职责与输入/输出由所在模块、调用者和源码约束共同决定。
- HTTP表是注册路径，子应用/挂载会加前缀：快传通常在/transfer；同步ASGI另有内部动态dispatch。参数与签名类型不是外部HTTP请求JSON格式。

### 常用调用例（只示意，不在本轮执行写入）

```python
from backend.app.native.suggestions import split_values
assert split_values("SCI;EI\nTag, intact") == ["SCI", "EI", "Tag, intact"]

from backend.app.native.navigation import build_public_path
path = build_public_path("publications", [
    {"field": "is_featured", "operator": "eq", "value": "1"}
])  # 保存为导航配置的受控路径，访问URL由url_name生成

from backend.app.native.public_read_model import build
async def inspect_public(r, uid):
    model = await build(r, "students", "zh")  # 完整模型或明确不可生成错误
    row = await r.content.get("students", uid, r.p)
    return model, row
# 保存前使用实际save签名/stamp版本规则；修改建议走已注册编辑表单。
```

get签名及各服务对象构造参数以本文件下方实际定义为准；例中的r/uid均来自已授权请求。CLI从项目根运行；生产操作优先使用既有后台/管理命令而不是导入内部实现绕过权限。

## Python运行与部署符号

### [backend/app/adapters/d1/sql.py](../backend/app/adapters/d1/sql.py)

D1 SQL adapter with atomic batches and native domain errors; no schema translation.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `plain(value)` | Normalize Pyodide JS values into plain Python records. |
| `rows(result)` | 把D1返回的结果集合转换为普通Python字典列表。 |
| `D1SQL.__init__(self, binding, on_public_commit=None)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `D1SQL.statement(self, sql, args)` | 预处理SQL并绑定参数，不拼接用户输入。 |
| `async D1SQL.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async D1SQL.batch(self, statements)` | 以一个数据库事务提交有界SQL批次，保持原子性。 |
| `async D1SQL.restore_batch(self, statements)` | Commit a bounded full restore atomically; ordinary mutations retain their 25-statement cap. |
| `async D1SQL._batch(self, statements, limit)` | Enforce the caller-specific transaction budget in either native adapter. |

### [backend/app/adapters/local_files/scholarly.py](../backend/app/adapters/local_files/scholarly.py)

Read-only fixed-origin HTTPS; no redirect, bounded bytes and socket timeout.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `NoRedirect.redirect_request(self, *args, **kwargs)` | 拦截外部查询重定向，防止固定服务请求转向其他地址。 |
| `async CrossrefTransport.get(self, url, headers=None)` | 从本适配器的数据源读取指定对象或记录。 |
| `CrossrefTransport._get(self, url, headers=None)` | 从允许的学术元数据服务获取有大小和超时限制的JSON。 |

### [backend/app/adapters/local_files/translation.py](../backend/app/adapters/local_files/translation.py)

Bounded local translation I/O; provider payloads are built by the shared service.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `TranslationTransport.__init__(self, hosts=())` | Keep the deployment-approved custom hosts outside editable provider payloads. |
| `async TranslationTransport.send(self, request, timeout)` | Run blocking HTTPS outside the event loop with per-call and socket time budgets. |
| `TranslationTransport._send(self, request, timeout)` | Read limited chunks without following redirects or returning upstream error bodies. |

### [backend/app/adapters/sqlite/passwords.py](../backend/app/adapters/sqlite/passwords.py)

CPython/OpenSSL KDF; one bounded hashing operation at a time per process.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `LocalKDF.__init__(self)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async LocalKDF.__call__(self, password, salt, iterations)` | 串行执行本地密码派生，防止高并发占用过多资源。 |

### [backend/app/adapters/worker_crypto/passwords.py](../backend/app/adapters/worker_crypto/passwords.py)

Workers Web Crypto adapter; real Pyodide/runtime verification remains required.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async derive(password, salt, iterations)` | 使用Web Crypto按指定盐和迭代次数执行PBKDF2。 |
| `derive.obj(value)` | 将Python字典转换为Web Crypto所需的JavaScript对象。 |

### [backend/app/adapters/worker_crypto/scholarly.py](../backend/app/adapters/worker_crypto/scholarly.py)

Worker HTTP adapter; imports only inside the Worker call.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async CrossrefTransport.get(self, url, headers=None)` | 从本适配器的数据源读取指定对象或记录。 |
| `async CrossrefTransport.get.fetch_bounded()` | 用流式读取限制学术查询响应体大小。 |

### [backend/app/adapters/worker_crypto/translation.py](../backend/app/adapters/worker_crypto/translation.py)

Worker translation I/O uses the same request policy and bounded JSON decoding as local.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `TranslationTransport.__init__(self, hosts=())` | Store the deployment-approved custom hosts, independent of request form input. |
| `async TranslationTransport.send(self, request, timeout)` | Fetch with an abort signal, redirect refusal and a bounded stream; never log bodies. |
| `async TranslationTransport.send.bounded()` | Convert only successful bounded responses to ordinary Python JSON values. |

### [backend/app/config.py](../backend/app/config.py)

One storage configuration for Windows, Linux and Workers; environment overrides TOML.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Settings.__post_init__(self)` | Resolve storage; source-local runtime files are confined to data/ or transfer-data/. |
| `Settings.from_env(cls, env=None)` | Read TEACHER_CONFIG TOML locally; Worker vars use the same TEACHER_* keys. |

### [backend/app/domain/admin_presentation.py](../backend/app/domain/admin_presentation.py)

Backend-only presentation defaults; never rewrite stored timestamps or permissions.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `admin_datetime(value, offset_minutes=ADMIN_OFFSET_MINUTES)` | Display ISO timestamps or Unix seconds; preserve date-only values and reject malformed dates. |

### [backend/app/domain/public_projects.py](../backend/app/domain/public_projects.py)

Pure public project formatting; no storage or permission changes.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `project_role(value, lang='zh')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `project_role_expression(column)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `project_amount(value, lang='zh')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `project_period(start, end, lang='zh')` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/domain/richtext.py](../backend/app/domain/richtext.py)

One safe HTML policy; DOM postprocessing only narrows trusted sanitizer output.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `render_body(value, format='plain')` | 三种原生正文格式共用安全输出；Markdown原始HTML只作为文字，源码不改写。 |
| `body_references(value, format='html')` | 以实际呈现格式提取媒体引用；纯文本、代码示例和转义HTML不会获得公开授权。 |
| `convert_body(value, source, target)` | 显式转换编辑格式；返回受控HTML或文本，调用方须提示排版可能损失。 |
| `media_references(value)` | 以正文相同安全策略提取精确媒体UID；纯文字地址和相似前缀不构成引用。 |
| `image_geometry(node)` | Accept numeric dimensions only, then generate safe CSS; never preserve input styles. |
| `clean(value, allowed_media=None)` | 清理HTML中的危险标签、属性和链接，仅保留受支持的富文本。 |
| `normalize_bodies(patch, current=None)` | 规范文本与HTML正文的格式及长度限制。 |
| `plain_to_html(value)` | 转义纯文本并保留换行，生成可安全显示的HTML。 |
| `html_to_plain(value)` | 提取富文本的可读纯文本，供搜索和摘要使用。 |

### [backend/app/native/__init__.py](../backend/app/native/__init__.py)

Services using the authoritative academic-cms schema without legacy database aliases.


### [backend/app/native/accounts.py](../backend/app/native/accounts.py)

账户页面的有界展示模型和表单辅助值转换；不创建账户表或另建授权机制。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `can_manage(p, table, action='edit')` | 只有系统管理员且具备对应模块动作权限时，才呈现账户写入口。 |
| `async deletion_blocks(sql, p, table, rows)` | Shared row protection hints; member checks include hidden and disabled accounts. |
| `async deletion_plan(sql, p, table, row)` | Preflight messages plus transactional predicates; never remove roles with members. |
| `parse_helpers(table, data, password)` | 将中文界面复选框转回原生范围JSON/权限映射；辅助输入不进入数据库。 |
| `async list_context(r, table, rows)` | 仅为当前页补齐角色名、授权概览和可查看的成员数，分批最多40个标识。 |
| `scope_choices(value)` | 从原生JSON读取已选范围，仅用于控件回显，不改写字段。 |

### [backend/app/native/assistance.py](../backend/app/native/assistance.py)

Read-only input assistance and translation cache writes using native reference fields.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Assistance.__init__(self, r)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async Assistance.metadata(self, doi, uid='')` | 供已有服务调用取得默认提供方的首条DOI建议，复用同一查询执行器。 |
| `async Assistance.source(self, row)` | Check exact source text/hash and live visibility before sending content to a provider. |
| `async Assistance.queue(self, table, uid, field, job_guard=None, initial_text=None)` | Create a bounded source-linked entry; reuse identical existing entries without overwriting. |
| `async Assistance.reuse_queued(self, row, table, source, field, job_guard=None)` | Populate new/pending entries from a cache; ambiguity keeps a reviewable pending row. |
| `async Assistance.translate(self, uid, stamp, provider='default', job_guard=None)` | Translate with source/version/manual protection and one atomic native result commit. |
| `async Assistance.result_statements(self, row, source_state, result, lease, job_guard=None, source_refs=None)` | Prepare the same guarded result write for single calls and per-document packed checkpoints. |

### [backend/app/native/auth.py](../backend/app/native/auth.py)

账号、会话和动作授权；Auth 对象由资源工厂注入，不能由前端快照替代。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Auth.__init__(self, sql, passwords)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async Auth.bootstrap(self, username, password)` | Create the sole initial administrator explicitly, never on ordinary startup. |
| `async Auth.login(self, username, password, network, *, with_display=False)` | Reserve account/network attempts before expensive KDF; inactive roles cannot log in. |
| `async Auth.principal(self, token)` | Re-read role and session for each request; return no password/hash secrets. |
| `async Auth.public_principal(self, token)` | Shared Public read projection; session/role validity remains live on every request. |
| `Auth.require(self, p, module, action='view')` | All action gates are server-side, including custom navigation destinations. |
| `Auth.guard(self, p, module, action, condition='1', args=())` | An invalid guard UID aborts the entire SQLite/D1 batch on stale authorization/CAS. |
| `async Auth.logout(self, p)` | Revoke only the current session. |
| `async Auth.password(self, p, current, new)` | Verify the current password, replace its hash and revoke all sessions atomically. |

### [backend/app/native/bridge.py](../backend/app/native/bridge.py)

保留的签名桥接能力；本地快传直接复用主站会话，旧独立适配不是推荐本地启动。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `sign(secret, claims)` | HMAC is only a bridge envelope, never a replacement for password hashing. |
| `verify(secret, token, audience)` | Verify signature, audience, expiry and maximum lease duration before trusting identity. |

### [backend/app/native/catalog.py](../backend/app/native/catalog.py)

Native field registry, shared editor sections and server-side validation.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `public_modules(lang)` | Public labels only; administrative MODULES remain Chinese. |
| `Error.__init__(self, message, status=422, code=None)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `now(after=None, seconds=0)` | Canonical 24-character timestamps; strict monotonic update tokens avoid lost writes. |
| `deletable(table)` | Application delete capability; account deletion adds guards, not schema changes. |
| `fields(table)` | Return only approved editable native fields, retaining hidden columns in storage. |
| `label(table, field)` | 从共享字段元数据取得后台中文标签。 |
| `sections(table)` | One record editor with common section metadata; no separate relationship page. |
| `defaults(table)` | Display schema defaults without inserting a record. |
| `normalize(table, values, *, restore=False)` | Reject unknown input; validate types, required values, links and native constraints. |

### [backend/app/native/content.py](../backend/app/native/content.py)

原生业务查询与写入；由请求资源 r.content 调用，p 为实时授权 principal。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Content.__init__(self, sql, auth)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Content.scope(self, table, p=None, public=False, *, fixed_conditions=None)` | Physical native visibility is checked in SQL; public queries never expose hidden rows. |
| `async Content.navigation(self, key, p)` | Resolve ASCII navigation ID; mandatory base filters stay in native path server-side. |
| `Content.parse_navigation(self, path)` | Allowlisted fixed equality/contains predicates; repeated or unknown fields are errors. |
| `async Content.count(self, table, p)` | Dashboard scalar only; identical unfiltered listing authorization/scope. |
| `async Content.listing(self, table, p=None, query=None, base=None, public=False, projection=None, ceiling_id=None, projection_limits=None, homepage_contacts=False, fixed_conditions=None)` | Compose authorization AND fixed filters AND user filters, then page using 10/20/50/100. |
| `Content.listing.projected(k)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Content.get(self, table, uid, p=None, public=False, *, fixed_conditions=None)` | Read a single authorized record, excluding all password/provider secrets. |
| `async Content.save(self, table, p, values, uid=None, stamp=None, base=None, password=None, permissions=None, secret_values=None, navigation=None, media_links=None, new_uid=None, creation_guard=None)` | Native writes use updated_at CAS and audit in the same authorization-guarded batch. |
| `Content.audit(self, p, table, action, uid, detail=None)` | Audit metadata only; never serialize submitted passwords or provider credentials. |
| `async Content.delete(self, table, p, uid, stamp, base=None, navigation=None)` | Keep shared authorization/CAS and add atomic account-specific dependency guards. |
| `async Content.matches(self, p, category, query=None)` | 按共享关键词规则返回授权学生的匹配总数和当前页，不写入分类关系。 |

### [backend/app/native/data_admin.py](../backend/app/native/data_admin.py)

Thin HTTP endpoints for business export, preflight, bounded media staging and restore.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, csrf, render)` | Mount the shared admin tools without exposing generic SQL or arbitrary filesystem paths. |
| `async install.page(request: Request)` | Render the same compact sectioned workspace used by other admin editors.；路由：GET /admin/data_tools；GET /admin/import-export |
| `async install.download(request: Request)` | Return safe JSON/CSV, or explicit sensitive plaintext solely for browser-side encryption.；路由：POST /api/backup/business；POST /api/admin/data/export |
| `async install.media_bytes(request: Request, uid: str)` | Export one selected active/trash local/R2 object with a current registration token.；路由：POST /api/admin/data/media/{uid} |
| `async install.preflight(request: Request)` | Read only a bounded metadata document; media bodies are uploaded separately.；路由：POST /api/admin/data/preflight |
| `async install.stage(request: Request, token: str, index: int)` | CSRF-authenticate a raw-file request before reserving or reading its body.；路由：POST /api/admin/data/stage/{token}/{index} |
| `async install.execute(request: Request)` | Require the issued ticket plus identical input and explicit replacement confirmation.；路由：POST /api/admin/data/execute |
| `async install.cancel(request: Request)` | Remove an owned preflight and staged files without changing live business data.；路由：POST /api/admin/data/cancel |

### [backend/app/native/data_restore.py](../backend/app/native/data_restore.py)

业务恢复先预检和媒体暂存，再按票据/会话/版本执行；不要直接调用 execute 跳过预检。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ticket_path(token)` | Use unguessable ASCII handles without accepting cache paths from clients. |
| `async ticket(r, token)` | Bind a ten-minute preflight to the live session and its server-side inventory. |
| `async cleanup(r, token, value)` | Remove only server-owned temporary objects named by a validated ticket. |
| `async discard(r, token)` | Cancel the SQL reservation before deleting staged media; a racing execute then fails its guard. |
| `normalize_record(r, table, source, old, sensitive=False)` | Shared single-row normalization for restore and incremental synchronization. |
| `async prepare(r, document, tables, mode, *, removed=None)` | Normalize up to 500 rows and compare the prospective graph before allowing execution. |
| `async references(r, result, mode, *, removed=None)` | Validate final foreign keys/types and body media; protect references outside selected tables. |
| `async preflight(r, document, tables, mode)` | Issue a random handle only when all validation succeeds; errors contain no submitted values. |
| `async stage(r, token, index, request)` | Validate one bounded raw object against its preflight digest before cache-only staging. |
| `inventory_condition(state)` | Recheck every observed UID/update token inside the final write transaction. |
| `async execute(r, token, document, tables, mode, confirmation)` | Revalidate the file/session/snapshot, stage missing files and commit all selected tables atomically. |

### [backend/app/native/data_tools.py](../backend/app/native/data_tools.py)

Business backup registry, safe exports and bounded native-row validation.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `encoded(value)` | Use deterministic UTF-8 for file digests and bounded JSON SQL parameters. |
| `digest(value)` | Hash data without disclosing its fields in a preflight response or audit log. |
| `authorize(r, action='view', tables=())` | Whole-table backup is restricted to a current system administrator and module grants. |
| `selection(value)` | Accept a non-empty explicit subset of business tables, never SQL identifiers from a file. |
| `async snapshot(r)` | Capture bounded UID/update-token inventories in one SQLite/D1 read transaction. |
| `async export(r, tables=None, sensitive=False)` | Export complete fields rather than the abbreviated list projection; omit runtime state. |
| `csv_cell(value)` | Escape formula-like cells consistently for business backups and operation-log CSV files. |
| `csv_export(value, table)` | Single-table UTF-8 CSV with formula-injection neutralization and complete cell values. |
| `row_values(table, row, sensitive=False)` | Validate all native backup fields using the editor's scalar rules, including reserved fields. |
| `validate_domain(table, row)` | Reuse provider, category, navigation and rich-text validators for restored full records. |

### [backend/app/native/database.py](../backend/app/native/database.py)

Fresh canonical initialization, exact schema verification and bounded SQL transactions.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Database.__init__(self, path, kind='teacher', on_public_commit=None)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Database.connect(self)` | Open a short-lived, foreign-key enforcing connection with a 2 MiB cache. |
| `Database.initialize(self, reset=False)` | Create only an empty database; deletion occurs only with explicit reset=True. |
| `Database._reset(self)` | Delete only the configured SQLite file and sidecars under an exclusive process lock. |
| `Database._initialize_connection(self, c)` | Initialize an empty native schema; existing schema must compare exactly. |
| `Database.verify(self, c=None)` | Compare every executable table/index definition with original final SQL. |
| `async Database.query(self, sql, args=())` | Parameterized read; identifiers must come from the native catalog. |
| `async Database.batch(self, statements)` | Commit writes and audit together; RETURNING results remain inside one transaction. |
| `async Database.restore_batch(self, statements)` | Commit a bounded full restore atomically; ordinary mutations retain their 25-statement cap. |
| `async Database._batch(self, statements, limit)` | Enforce the caller-specific transaction budget in either native adapter. |

### [backend/app/native/demo.py](../backend/app/native/demo.py)

Explicit, idempotent native-schema examples; never called by server startup.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async seed(sql)` | Insert about ten examples per content type; existing examples and user edits survive reruns. |

### [backend/app/native/editor.py](../backend/app/native/editor.py)

后台单页编辑的字段呈现、工具区块和有界关联候选；不改变原生数据库定义。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `editor_fields(table, row=None)` | 将原字段类型及文档控件提示转换为统一后台控件，保留真实提交值。 |
| `editor_sections(table, row, secret_fields)` | 为字段区和适用辅助区建立同一份可跳转目录，避免缺失或无目标锚点。 |
| `async reference_choices(r, table, row)` | 按权限只读取有限候选的标识和名称，并补回已保存且不在首批内的关联。 |
| `async citation_profile(r)` | 读取首位公开精选教师及当前有效英文姓名；只返回引用高亮所需信息。 |
| `async citation_profile_names(r)` | 保留既有姓名列表接口，统一使用精确原文匹配的英文覆盖规则。 |

### [backend/app/native/example_admin.py](../backend/app/native/example_admin.py)

Small authenticated example center; no automatic job, remote call or startup hook.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, csrf, render)` | Use shared layout and permission/CSRF handling on local and Worker deployments. |
| `async install.page(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /admin/examples |
| `async install.status(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/admin/examples/status |
| `async install.step(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/admin/examples/step |

### [backend/app/native/example_assets.py](../backend/app/native/example_assets.py)

Small original demo assets; generated once without adding production PDF/image dependencies.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `portrait(index)` | Render a compact geometric avatar/illustration as a standards-compliant RGB PNG. |
| `portrait.chunk(kind, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/native/example_catalog.py](../backend/app/native/example_catalog.py)

Versioned synthetic scenario definitions; separate IDs keep older examples and user edits intact.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `identity(table, index)` | Stable opaque IDs are scoped to the dataset, table and ordinal, never inferred from user text. |
| `permission_preset(index)` | Useful non-system example roles; no existing account is attached or changed. |
| `translation_source(index)` | Examples pair shared phrases, a manual disagreement, and its pending source. |
| `initial_translation(index)` | Human-authored illustrative text; never attribute these examples to a translation provider. |
| `values(table, i, media=None)` | Build editable native fields and real references; reserved fields remain outside the payload. |
| `translation_original(index)` | A preset translation must never be applied to a source the user has already rewritten. |

### [backend/app/native/example_citations.py](../backend/app/native/example_citations.py)

Synthetic citations generated with the same publication-tools formatter as the editor.


### [backend/app/native/example_cli.py](../backend/app/native/example_cli.py)

Console entry uses real login and the same bounded example service as the browser.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async run(settings, username=None)` | Require an existing administrator; never synthesize a privileged principal or default password. |

### [backend/app/native/examples.py](../backend/app/native/examples.py)

Explicit, bounded example insertion using existing authorization, editors, media and translation paths.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Examples.__init__(self, r)` | Retain the request-scoped native services and configured object stores. |
| `Examples.authorize(self, group=None)` | Examples are a system-admin operation and still require every affected module grant. |
| `Examples.guard(self, group, lease)` | Recheck data-tool/module grants and the shared example lease inside each mutation. |
| `async Examples.present(self, group, i)` | Stable IDs, or any existing source-linked translation, preserve edits and partial work. |
| `async Examples.status(self)` | Read coverage only; GET never seeds, repairs or changes configuration. |
| `async Examples.assets(self, group)` | Reference actual registry objects; a modified/trash/missing example is never repaired silently. |
| `async Examples.step(self, group, index)` | Create one deterministic item; retrying a lost response sees the existing row instead. |
| `async Examples.step.Upload.stream(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/native/field_help.py](../backend/app/native/field_help.py)

Administrator field meanings and requirements derived from the real native validators.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `requirements(table, field, spec)` | Derive blank handling, formats and limits from runtime validation, never from obsolete prose. |
| `apply_help(table, specs)` | Provide every editable field with a meaning and real validation/blank requirements. |

### [backend/app/native/filtering.py](../backend/app/native/filtering.py)

Shared condition validation and bound predicates; public fields are explicit.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `fields(table, *, public=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `operators(table, field, *, public=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `field_options(table, *, public=False)` | Metadata for the existing visual editor; new text rows default to contains. |
| `normalize_value(table, field, value, *, public=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `normalize_conditions(table, conditions, *, public=False)` | One fixed condition per field; additional user predicates stay independent. |
| `contains_pattern(value)` | Literal substring matching; %, _ and backslash never become wildcards. |
| `contains_predicate(table, field, value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `compile_conditions(table, conditions, *, public=False)` | Return one AND predicate plus bound values, independent of permissions. |
| `search_predicate(table, term, *, public=False)` | Raw/manual-English branch; public listing adds the shared effective-cache branch. |

### [backend/app/native/frontend_examples.py](../backend/app/native/frontend_examples.py)

Explicit local import of the additional 30 students / 100 papers; no web/startup hooks.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `load_rows()` | Reject a wrong/truncated batch before writing; stable IDs never depend on displayed names. |
| `FrontendExamples.__init__(self, resources)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async FrontendExamples.coverage(self, groups)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async FrontendExamples.step(self, group, index)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async import_batch(service, groups=('students', 'publications'), limit=130, emit=print)` | Stop at the first failure, report persisted progress; reruns fill missing stable IDs only. |
| `async import_batch.media_count()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async console(settings, *, username=None, action='status', group='all', limit=130)` | Use the existing administrator login; never create accounts or print credentials. |
| `main(argv=None, settings=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/list_columns.py](../backend/app/native/list_columns.py)

Shared administrator column choices; presentation never changes native fields or permissions.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `column_layout(table)` | Return ordered allowed/recommended columns, excluding secrets and long body/citation payloads. |

### [backend/app/native/locking.py](../backend/app/native/locking.py)

Cross-platform process lock prevents resetting a database served by this application.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `RuntimeLock.__init__(self, database)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `RuntimeLock.__enter__(self)` | 获取非阻塞运行锁，拒绝另一进程同时占用数据库。 |
| `RuntimeLock.__exit__(self, *args)` | 释放当前对象持有的数据库运行锁。 |

### [backend/app/native/log_privacy.py](../backend/app/native/log_privacy.py)

操作日志的有界脱敏展示；未知详情字段默认隐藏，不输出原始请求或凭据。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `text(value)` | 隐藏文本中的常见凭据、邮箱和网络地址，剥除URL认证、查询及片段。 |
| `text.url(match)` | 保留可读来源路径，URL用户信息、查询值和锚点不进入日志界面。 |
| `detail(raw)` | 只公开已知诊断键，限制64Ki字符、深度8和1000节点；异常JSON不回显原文。 |
| `detail.walk(item, depth=0)` | 递归脱敏；嵌套JSON字符串同样校验，预算耗尽时终止展开。 |
| `record(row, include_detail=False)` | 列表、详情和导出共享同一脱敏结果，不改变数据库原始日志。 |

### [backend/app/native/maintenance_access.py](../backend/app/native/maintenance_access.py)

Pure maintenance visibility policy shared with page presentation.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `allowed(p)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/maintenance_admin.py](../backend/app/native/maintenance_admin.py)

Shared maintenance workspace, using existing system role and CSRF controls.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, csrf, render)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `install.check(r, action='view')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install.observer(r)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.lifespan(application)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.page(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /admin/runtime-maintenance |
| `async install.status(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/admin/runtime-maintenance/status |
| `async install.action(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/admin/runtime-maintenance |

### [backend/app/native/media.py](../backend/app/native/media.py)

Media uses native media_assets records, bounded uploads, private reads and reference checks.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Media.__init__(self, sql, auth, content, store, kind='local')` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async Media.upload(self, p, filename, request, allowed_mimes=None, metadata=None, validate_bytes=None, new_uid=None, creation_guard=None)` | One globally reserved upload, maximum 20 MiB; release reservation on every exit. |
| `async Media.readable(self, uid, p=None)` | A public file needs an actual visible reference and public attachment policy. |
| `async Media.public_reference(self, row)` | Reuse existing public-reference rules for cache classification on both platforms. |
| `async Media.worker_public_reference(self, row)` | One scalar query for direct references; retain exact rich-text validation. |
| `async Media.inspect(self, p, uid)` | 后台授权用户可检查活跃或回收站媒体，公开读取仍仅接受活跃资源。 |
| `async Media.status(self, p, uid, stamp, status, base=None, navigation=None)` | 引用检查期间预留短时写锁，状态、授权及审计在同一事务提交。 |
| `signature(data, ext)` | Accept only signatures of supported passive media types; executable HTML/SVG is excluded. |

### [backend/app/native/media_admin.py](../backend/app/native/media_admin.py)

媒体核对与字段预览的薄HTTP入口；复用会话、CSRF和管理布局。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, csrf, render)` | 挂载后台媒体能力，不为访客开放目录或原始文件系统地址。 |
| `async install.resolve_link(request: Request)` | Read-only URL validation; registration requires an explicit confirmation or content save.；路由：POST /api/admin/media-picker/links/resolve |
| `async install.register_link(request: Request)` | Explicit chooser registration shares context, native guards and existing-media selection.；路由：POST /api/admin/media-picker/links/register |
| `async install.picker_list(request: Request)` | 当前内容上下文的私有媒体搜索，不预加载全部媒体。；路由：GET /api/admin/media-picker/items/list |
| `async install.picker_select(request: Request)` | 确认选择只返回合适且存在的媒体，内容引用由统一保存建立。；路由：POST /api/admin/media-picker/items/select |
| `async install.picker_upload(request: Request)` | 原始字节流复用统一上传、配额、签名和登记事务。；路由：POST /api/admin/media-picker/upload/file |
| `async install.crop_upload(request: Request)` | 上传浏览器生成的裁剪副本，检查来源版本、字段权限、输出尺寸及共享配额。；路由：POST /api/admin/media-picker/crop/file |
| `async install.lookup(request: Request)` | 将原生媒体键转换为受权限保护的预览信息，预览不创建引用。；路由：GET /api/admin/media/lookup/by-key；POST /api/admin/media/lookup/by-key |
| `async install.audit_page(request: Request)` | 按需读取一个报告页和20条到期候选，沿用后台分区与分页组件。；路由：GET /admin/media/audit |
| `async install.audit_content(request: Request, report: str, page: int, index: int)` | 预览仅引用已授权报告条目；浏览器不能传入任意磁盘路径，不自动收录。；路由：GET /api/admin/media-audit/{report}/{page}/{index}/content；HEAD /api/admin/media-audit/{report}/{page}/{index}/content |
| `async install.audit_action(request: Request)` | 扫描及报告也是私有操作；所有状态变化仅由显式POST调用。；路由：POST /api/admin/media-audit/actions/run |

### [backend/app/native/media_audit.py](../backend/app/native/media_audit.py)

管理员显式分批扫描、分类、预检和提交媒体目录修复；不用于 Public 缓存扫描。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `MediaAudit.__init__(self, r)` | 组合现有身份、SQL、媒体和缓存；不配置额外数据库或常驻扫描进程。 |
| `async MediaAudit.read_json(self, key)` | 报告缓存有体积上限，丢失或损坏时要求重新扫描。 |
| `async MediaAudit.write_json(self, key, value)` | 缓存写入复用既有原子存储方法。 |
| `MediaAudit.root(self, report)` | 只允许服务端产生的报告标识进入缓存路径。 |
| `async MediaAudit.latest(self)` | 返回当前账号唯一报告入口；清理报告前不会建立多份目录缓存。 |
| `async MediaAudit.state(self, report, expired=False)` | 校验报告所有者、配置范围和有效期，阻止跨用户/跨目录复用报告。 |
| `async MediaAudit.start(self)` | 建立只读核对任务；已有报告必须先明确清除，限制缓存积累。 |
| `async MediaAudit.classify(self, key, asset=None, info=None)` | 元信息核对不读取文件内容；不存在、大小变化、链接和保留存储类型分开显示。 |
| `async MediaAudit.step(self, report, version)` | 每次至多核对20条；游标和已完成报告保存在缓存，可暂停并继续。 |
| `async MediaAudit.page(self, report, category='', page=1, query=None)` | 媒体列表协议：对整个已扫描报告筛选和排序，再读取当前页条目。 |
| `async MediaAudit.entry(self, report, page, index)` | 操作目标来自已保存报告，不能由浏览器传任意文件系统地址。 |
| `async MediaAudit.recheck(self, report, page, index)` | 单项复核使用最新登记和实际对象状态，不自动修改媒体元数据。 |
| `async MediaAudit.clear(self, report)` | 分批删除当前账号的报告缓存；不触及媒体文件或清理意图。 |
| `async MediaAudit.plan(self, report, values)` | 预检凭据绑定账号、存储配置和对象版本；同一内容重复预检复用缓存槽。 |
| `async MediaAudit.get_plan(self, report, token, kind)` | 执行前重读服务器预检内容，拒绝过期或跨用途凭据。 |
| `async MediaAudit.checked_file(self, key)` | 收录共用上传格式、20MiB上限及签名检查，并核对读取前后版本。 |
| `async MediaAudit.prepare_import(self, report, page, index)` | 明确呈现原地登记或规范文件名副本方案，预检不改媒体文件和数据库。 |
| `async MediaAudit.commit_import(self, report, token)` | 重新核对字节/权限/配额后登记；副本失败时保留可核对文件，不删除原文件。 |
| `async MediaAudit.purge_candidates(self)` | 回收站按更新时间展示20条到期/待重试候选，引用保护仍在预检及提交时执行。 |
| `async MediaAudit.eligible(self, uid, stamp, immediate=False, base=None, manual=False)` | 自动清理检查保留期；手动删除仅跳过时间限制，仍检查权限、版本和引用。 |
| `async MediaAudit.prepare_purge(self, report, uid, stamp)` | 预检显示将永久删除的登记和对象；缺失对象也只清理已到期且无引用的登记。 |
| `async MediaAudit.purge_plan(self, uid, stamp, immediate=False, base=None, navigation=None, manual=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MediaAudit.commit_purge(self, report, token)` | 先持久化清理意图再删对象；失败保留回收站及重试状态，绝不自动恢复。 |
| `async MediaAudit.execute_purge(self, p)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MediaAudit.prepare_trash(self, uid, stamp, immediate=False, base=None, navigation=None)` | One bounded cached preflight slot per account/record, without creating a scan report. |
| `async MediaAudit.commit_trash(self, uid, token, base=None, navigation=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/native/media_audit_list.py](../backend/app/native/media_audit_list.py)

核对报告的列表适配：共用列表协议，筛选全部已扫描项，不重新扫描磁盘。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `media_hint(row)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `compact(row, page, index)` | 索引只保存筛选所需元信息；不缓存媒体正文或创建业务数据库表。 |
| `async append_index(audit, state, page, rows)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `specifications(categories)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `parameters(query, categories)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async listing(audit, report, query, categories)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async listing.records()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/native/media_image.py](../backend/app/native/media_image.py)

裁剪输出的轻量头部检查；不解码图片，不执行服务端裁剪或引入图像依赖。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `crop_dimensions(data, mime)` | 从PNG IHDR或JPEG SOF读取尺寸，拒绝截断头部及64–4096范围之外的输出。 |

### [backend/app/native/media_inventory_store.py](../backend/app/native/media_inventory_store.py)

媒体目录只读列举、版本核对及受控收录；支持Unicode原文件名，拒绝路径逃逸。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `relative_key(value, empty=False)` | 扫描键可含中文，但不能是绝对路径、空段、控制字符或父目录。 |
| `digest(value)` | 将平台版本信息转换为固定长度比较值，不作为内容校验值。 |
| `file_version(info)` | 共用本地文件版本格式；核对/删除仍保留严格版本检查。 |
| `js_options(value)` | 在Worker中将纯Python配置转换为普通JS对象；本地测试可替换此边界。 |
| `LocalInventory.__init__(self, store)` | 限定于既有存储根目录，不创建额外媒体目录。 |
| `LocalInventory.path(self, key, empty=False)` | 拒绝所有符号链接/Windows联接点，包含指向根目录内部的链接。 |
| `async LocalInventory.head(self, key)` | 读取普通文件实际大小和inode/时间版本，不读文件正文。 |
| `LocalInventory.open_reader(self, key)` | 鉴权后调用：只定位并打开一次，元信息与文件头来自同一个文件句柄。 |
| `LocalInventory.absolute_path(self, key)` | 仅用于已授权后台展示；不接受范围外路径，不跟随目录内链接。 |
| `async LocalInventory.read(self, key, limit)` | 对目录内Unicode文件进行有界读取，调用者负责前后版本一致性。 |
| `async LocalInventory.read_range(self, key, offset, length, version)` | 只读取指定64KiB以内区间；文件替换或读取中变化时停止返回。 |
| `async LocalInventory.list_page(self, cursor=None, limit=20, prefix='')` | 深度优先游标，每批最多访问20个目录条目；不把整棵目录树载入内存。 |
| `async LocalInventory.create(self, key, data)` | 新副本只允许独占创建，碰到已有文件立即停止。 |
| `async LocalInventory.delete(self, key, version)` | 删除前再检查实际版本；不跟随链接，不递归删除目录。 |
| `R2Inventory.__init__(self, store)` | 复用配置的桶绑定和媒体前缀。 |
| `async R2Inventory.head(self, key)` | R2 head仅读取元信息，version用于识别对象替换。 |
| `async R2Inventory.read(self, key, limit)` | 先查实际大小再读取R2正文，保持平台内存上限。 |
| `async R2Inventory.read_range(self, key, offset, length, version)` | 向R2申请有界区间，检查上传版本和实际返回范围后才读取缓冲区。 |
| `async R2Inventory.list_page(self, cursor=None, limit=20, prefix='')` | 仅列举配置前缀，以truncated而非返回数量判断是否还有下一批。 |
| `async R2Inventory.create(self, key, data)` | 通过条件写入新对象，禁止覆盖已存在的目标。 |
| `async R2Inventory.delete(self, key, version)` | 删除前复核版本；目录应由应用管理，R2 delete本身无条件版本参数。 |
| `inventory(store)` | 按存储适配器选择目录能力，媒体与缓存始终使用各自配置。 |

### [backend/app/native/media_links.py](../backend/app/native/media_links.py)

Shared media URL resolution and atomic external registration; never fetch remote bytes.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `external_url(value)` | Normalize public HTTP(S) spelling, preserving signed paths, queries and fragments exactly. |
| `media_link(row)` | Show external source URLs and stable local media routes, without exposing disk paths. |
| `MediaLinks.__init__(self, r)` | One request owns draft registrations and existing versions, reused by form and chooser. |
| `async MediaLinks.resolve(self, value, types, declared='', stamp='', create=True)` | Resolve a registered key/local URL or stage a declared external resource without writes. |
| `MediaLinks.statements(self)` | Generate permission/CAS guarded registry changes for the caller's SQLite or D1 batch. |
| `async MediaLinks.form(self, table, data, uid='', nav='', nav_stamp='')` | Resolve all submitted media inputs as a single draft; failed content saves leave no new rows. |
| `async decorate_media_fields(r, table, specs, row)` | Attach bounded saved-link/type values to the existing field renderer, including unavailable keys. |

### [backend/app/native/media_locks.py](../backend/app/native/media_locks.py)

复用原生写保护表协调媒体操作；清理意图独立于可清理缓存保存。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `purge_key(uid)` | 固定长度清理标识，兼容原生UID上限。 |
| `pending_guard(uid)` | 待清理条目不能编辑或恢复，直到管理员重试并完成清理。 |
| `live_lease(key, owner)` | 提交时检查当前租约仍由本次请求持有且未过期。 |
| `async lease(r, key, action='view')` | 短批次串行化；异常释放本次锁，进程中断遗留锁可在5分钟后重试。 |

### [backend/app/native/media_names.py](../backend/app/native/media_names.py)

Original names are metadata, never storage paths; headers use RFC 5987 encoding.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `original_name(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `disposition(row, mime, suffix, inline)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/media_picker.py](../backend/app/native/media_picker.py)

统一媒体选择：有限列表、目标权限、固定范围、状态/版本及对象存在性复核。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `MediaPicker.__init__(self, r)` | 复用每个请求的身份、SQL和媒体存储，不维护额外数据库。 |
| `async MediaPicker.context(self, data)` | 媒体查看权限与目标内容编辑/创建权限同时成立，导航范围不能被绕过。 |
| `MediaPicker.dto(self, row)` | 仅返回选择及显示所需字段；不暴露校验和、存储配置和后台内部数据。 |
| `async MediaPicker.options(self, rule)` | 传递有效类型/上传限额，分类建议最多100项，不把全库名称写入页面。 |
| `async MediaPicker.listing(self, data)` | 参数绑定搜索标题/对象键/分类，分页仅取10或20条活跃且类型适用的记录。 |
| `async MediaPicker.select(self, data)` | 确认前重查记录版本、目标类型和实际文件存在性；不保存内容引用。 |
| `async MediaPicker.upload(self, data, filename, request)` | 新上传沿用唯一上传服务；目标用途和元数据在写文件前完成检查。 |
| `async MediaPicker.crop_upload(self, data, filename, request)` | 裁剪副本复用上传；可选来源在提交时重新核对，不修改来源或已有引用。 |

### [backend/app/native/media_policy.py](../backend/app/native/media_policy.py)

媒体字段与正文节点共用类型规则；保持原生字段和数据库定义不变。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `types_for(table, field)` | 选择上下文只允许真实媒体外键及两种明确的正文插入用途。 |
| `check_type(table, field, mime)` | 最终内容保存也核对类型，不能通过手工请求将PDF设为头像。 |

### [backend/app/native/media_references.py](../backend/app/native/media_references.py)

从原生外键和经过安全解析的正文派生媒体引用，不增加数据库表或缓存副本。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `MediaReferences.__init__(self, content)` | 复用内容服务的数据库和可见范围规则。 |
| `MediaReferences.scope(self, table, principal)` | 没有目标模块查看权限时只允许输出受保护标记。 |
| `async MediaReferences.news_rows(self, uids, principal=None, public=False)` | 按20条游标分页解析候选正文；URL文字或相似UID不算实际图片/链接。 |
| `async MediaReferences.body_rows(self, uids, principal=None, public=False)` | 统一原文与当前生效译文；源摘要过时的译文不产生正在使用的引用。 |
| `async MediaReferences.summaries(self, principal, assets, include_links=False)` | 分组统计当前媒体页；有界返回模块/字段计数，不载入全站人物记录。 |
| `async MediaReferences.locations(self, principal, asset, summary, source='', page=1)` | 使用位置按字段分组和每页20条展示，受限来源不返回名称或链接。 |
| `async MediaReferences.used(self, asset)` | 回收校验覆盖所有可见范围；无法完整解析的正文同样保护媒体。 |
| `async MediaReferences.public_body_reference(self, uid)` | 仅真实、可公开阅读的HTML节点可以授予正文媒体公开访问。 |
| `reference_guard(keys=(), uids=())` | 在保存事务内重查媒体仍活跃，避免预检后被回收或并发添加引用。 |
| `async translated_media(sql, auth, principal, source_ref_key, text, format=None)` | 校验正文译文中可激活的媒体，供手工译文与供应商写入共用事务保护。 |

### [backend/app/native/media_response.py](../backend/app/native/media_response.py)

共用媒体输出：先鉴权，本地一次打开并连续读取，R2保留有界区间读取。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `content_type(prefix, key)` | 以文件头识别所有已支持类型，兼容历史错误后缀；不信任登记MIME。 |
| `LocalMediaResponse.__init__(self, handle, start, length, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMediaResponse.__init__.chunks()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LocalMediaResponse.__call__(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async preview_details(store, row)` | 后台详情按需读一次文件头，显示真实类型和媒体目录内的绝对路径。 |
| `byte_range(value, size)` | 解析单一区间和后缀范围，拒绝多区间、空后缀、越界及异常长数字。 |
| `async media_response(request, r, uid, private=False)` | 权限保持原规则；预览只读原文件，不再把上传体积上限用作流式读取上限。 |
| `async media_file_response(request, r, row)` | 已授权记录或核对条目共用同一文件读取流程，调用方负责授权。 |
| `async media_file_response.chunks()` | R2每块最多1MiB，继续验证远端版本，避免拼接不同版本内容。 |

### [backend/app/native/message_log_admin.py](../backend/app/native/message_log_admin.py)

留言与操作日志的共用只读详情HTTP页面；业务编辑继续使用统一表单。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, render)` | 注册两个详情入口，共用模板、目录、复制控件和固定底栏。 |
| `async install.detail(request: Request, uid: str)` | 仅在模块查看权限内显示记录；GET不标记已读，日志始终使用脱敏投影。；路由：GET /admin/messages/{uid}/view；GET /admin/operation_logs/{uid}/view |

### [backend/app/native/messages.py](../backend/app/native/messages.py)

留言处理的原生状态、展示和编辑约束；所有写入仍走共用内容事务。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `validate(patch, current)` | 仅允许处理状态与可见范围变更；访客原始姓名、邮箱、正文和附件不可修改。 |
| `decorate_fields(specs, row)` | 补齐共用编辑控件的中文选项和说明，不更改数据库字段定义。 |
| `presentation(row)` | 为列表和只读详情提供相同的状态文字、语义样式及类型标签。 |
| `news_uid(row)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async views(content, rows)` | Batch resolve public news sources for a page; no per-message queries or private news leak. |

### [backend/app/native/metadata_config.py](../backend/app/native/metadata_config.py)

论文服务白名单、原生设置转换与部署密钥状态；不扩展数据库结构。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `credentials(source)` | 只读取固定部署变量；密钥仅供后端请求使用，不放入页面或查询结果。 |
| `parse_settings(values)` | 保留显式默认和启用顺序；全空配置提供Crossref及公共来源预设，不写库。 |
| `async load_settings(r)` | 使用最早一条全局设置，与现有网站配置读取策略一致。 |
| `display_options(r, settings)` | 返回名称、顺序和密钥是否存在；不返回密钥内容或用户联系邮箱。 |
| `form_settings(data)` | 将后端表单的启用复选项和排序输入转换成原生服务数组，无JavaScript也可提交。 |
| `async page_options(r, values=None)` | 无效服务配置不阻塞论文手工编辑；选项显示禁用并允许管理员重新选择修复。 |

### [backend/app/native/metadata_http.py](../backend/app/native/metadata_http.py)

固定学术HTTPS地址和请求头校验，两个平台共享，不接受任意服务地址。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `validate_request(url, headers=None)` | 验证精确主机、允许路径和有限请求头，禁止凭据地址、重定向及换行注入。 |

### [backend/app/native/metadata_providers.py](../backend/app/native/metadata_providers.py)

六家论文服务的固定请求与字段映射；不返回摘要、附件或不受支持的业务字段。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ProviderFailure.__init__(self, state)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `mapping(value)` | 外部可选对象的类型保护。 |
| `items(value)` | 限制单个服务的候选/作者数组扫描量。 |
| `first(value)` | 读取外部数组首项，不把普通文本误当数组。 |
| `text_list(value, key=None)` | 规范作者、类型、关键词为分号文本；逐项类型和长度有界。 |
| `year(value)` | 仅从已知日期字段读取四位年份。 |
| `candidate_fields(provider, row, doi=None)` | 将各提供方一条结果转换为同一可编辑字段白名单。 |
| `async retrieve(transport, provider, mode, query, credentials)` | 按固定来源执行最多两次GET；精确DOI必须匹配，题名返回最多5个候选供用户判断。 |
| `async retrieve.get(url, extra=None)` | 把状态码转换为可解释结果，不暴露外部正文或凭据。 |

### [backend/app/native/metadata_search.py](../backend/app/native/metadata_search.py)

共用DOI/题名检索、逐服务回退和有界缓存；没有论文写入或常驻任务。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `MetadataSearch.__init__(self, r)` | 复用当前请求的身份、原生SQL与本地/R2缓存适配器。 |
| `async MetadataSearch.authorize(self, uid, nav='', stamp='', read_only=False)` | 独立检索只需查看；表单检索需要新增/编辑并符合记录与导航固定范围。 |
| `async MetadataSearch.cached(self, key, fingerprint, kind, query, ttl)` | 固定64个缓存槽；严格匹配查询摘要、期限与字段，坏缓存退回服务查询。 |
| `async MetadataSearch.source(self, provider, kind, query)` | 一次服务尝试；PubMed使用搜索和汇总两步，不请求全文或附件。 |
| `async MetadataSearch.search(self, query, kind='auto', provider='default', uid='', nav='', nav_stamp='', read_only=False, correspondence=False)` | 默认单服务或显式按配置回退；最多六服务、每次服务8秒、总等待20秒。 |

### [backend/app/native/metadata_sources.py](../backend/app/native/metadata_sources.py)

六家学术服务的固定请求与字段映射；结果仅为人工核对候选，不保存论文。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `obj(value)` | 安全读取可选对象。 |
| `items(value, limit=100)` | 只处理有限有效对象，不把字符串或错误结构当成数组。 |
| `joined(values)` | 统一多值字段为分号文本，不拆分姓名中的逗号。 |
| `year_of(value)` | 从供应商日期取四位年份，最终范围由公共字段校验器核对。 |
| `request_for(provider, kind, query, secrets)` | 仅拼接固定服务端点；题名/DOI及部署凭据始终作为编码参数。 |
| `pubmed_summary(payload, secrets)` | ESearch返回的最多5个纯数字PMID进入ESummary，不接受供应商提供的任意URL。 |
| `extract(provider, payload, kind, query)` | 将不同响应压缩到最多5个白名单候选；精确DOI不接受不匹配或缺失的标识。 |

### [backend/app/native/navigation.py](../backend/app/native/navigation.py)

后台导航的规范路径、固定条件及只读预览；复用原生字段，不增加数据表。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `filter_fields(table)` | 提供固定条件白名单及显示标签；字段名称仅来自原生结构。 |
| `filter_value(table, key, value)` | 规范整数与开关条件，文本按原文相等；拒绝空条件及过长/无效输入。 |
| `FixedScope.__init__(self, conditions)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `FixedScope.__bool__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `scope_conditions(base)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `build_path(table, conditions)` | Shared validation; legacy f. equality and c. literal contains use ASCII encoding. |
| `parse_path(path)` | Parse only allowlisted equality/contains conditions, with duplicate-field rejection. |
| `in_scope(table, row, base)` | Match write guards with SQL semantics, including literal ASCII-insensitive contains. |
| `editor_state(row, principal)` | One visual editor; public conditions expose only public-safe field metadata. |
| `async preview(content, principal, data)` | Read-only bounded preview; public preview applies public gates even for admins. |
| `navigation_guard(navigation)` | 把导航版本和启用状态纳入写事务，避免检查后规则改变仍能提交。 |
| `has_public_conditions(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `build_public_path(table, conditions, lang='en')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `parse_public_path(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `draft_state(path, location, principal)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/navigation_options.py](../backend/app/native/navigation_options.py)

Supported navigation choices and safe sidebar presentation; database values remain native.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `decorate_fields(specs, row=None)` | Offer known choices while retaining any existing blank or custom value without normalization. |
| `sidebar_presentation(row)` | Only bundled symbols and supported semantic styles can affect the shared sidebar. |
| `grouped_menu(entries)` | Group presentation only; preserve authorized entries and relative custom order. |

### [backend/app/native/news_body.py](../backend/app/native/news_body.py)

新闻正文安全呈现；后台草稿预览与访客详情使用相同HTML和媒体组件标记。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async news_html(sql, value, format, public_options=None)` | 仅装饰已收录且有效的PDF链接；不查外链，不输出对象路径或任何管理字段。 |

### [backend/app/native/operation_logs.py](../backend/app/native/operation_logs.py)

只读日志列表、详情与有界CSV/JSON导出；复用内容筛选和账号事务门禁。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Logs.__init__(self, r)` | 接收请求内的原生内容、认证和SQL适配器。 |
| `Logs.query(self, query)` | 仅允许可展示列参与筛选排序，详情JSON不作为搜索或排序的旁路。 |
| `async Logs.listing(self, query=None, include_detail=False, ceiling_id=None)` | 只读取白名单列和有限文本，每页最多100条；长详情不会进入普通列表。 |
| `async Logs.get(self, uid)` | 读取一个脱敏日志，不自动更改状态，也不返回原始JSON。 |
| `async Logs.export(self, query)` | 固定最大ID后分批编码；默认2万条、含详情5千条，交付前再次核对权限。 |
| `Logs.export.append(data)` | 编码后检查24MiB硬上限，超限时不交付部分成功文件。 |
| `Logs.export.csv_line(values)` | 复用备份CSV的公式防护，为单行分配短期缓冲。 |

### [backend/app/native/ordering.py](../backend/app/native/ordering.py)

Allow only existing editable ordering fields through the shared row action.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `patch(table, field, value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/permissions.py](../backend/app/native/permissions.py)

Role editor grouping and action dependencies over the existing permission columns.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `groups()` | Use readable module names from the shared registry; keep all 20 grants in one form. |
| `validate(permissions)` | Reject orphan actions before any role, grant or audit write; do not rewrite old roles on reads. |
| `lock_references(principal, specs, row)` | Keep inaccessible related fields out of the save payload and avoid reading their labels. |

### [backend/app/native/public_actions.py](../backend/app/native/public_actions.py)

Public registration/contact writes use native accounts, messages and bounded action throttles.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async throttle(sql, action, network, identity)` | Count attempts before work; retain no raw client address or submitted secret. |
| `async register(r, data, network)` | Create an ordinary registered role account only while registration is enabled. |
| `async contact(r, data, network, new_uid=None, before=(), after=())` | Store visitor messages privately; moderation fields cannot be supplied by visitors. |

### [backend/app/native/public_auth.py](../backend/app/native/public_auth.py)

Public authentication presentation over the existing Auth and registration services.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `safe_next(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `install(app, resources, render)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.presentation(request, r, mode, data=None, message='', status=200)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.auth_get(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /auth/login；GET /auth/register |
| `async install.auth_post(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /auth/login；POST /auth/register |

### [backend/app/native/public_cache_admin.py](../backend/app/native/public_cache_admin.py)

Authenticated module maintenance; no content reads, warming, or direct cache access.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, csrf)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.reset(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/admin/public-cache/reset |

### [backend/app/native/public_cache_tags.py](../backend/app/native/public_cache_tags.py)

公开依赖标签和提交后失效计划；只有受控模块/记录/导航标签。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `record_tag(table, uid)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `module_tag(table)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `navigation_tag(slug)` | Language-independent opaque tag for one configured URL name. |
| `navigation_tags(*rows)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `page_tags(request)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `data_tags(table)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `valid_tag(tag)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Plan.add(self, tags, hard=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Plan.merge(self, other)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Plan.payload(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Plan.payload.bounded(tags)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Plan.__bool__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `validate_payload(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `change_plan(table, uid, before, after, deleted=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `mutation_hint(table, uid, before, after, deleted=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `statements_plan(statements)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `CommittedChanges.__init__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async CommittedChanges.record(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `CommittedChanges.__enter__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `CommittedChanges.__exit__(self, *exc)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async record_commit(statements)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async after_commit(sql, statements)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `reset_plan(module)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_citations.py](../backend/app/native/public_citations.py)

Bounded saved-citation reader; no generation, translation or writes.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async saved_citations(content, style, uids, *, fixed_conditions=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_contact.py](../backend/app/native/public_contact.py)

Presentation helpers only; public_actions retains validation, throttle and save.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `error_text(message, lang)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `form_values(data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async news_source(r, uid)` | One source resolver for embedded forms and submissions; never widen public scope. |
| `async form_context(r, lang, values=None, news=None, strict=True)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_data.py](../backend/app/native/public_data.py)

Bounded public list projections; full details still use the existing authorized reader.

| 函数/方法（实际参数） | 用途 / 路由 |
| --- | --- |
| `project_private_allowed(principal)` | Use the live system-role marker, never a role name or a client flag. |
| `citation_style(site)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `page_number(value)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `home_limit(table, site)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `validate_listing_query(table, query, home=False)` | Pure validation shared by the early validator and normal list execution. |
| `async public_listing(r, table, query, site=None, home=False, profile_overview=False, *, fixed_conditions=None)` | One SQL page per request; home totals cap all subsequent pages as well as the first. |
| `async public_site_options(r)` | One raw public projection per request; return copies before translation/render mutation. |
| `async public_media_map(r, data)` | Resolve referenced public keys once per request, including MIME and missing results. |
| `trim_snippets(row, table=None)` | Trim only after exact-source translation lookup; never hash a shortened original. |
| `facet_column(table, field)` | Only trusted catalog fields may become SQL identifiers. |
| `year_expression(column)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `facet_parts(column, source='')` | Same ; / fullwidth ; / CR / LF delimiters as existing history suggestions. |
| `public_filter(table, field, value)` | Public-only predicates, shared with the facet catalog. Admin equality is unchanged. |
| `async people_facet(content, table, field, page=1, *, fixed_conditions=None, lang='zh')` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `async people_facets(content, table, *, fixed_conditions=None, lang='zh', query=None)` | 由所属路由/模块调用，参数及权限按源码处理。 |

### [backend/app/native/public_descriptions.py](../backend/app/native/public_descriptions.py)

Read one public description on demand; no private columns or writes.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async public_description(content, lang, table, uid, *, fixed_conditions=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_footer.py](../backend/app/native/public_footer.py)

Safe footer HTML and configured links; source text is never a template program.

| 函数/方法（实际参数） | 用途 / 路由 |
| --- | --- |
| `safe_href(value, mail=True)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `navigation_link(row, lang)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `async navigation(r, lang)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `footer_html(value, links_html='')` | Sanitize every render (including translations/imports), then fill one controlled slot. |

### [backend/app/native/public_home.py](../backend/app/native/public_home.py)

Homepage shell: only faculty is read; enabled modules start at page zero.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async homepage_rows(r, site)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_http_cache.py](../backend/app/native/public_http_cache.py)

HTTP safety helpers; media validators and identity display remain independent.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `no_store(response)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `matches_etag(value, etag)` | GET/HEAD weak comparison; malformed or oversized lists fall back to 200. |
| `identity_fingerprint(principal)` | Display fingerprint includes live permissions, not just session identity. |
| `verified_navigation(request)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `successful_page(request, response)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `finish(request, response, *, public_ok=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_navigation.py](../backend/app/native/public_navigation.py)

Server-owned public navigation scope and bounded ASCII visitor query state.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `visible_scopes(principal)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async load(r, slug)` | Read one configured row for this request; no persistent SQL cache. |
| `async resolve(r, slug, table=None, stamp=None, *, row=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async api_scope(r, params, table)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `_pairs(items)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `encode_state(values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `query_url(path, query)` | Only visitor text filters are encoded; numeric pagination stays inspectable. |
| `visitor_query(params, table, *, scoped=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `list_return(value, list_path, table, scope=None)` | Accept only a relative return to this list; switch its language with the detail. |
| `query_identity(query)` | Detect mixed fragments; this identifier is not a permission or fixed-scope token. |

### [backend/app/native/public_read_api.py](../backend/app/native/public_read_api.py)

固定公开 JSON 端点；install 注册，generate 产生模型，successful_data 核验缓存边界。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `error_reply(status, code)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `invalid_request(request)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `successful_data(request, response)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `_encode(model)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async generate(request, r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `install(app, factory)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.public_data(request: Request, lang: str, table: str)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/public/data/{lang}/{table}；HEAD /api/public/data/{lang}/{table} |

### [backend/app/native/public_read_model.py](../backend/app/native/public_read_model.py)

完整匿名粗粒度公开模型；build 接受模块/语言和受限预算，不接受任意 query。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ModelLimits.__post_init__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `ModelUnavailable.__init__(self, reason)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `_Reads.__init__(self, sql, limits)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async _Reads.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `_json(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `_field_limit(field, limits)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `_check_fields(row, limits)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `_web_link(value, field='')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async _rules(reads, limits)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async _english(reads, table, rows, limits)` | Batch exact-source lookups, preserving local stop/manual/explicit winners. |
| `async _media(reads, table, rows)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `_tokens(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async build(r, table, lang, *, limits=None)` | Generate a complete module/locale index; never accept visitor queries/principals. |
| `build.projected(field)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/native/public_revision.py](../backend/app/native/public_revision.py)

保留现有原生 revision 支持；不代表恢复 revision 分片 Public 缓存。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `revision_write(statements)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async revision(sql)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_seo.py](../backend/app/native/public_seo.py)

Public-only, bounded sitemap slices using the same visibility rules as HTML.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `xml(kind, urls)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `robots(origin)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async stats(r, table)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async index(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async chunk(r, table, part)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_session.py](../backend/app/native/public_session.py)

身份摘要与受权项目私有字段；页面共享数据和真实权限分开。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `session_summary(p)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `denied(message, status)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `install(app, factory)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.identity(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.summary(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/public/session-summary |
| `async install.project_fields(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/public/admin-project-fields |

### [backend/app/native/public_students.py](../backend/app/native/public_students.py)

Public student grouping: configured order, first matching enabled rule, SQL pagination.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async rules_for(content)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `group_expression(rules)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `annotate(rows, rules)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/public_translation.py](../backend/app/native/public_translation.py)

Read-only effective English predicates and facet labels, sharing cache winner rules.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ctes(sql, values=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `effective(table, field)` | Scalar expression: local stop/manual/explicit, then conflict-free shared, then local. |
| `search(table, term, sql)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async facet_labels(content, table, field, values, fixed_conditions=None)` | At most one option batch; raw values remain keys even when labels collide. |

### [backend/app/native/publication_metadata.py](../backend/app/native/publication_metadata.py)

有界 DOI 标准化与 Crossref 字段裁剪，只产生可核对的建议，不写论文。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `normalize_doi(value)` | 接受 DOI 或 doi.org 链接，限制长度和字符，避免将任意地址交给服务适配器。 |
| `bounded_fields(fields, doi=None)` | 裁剪外部或缓存字段，忽略空值和错误类型，不提供可执行链接及数据库额外字段。 |
| `crossref_fields(payload, doi=None)` | 提取 Crossref 的有限作者、题名和卷期页，兼容缺失日期；异常结果返回可读错误。 |
| `crossref_fields.first(value)` | 仅从有效数组读取首项，防止字符串被截成单个字符。 |

### [backend/app/native/runtime.py](../backend/app/native/runtime.py)

Local runtime composition uses the same service contracts as Worker bindings.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `local(settings=None)` | Resolve configured addresses once; no example data or accounts are inserted here. |

### [backend/app/native/schema_migrations.py](../backend/app/native/schema_migrations.py)

Single accepted website predecessor, retained CLI contract.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `statements_for(version)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `apply(connection, version)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/schema_sources.py](../backend/app/native/schema_sources.py)

One current installer; immutable snapshots serve legacy compatibility and verification.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `initialization_sql(kind='teacher')` | Current shared database uses schema.sql; old standalone fixtures use their snapshot. |
| `current_objects()` | Read exact executable DDL from the sole installer, not another maintained SQL copy. |

### [backend/app/native/schema_upgrade.py](../backend/app/native/schema_upgrade.py)

Automatic exact-baseline upgrade with stopped-writer lock and SQLite backup.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `migrate(db)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `migrate.schema()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/native/service_config.py](../backend/app/native/service_config.py)

Shared native provider-list and form rules; defaults never write settings at startup.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `provider_settings(values, default_field, list_field, providers, recommended)` | Resolve an empty original config; retain explicit defaults, order and disabled sources. |
| `provider_form(data, prefix, list_field, providers)` | Convert shared checkboxes/order into the existing JSON array, including without JS. |

### [backend/app/native/service_jobs.py](../backend/app/native/service_jobs.py)

Short site-wide network leases in the existing native guard table, not a worker daemon.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async network_lease(r, kind, module, action='edit')` | Serialize translation/test calls across local processes and Worker requests for 180 seconds. |

### [backend/app/native/service_tools.py](../backend/app/native/service_tools.py)

Explicit settings-draft connection tests reuse provider executors without saving data.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ServiceTools.__init__(self, r)` | Keep authorization, settings and transports within the current authenticated request. |
| `async ServiceTools.current(self, uid, stamp)` | Require the current editor record/version before using any stored credential. |
| `async ServiceTools.test(self, family, provider, uid, stamp, values)` | Send only a fixed short sample with selected draft config; no content or config writes. |

### [backend/app/native/session_admin.py](../backend/app/native/session_admin.py)

会话管理HTTP适配：共享身份、CSRF、固定导航及局部模板，不刷新账号草稿。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `panel(r, model, nav='', nav_stamp='')` | 渲染共用会话片段；分页URL仅含白名单筛选及ASCII导航标识。 |
| `panel.page_url(page)` | 为同一会话区保留筛选、页大小和导航条件，返回片段读取地址。 |
| `install(app, resources, csrf, resolve, navigation_stamp, check_navigation_current)` | 注册独立会话端点；身份在每次读取/写入时重新取得。 |
| `async install.listing(request: Request, uid: str)` | 重新授权并返回一页HTML，供账号单页中的刷新、筛选和分页复用。；路由：GET /api/admin/accounts/{uid}/sessions |
| `async install.revoke(request: Request, uid: str)` | 只接受显式撤销动作；账号和导航版本、会话权限、审计在同一写事务检查。；路由：POST /api/admin/accounts/{uid}/sessions/revoke |

### [backend/app/native/sessions.py](../backend/app/native/sessions.py)

原生账号会话的有界展示和原子撤销；复用账号权限，不另建身份或设备模型。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Sessions.__init__(self, r)` | 接收同一请求内的认证、内容服务与 SQLite/D1 适配器。 |
| `async Sessions.account(self, uid, base=None)` | 按既有系统管理员、账号查看/编辑权限及可见范围核对目标账号。 |
| `async Sessions.listing(self, uid, query=None, base=None)` | 分页展示非敏感会话字段，过期状态由两个期限计算，不以读操作修改历史。 |
| `async Sessions.revoke(self, uid, stamp, mode, selected=None, base=None, navigation=None)` | 以账号版本及事务授权撤销会话；所选最多100条，全部模式在SQL内执行且不载入历史。 |

### [backend/app/native/source_links.py](../backend/app/native/source_links.py)

授权来源的可读名称、精确字段链接和只读降级；不从客户端接受任意表名。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `field_link(principal, table, uid, field)` | 仅为已授权记录生成白名单字段锚点；调用方负责记录可见范围检查。 |
| `async translation_context(r, translation)` | 核对当前来源后返回标题、字段与状态；受限来源不泄露名称或位置。 |

### [backend/app/native/storage.py](../backend/app/native/storage.py)

Local/R2 media and cache stores use independent configured locations, without SQL helper tables.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `key_path(key)` | Object keys are relative ASCII paths, never user-supplied filesystem addresses. |
| `LocalStore.__init__(self, root)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `LocalStore.path(self, key)` | Reject symlink escape in every path component. |
| `async LocalStore.put(self, key, data)` | Atomic replace within the configured store; files are private to the OS owner. |
| `async LocalStore.get(self, key, max_bytes=None)` | 读取对象；可选上限最多读取限制加一字节，避免错误登记导致无界预览。 |
| `async LocalStore.delete(self, key)` | 删除指定存储键对应的对象，忽略已不存在的对象。 |
| `R2Store.__init__(self, bucket, prefix)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async R2Store.put(self, key, data)` | Bounded whole-object upload; authoritative metadata is committed after R2 succeeds. |
| `async R2Store.get(self, key, max_bytes=None)` | 先核对R2返回的实际字节大小，可选上限在读取对象正文前生效。 |
| `async R2Store.delete(self, key)` | 删除指定存储键对应的对象，忽略已不存在的对象。 |

### [backend/app/native/student_categories.py](../backend/app/native/student_categories.py)

学生分类关键词与有界匹配查询；预览只读，不修改学生或分类记录。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `parse_keywords(value)` | 拆分并去重关键词，限制查询规模；英文忽略大小写，中文按原文包含匹配。 |
| `page_numbers(page, pages)` | 生成首末页和当前页附近的按钮，避免为大结果集创建无界数量的DOM节点。 |
| `async match_page(content, principal, keywords, query=None)` | 在可见学生范围内计数并分页，仅返回当前页的名单字段；特殊字符按字面匹配。 |

### [backend/app/native/suggestions.py](../backend/app/native/suggestions.py)

统一历史字段白名单和有界只读建议，复用原生权限与固定导航范围。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `split_values(value)` | Stable display tokens: semicolons/line breaks, never commas. |
| `normalized(value)` | 统一宽窄字符、大小写和空白，用于候选去重、已选项排除和片段比较。 |
| `suggestion_catalog(principal)` | 向表单和词库提供同一字段目录，仅包含当前账号有查看权限的模块。 |
| `async suggestions(content, principal, data, base=None)` | 从最近至多300条匹配记录中提取至多50个建议；SQL投影只读取目标字段。 |

### [backend/app/native/time_fields.py](../backend/app/native/time_fields.py)

UI timezone conversion only; stored timestamps and API UTC semantics stay unchanged.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `zone(name)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `local_value(value, name=DEFAULT_ZONE)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `to_utc(value, name, fold='')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `form_times(table, data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/translation_batch.py](../backend/app/native/translation_batch.py)

Browser-driven translation over native JSON fields, with bounded serial provider packets.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `metadata(row)` | Read bounded scheduler annotations while retaining the native source reference array. |
| `encoded_metadata(row, values)` | Keep other source metadata, replacing only this scheduler's bounded annotation. |
| `eligible_sql(table)` | Reuse native public gates as transaction-time predicates, with no private text projection. |
| `TranslationBatch.__init__(self, r)` | Use current request authorization and the same SQL/media/translation adapters on both platforms. |
| `async TranslationBatch.load(self)` | Read the single job without writing defaults or disclosing service credentials. |
| `TranslationBatch.own(self, state, admin=False)` | Restrict control to the initiator; system administrators may pause another user's job. |
| `async TranslationBatch.status(self)` | Expose only counters to other users and hide recent source links after permission removal. |
| `async TranslationBatch.write(self, row, state, extra=(), condition='1', args=(), action='edit', audit='translation-step')` | Atomically compare the whole job and settings timestamp, then save state plus bounded effects. |
| `TranslationBatch.guard(self, state, table=None, source=None, field=None)` | Fence an in-flight result by its job claim and current public source, including manual English. |
| `async TranslationBatch.action(self, action, job_id='', rev=None, modules=None, provider='default')` | Create, resume, pause or explicitly retry a finite scan/run plan; never translate on GET. |
| `async TranslationBatch.step(self, job_id, rev)` | Claim and advance exactly one field/cache row/translation; a lost response can resume safely. |
| `TranslationBatch.cache_statements(self, state, item, patch, table=None, source=None, field=None, observed=None)` | Prepare one guarded cache mutation for a standalone or shared checkpoint transaction. |
| `async TranslationBatch.cache_write(self, state, item, patch, table=None, source=None, field=None, observed=None)` | Persist a pre-request attempt or scan annotation through the shared guarded mutation. |
| `async TranslationBatch.activate(self, state, item, table, source, field, donor=None)` | Reactivate exact results or reuse public automatic text with native media and donor guards. |
| `async TranslationBatch.scan(self, state)` | Advance a keyset/field cursor under fixed start IDs; never gather all source bodies. |
| `async TranslationBatch.reconcile(self, state)` | Invalidate changed/withdrawn sources or explicitly requeue this job's non-manual failures. |
| `async TranslationBatch.donor(self, item, table, source, field)` | Delegate all exact/manual/source rules to the same service as queue and single translation. |
| `TranslationBatch.selection(self, state)` | Share the exact pending set between execution and wait/completion checks. |
| `async TranslationBatch.run(self, state)` | Run one due item; reuse results, bound retries and checkpoint before contacting a provider. |
| `async TranslationBatch.invalidate(self, uid, stamp)` | Explicitly disable a current cache; scans respect that choice until a manual save restores it. |

### [backend/app/native/translation_config.py](../backend/app/native/translation_config.py)

Five translation presets over native fields, with deployment secrets taking precedence.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `credentials(source)` | Read a fixed set of backend-only variables without exposing their values in UI DTOs. |
| `allowed_hosts(source)` | Custom translation hosts require an explicit deployment allowlist, not a form URL alone. |
| `endpoint(value, default)` | Retain a public HTTPS base path but reject userinfo, queries, fragments and custom ports. |
| `parse_settings(values, secrets=None)` | Use MyMemory when empty; a previously configured Google key retains the old effective default. |
| `async load_settings(r)` | Read only the earliest global settings row and resolve backend-only effective credentials. |
| `form_settings(data)` | Reuse the native shared checkbox/order parser for the five translation services. |
| `availability(config, provider, hosts=())` | Separate disabled, missing credentials and unapproved custom hosts before sending text. |
| `display_options(r, config)` | Return effective addresses and credential presence, never key contents or contacts. |
| `async page_options(r, values=None)` | Decorate settings with stored-key presence while retaining an invalid draft for repair. |

### [backend/app/native/translation_group_admin.py](../backend/app/native/translation_group_admin.py)

Authorized grouped translation review routes; source versions remain individually editable.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, render, csrf, resolve, navigation_stamp)` | Register review reads and explicit version adoption before the generic module routes. |
| `async install.detail(request: Request, uid: str)` | Render paged sources within the caller's original filters, with no provider calls or writes.；路由：GET /admin/translation-groups/{uid} |
| `async install.choose(request: Request, uid: str)` | Adopt an explicitly reviewed donor for one pending row; no implicit group-wide overwrite.；路由：POST /api/assistance/translation-groups/{uid}/choose |
| `async install.translate_one(request: Request, uid: str)` | One explicit source, constrained by the same group/filter ACL; reuse the guarded service.；路由：POST /api/assistance/translation-groups/{uid}/translate |

### [backend/app/native/translation_groups.py](../backend/app/native/translation_groups.py)

SQL-first translation grouping, scoped sources, review choices and bounded exports.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `pattern(value)` | Escape LIKE metacharacters rather than treating search text as a query language. |
| `TranslationGroups.__init__(self, r, query=None, base=None)` | Retain the same filters for list, sources, explicit reuse and export. |
| `TranslationGroups.categories(self)` | Offer only source modules the current role can open; multiple selections mean OR. |
| `TranslationGroups.predicate(self)` | Intersect source ACL, fixed navigation and user filters before grouping/pagination. |
| `TranslationGroups.cte(self)` | Keep aggregation in SQLite/D1; Python receives only this page's bounded previews. |
| `async TranslationGroups.listing(self)` | Count complete groups then page, never grouping only a fetched 100-row slice. |
| `TranslationGroups.url(self, uid, page=1)` | Carry the complete list scope into source/history review, retaining a no-JavaScript link. |
| `async TranslationGroups.sources(self, refs)` | Resolve readable titles with bounded per-table IN queries, not one source query per cache. |
| `async TranslationGroups.anchor(self, uid)` | An opaque representative is only an identity hint; it cannot bypass the current filters. |
| `async TranslationGroups.members(self, uid, page=1, size=10)` | Page preserved source/history rows of one exact group under the same source scope. |
| `async TranslationGroups.choose(self, uid, donor_uid, donor_stamp, target_uid, target_stamp, nav_guard=None)` | Explicitly adopt a reviewed version for one selected pending source, retaining all manual variants. |
| `async TranslationGroups.export(self)` | Export complete matching groups, or selected groups, with 10-row reads and a 4 MiB cap. |

### [backend/app/native/translation_http.py](../backend/app/native/translation_http.py)

Shared bounded HTTP contract for translation adapters; no redirects or arbitrary destinations.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `validate_request(request, hosts=())` | Validate a generated request again at the I/O boundary, binding keys to its provider. |
| `decode_response(body)` | Reject oversized/malformed JSON before any provider-specific field extraction. |

### [backend/app/native/translation_index.py](../backend/app/native/translation_index.py)

Native cache identities, source visibility and live reuse predicates; no materialized index.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `format_sql(alias='t')` | Use saved format; legacy variable-format bodies stay separate until explicitly reviewed. |
| `stored_format(row)` | Read the immutable format annotation, without assuming the current body format was historical. |
| `source_match(table, alias='t', live=False, allowed_fields=None)` | Build allowlisted joins to real native fields, optionally requiring exact still-live source bytes. |
| `source_scope(principal, alias='t', live=False, orphans=False, allowed_fields=None)` | Bounded SQL scope checks all eligible sources before LIMIT, including older donor candidates. |
| `identity(row, alias='t')` | Exact source bytes/languages/format accompany the digest; hash collisions cannot merge texts. |
| `usable_candidates(principal, alias='d', allowed_fields=None)` | One eligibility predicate for list summaries, public reads and saved reuse. |
| `candidate_order(alias='d')` | Keep the established manual-first, newest-record ordering deterministic. |
| `ranked_candidates(principal, source='translation_cache', extra='1', allowed_fields=None)` | Rank whole exact groups in SQL, retaining competing manual-text evidence. |

### [backend/app/native/translation_multi.py](../backend/app/native/translation_multi.py)

Serial, bounded multi-document translation; completed documents are delivered immediately.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async execute_many(r, items, provider='default', config=None, hooks=None, max_segments=256)` | Pack equal-language/format text nodes, preserve successful documents, and split malformed packets. |
| `async execute_many.deliver(index, result)` | Only final whole-document results leave this executor; callbacks can commit before another HTTP. |
| `async execute_many.complete()` | A partial document cannot overwrite its cache, even if some earlier packets succeeded. |

### [backend/app/native/translation_packed_batch.py](../backend/app/native/translation_packed_batch.py)

Packed scheduling with native per-source commits and a bounded in-flight request journal.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async statistics(r, state)` | Count scan-tagged source records and distinct originals in SQL, including already reused rows. |
| `PackedBatch.__init__(self, batch, state)` | One request owns at most twelve source rows and one bounded provider lease. |
| `async PackedBatch.current(self)` | Refresh counters after concurrent pause/settings edits while preserving the original claim fence. |
| `async PackedBatch.valid(self, item, source_state=None)` | Read exact cache/source snapshots; changed or inaccessible sources never enter a new packet. |
| `async PackedBatch.eligible(self, index)` | A document can proceed when at least one captured source is still eligible. |
| `async PackedBatch.before(self, indices, provider)` | Persist request intent and source attempts before HTTP; pause prevents further packets. |
| `async PackedBatch.after(self, indices, provider, received, uncertain)` | Record whether a response arrived; incomplete documents stay journalled until committed. |
| `async PackedBatch.finish(self, item, source_state, result)` | Commit one complete source result together with its done flag, counters and journal removal. |
| `async PackedBatch.recover(self)` | An expired interrupted request is never replayed implicitly; saved results remain untouched. |
| `async PackedBatch.run(self)` | Reuse first, collect twelve bounded sources, deduplicate documents and send serial packets. |
| `async PackedBatch.run.result(index, value)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/native/translation_packets.py](../backend/app/native/translation_packets.py)

Bounded provider arrays and strict single-text envelopes; request identities never enter logs.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `envelope(texts, nonce)` | Number every boundary, including the end; reject source collisions before sending. |
| `fits(provider, texts, source, target, config)` | Bound item count, characters, UTF-8 text and encoded request body (including framing). |
| `pack(provider, entries, source, target, config)` | Greedily pack indexed pieces; each packet preserves the input order and its exact mapping. |
| `build(provider, texts, source, target, config, nonce=None)` | Use official native arrays; MyMemory alone receives an independently verifiable envelope. |
| `unpack(provider, status, payload, request, target)` | Validate full array cardinality or every ordered boundary before returning any translation. |

### [backend/app/native/translation_reuse.py](../backend/app/native/translation_reuse.py)

One exact, permission-aware reuse service for queue, single translation and batch execution.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `TranslationReuse.__init__(self, r)` | Share native SQL/auth/media adapters; reuse never invokes a provider. |
| `TranslationReuse.candidates(self, item)` | Filter invalid sources in SQL before selecting any donor, without a latest-N cutoff. |
| `async TranslationReuse.donor(self, item, explicit=None)` | Prefer unambiguous manual text; refuse competing manual variants without explicit selection. |
| `async TranslationReuse.apply(self, item, table, source, field, donor, job_guard=None, explicit=False)` | Copy to one non-manual target with source, donor, media, role and conflict CAS in one transaction. |
| `async TranslationReuse.try_reuse(self, item, table, source, field, job_guard=None)` | Reuse only public live sources; hidden/local-only sources never publish a cached donor. |

### [backend/app/native/translation_service.py](../backend/app/native/translation_service.py)

Five providers share text segmentation, finite budgets and safe rich-text reconstruction.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `TranslationFailure.__init__(self, state)` | Store only the public failure code, without carrying an external exception body. |
| `language(value)` | Validate the native language tag before placing it in fixed provider parameters. |
| `chunks(value, limit)` | Split by UTF-8 bytes, preferring sentence/word boundaries without truncating any character. |
| `TranslationDocument.__init__(self, value, is_html, limit, max_segments=MAX_REQUESTS)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `TranslationDocument.handle_starttag(self, tag, attrs)` | Retain sanitized markup; pre/code content remains literal. |
| `TranslationDocument.handle_startendtag(self, tag, attrs)` | Retain sanitized void tags without changing the code nesting state. |
| `TranslationDocument.handle_endtag(self, tag)` | Close existing markup without allowing a provider to add or remove tags. |
| `TranslationDocument.literal(self, value)` | Escape text literals only when reconstructing HTML. |
| `TranslationDocument.handle_data(self, value)` | Preserve URLs and whitespace, deduplicate identical segments within this one call. |
| `TranslationDocument.segment(self, value)` | Keep paragraph whitespace outside translated payloads and enforce the segment byte limit. |
| `TranslationDocument.chunked(self, value)` | Register finite byte-bounded pieces from a single paragraph line. |
| `TranslationDocument.render(self, translated)` | Build all-or-nothing text, escaping provider markup and bounding the final document. |
| `request_for(provider, text, source, target, config)` | Build the provider's official language/auth/body mapping without exposing credentials. |
| `extract(provider, status, payload)` | Validate successful text and map auth/limit errors without returning vendor messages. |
| `TranslationService.__init__(self, r)` | Reuse the current request's backend transport and effective configuration. |
| `async TranslationService.execute_many(self, items, provider='default', config=None, hooks=None)` | Translate bounded independent documents with native arrays and per-result checkpoint hooks. |
| `async TranslationService.execute(self, text, source='zh', target='en', provider='default', is_html=False, config=None)` | Try one provider unless fallback was explicit; no partial result or automatic retries. |

### [backend/app/native/translation_sources.py](../backend/app/native/translation_sources.py)

公开原文来源、原生英文字段与有界英文批量覆盖；overlay兼容单条调用，overlay_many按当前页读取胜出译文，无写入/服务调用。

| 函数/方法（实际参数） | 用途 |
| --- | --- |
| `reference(table, uid, field)` | Construct a source key from native table/field allowlists, retaining colon-bearing UIDs. |
| `split_reference(value)` | Decode a source reference without accepting arbitrary SQL identifiers. |
| `public_source(table, row)` | Apply public/active/published gates before any automatic provider request. |
| `manual_english(table, row, field)` | Prefer explicitly maintained native English fields over all automatic caches. |
| `source_format(table, row, field)` | 缓存复用区分纯文本、Markdown和HTML，不能只判断是否HTML。 |
| `html_source(table, row, field)` | Only news HTML body fields require structural translation and media validation. |
| `candidate(table, row, field)` | Classify empty, manual, English-only and oversized text without transmitting it. |
| `_overlay_slots(table, rows)` | Capture each row's original field hashes before changing any presentation text. |
| `async _overlay_batch(sql, batch)` | Two bounded winner queries; local selection keeps the single-row hash scope. |
| `async overlay_many(sql, table, rows)` | Mutate only these presentation rows, preserving native English and exact-source rules. |
| `async overlay(sql, table, row)` | Compatible single-record entry; share the same bounded selection implementation. |

### [backend/app/native/web.py](../backend/app/native/web.py)

主站路由组合；通过 create_full_app/create_public_app/create_admin_app 建立应用。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `create_full_app(factory, static_root=None, *, lazy_sync=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `create_app(factory, static_root=None, *, lazy_sync=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `create_public_app(factory, static_root=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `create_admin_app(factory, static_root=None, *, lazy_sync=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/web_admin.py](../backend/app/native/web_admin.py)

后台界面和辅助 API；install 仅注册一次，闭包处理器由 FastAPI 调用。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, factory, resources, csrf, render, *, lazy_sync=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.logout(request: Request)` | 撤销会话并清理浏览器登录Cookie。；路由：POST /auth/logout |
| `async install.password_get(request: Request)` | 显示当前登录用户的修改密码页面。；路由：GET /auth/password |
| `async install.password_post(request: Request)` | 校验旧密码并更新密码摘要，撤销先前会话。；路由：POST /auth/password |
| `async install.dashboard(request: Request)` | 显示用户可访问模块的后台概览。；路由：GET /admin |
| `async install.dashboard_counts(request: Request)` | One browser request, sequential scalar queries, no lists or shared cache.；路由：GET /api/admin/dashboard-counts |
| `async install.resolve(request, r, table=None, nav=None)` | 解析普通模块或自定义导航，并取得固定筛选范围。 |
| `install.navigation_stamp(r, value)` | 拒绝持有旧导航条件的编辑或快捷操作；缺少版本也不能继续写入。 |
| `async install.check_navigation_current(r)` | 导出交付前复核导航仍启用且未变化，避免输出旧固定范围。 |
| `async install.list_page(request, table=None, nav=None)` | 以同一模板输出完整页或列表片段，重新核验授权、固定范围并校正实际页码。 |
| `install.list_page.page_url(page)` | 保留当前筛选参数并生成目标页码链接。 |
| `async install.custom_list(request: Request, nav: str)` | 按照自定义导航的固定条件显示授权范围内的列表。；路由：GET /admin/n/{nav} |
| `async install.transfer_admin(request: Request)` | 显示独立快传管理入口和身份桥接说明。；路由：GET /admin/transfer |
| `async install.export(request: Request, table: str)` | 导出当前权限及筛选范围内的列表数据。；路由：GET /admin/{table}/export |
| `async install.editor(request: Request, table: str, uid: str=None)` | 显示原生字段对应的单页分区编辑表单。；路由：GET /admin/{table}/new；GET /admin/{table}/{uid}/edit |
| `async install.save(request: Request, table: str)` | 验证表单、权限和更新时间后保存整个记录。；路由：POST /admin/{table}/save |
| `async install.news_body_preview(request: Request)` | 只读草稿预览或显式格式转换，复核新闻权限、更新时间和固定导航范围。；路由：POST /api/assistance/news-body |
| `async install.news_body_preview.check_source()` | 返回前再次核对当前版本；预览不能跨过固定范围或旧编辑版本。 |
| `async install.navigation_assistance(request: Request)` | 解析导航草稿或预览授权记录；元信息解析和数据读取分别检查所需权限。；路由：POST /api/assistance/navigation |
| `async install.student_matches(request: Request)` | 为当前分类草稿返回同一模板生成的匹配页；检查分类编辑及学生查看权限。；路由：POST /api/assistance/student-matches |
| `async install.row_action(request: Request, table: str, uid: str)` | 复用事务写入后回读开关与原生时间戳，使连续快捷操作使用最新实际值。；路由：POST /api/admin/{table}/{uid} |
| `async install.history_page(request: Request)` | 显示按模块和字段查询的历史词库，与表单共用权限目录。；路由：GET /admin/translation/suggestions |
| `async install.history_suggestions(request: Request)` | 核验会话/CSRF和导航上下文，返回有界历史字段候选，不保存内容。；路由：POST /api/assistance/suggestions |
| `async install.metadata_page(request: Request)` | 独立只读检索页复用编辑器的查询组件；不隐式创建论文。；路由：GET /admin/publications/metadata |
| `async install.publication_profile(request: Request)` | 为当前论文草稿重新提取公开精选教师；复用论文辅助的授权及导航检查。；路由：POST /api/assistance/publication-profile |
| `async install.metadata(request: Request)` | 查询DOI/题名候选和尝试状态；保留旧DOI服务入口的字段返回形态。；路由：POST /api/assistance/metadata |
| `async install.translation(request: Request)` | 为选定原生字段建立带来源摘要的翻译任务。；路由：POST /api/assistance/translation |
| `async install.translate(request: Request)` | 执行指定翻译任务并按版本更新原生翻译记录。；路由：POST /api/assistance/translate |
| `async install.service_test(request: Request)` | Test one selected draft provider with a fixed sample, without saving settings or content.；路由：POST /api/assistance/services/test |
| `async install.translation_batch_page(request: Request)` | Render one shared batch workspace; no scanning or external calls occur on page load.；路由：GET /admin/translation_cache/batch |
| `async install.translation_batch_status(request: Request)` | Read authorized progress without resuming a browser-driven job.；路由：GET /api/assistance/translation-batch/status |
| `async install.translation_batch_action(request: Request, operation: str)` | Apply CSRF and strict payload contracts before a bounded job action or single step.；路由：POST /api/assistance/translation-batch/{operation} |
| `async install.translation_invalidate(request: Request)` | Explicitly disable a cache under its native timestamp and edit permission.；路由：POST /api/assistance/translation-invalidate |
| `async install.upload(request: Request)` | 检查上传权限和配额后保存媒体正文及元数据。；路由：POST /api/admin/media/upload/file |
| `async install.listing(request: Request, table: str)` | 返回查询后的原生模块记录和分页信息。；路由：GET /admin/{table} |
| `async install.media_trash(request: Request)` | 回收站入口复用媒体列表的检索、列设置与分页。；路由：GET /admin/media/trash |
| `async install.media_inspect(request: Request, uid: str)` | 显示媒体预览、元数据和按模块权限分页的真实使用位置。；路由：GET /admin/media/{uid}/inspect |
| `install.media_inspect.page_url(page, source=None)` | 引用页码链接保留当前来源分组。 |
| `async install.media_usage_summaries(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/admin/media/usage-summaries |
| `async install.media_locations(request: Request, uid: str)` | 列表内分页读取真实使用位置，每次重新校验媒体与来源权限。；路由：GET /api/admin/media/{uid}/locations |
| `install.media_locations.page_url(page, source=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.media_preview(request: Request, uid: str)` | 媒体库和回收站复用有界预览接口。；路由：GET /api/admin/media/{uid}/content；HEAD /api/admin/media/{uid}/content |
| `async install.transfer_login(request: Request)` | 本地返回同站快传；旧Worker适配保留原桥接。；路由：GET /transfer/login |
| `create_admin_app(factory, static_root=None, *, lazy_sync=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/native/web_common.py](../backend/app/native/web_common.py)

Request resources, validation and HTTP policy shared by both route groups.

| 函数/方法（实际参数） | 用途 / 路由 |
| --- | --- |
| `async payload(request, limit=500000)` | Bound request size and reject duplicate form/JSON keys before dispatch. |
| `payload.pairs(items)` | 为访客模板组织有值的原生字段标签及内容。 |
| `shared_public_route(request)` | Standard shared HTML allowlist; form-bearing news is checked separately. |
| `worker_public_read(request, r)` | Only Worker public read routes; media, forms, auth, admin and writes stay full. |
| `create_base(factory, static_root=None, *, areas=('shared', 'public', 'admin'), sync_assets=True)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `async create_base.resources(request)` | 按请求复制资源上下文并获取当前身份，防止请求之间串用权限。 |
| `create_base.csrf(request, r, data)` | Require configured origin plus session-bound CSRF, including fetch and multipart alternatives. |
| `async create_base.headers(request, call_next)` | 核对Host并为响应设置安全策略和缓存控制。 |
| `async create_base.unexpected_error(request, exc)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `async create_base.domain_error(request, exc)` | 将业务异常转换为对应状态码及页面或JSON错误。 |
| `async create_base.database_error(request, exc)` | 将数据库约束失败转换为保存冲突提示。 |
| `async create_base.health(request: Request)` | 返回服务就绪信息，供启动器和反向代理检查。；路由：GET '/health/ready'；GET '/health' |

### [backend/app/native/web_context.py](../backend/app/native/web_context.py)

Shared template context; no route registration or task execution.

| 函数/方法（实际参数） | 用途 / 路由 |
| --- | --- |
| `renderer()` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `async renderer.context(r, table='', title='', lang='zh', site_options=None)` | 组合公共页面变量、菜单、身份与模块权限。 |
| `async renderer.render(r, name, table='', title='', **values)` | 使用指定模板与上下文输出HTML。 |

### [backend/app/native/web_public.py](../backend/app/native/web_public.py)

Public routes, installed on an existing application.

| 函数/方法（实际参数） | 用途 / 路由 |
| --- | --- |
| `public_headers(request, r, revision, fragment=False, form=False, safe=False)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `install(app, factory, resources, csrf, render)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `async install.contact_response(r, lang, values=None, message='', success=False, status=200)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `async install.cache_revision(request: Request)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/api/public/cache-revision' |
| `async install.public_form(request: Request, lang: str='en')` | Render public registration/contact with a short-lived form token.；路由：GET '/{lang}/contact' |
| `async install.public_submit(request: Request, lang: str='en')` | Check origin/token, then invoke the native public action with bounded fields.；路由：POST '/{lang}/contact' |
| `async install.media(request: Request, uid: str)` | 公开正文、封面和PDF阅读复用同一鉴权及分段读取接口。；路由：GET '/media/{uid}'；HEAD '/media/{uid}' |
| `async install.transfer_entry(request: Request)` | 本地进入同站快传，旧Worker仍使用显式来源配置。；路由：GET '/transfer' |
| `async install.crawler_rules(request: Request)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/robots.txt' |
| `async install.sitemap_index(request: Request)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/sitemap.xml' |
| `async install.sitemap_home(request: Request)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/sitemap-home.xml' |
| `async install.sitemap_chunk(request: Request, table: str, part: int)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/sitemap-{table}-{part}.xml' |
| `async install.home()` | 将根页面重定向到默认语言首页。；路由：GET '/' |
| `async install.public_description_text(request: Request, lang: str, table: str, uid: str)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/api/public/{lang}/{table}/{uid}/description' |
| `async install.public_saved_citations(request: Request)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/api/public/publications/citations' |
| `async install.public_people_facet(request: Request, table: str, field: str)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/api/public/people/{table}/facets/{field}' |
| `async install.public_navigation_entry(request: Request, lang: str, nav: str, uid: str=None)` | 由所属路由/模块调用，参数及权限按源码处理。；路由：GET '/{lang}/n/{nav}'；HEAD '/{lang}/n/{nav}'；GET '/{lang}/n/{nav}/{uid}'；HEAD '/{lang}/n/{nav}/{uid}' |
| `async install.public(request: Request, lang: str, table: str=None, uid: str=None, nav: str=None)` | 从原生字段组合访客列表、详情、首页和翻译内容。；路由：GET '/{lang}'；HEAD '/{lang}'；GET '/{lang}/{table}'；HEAD '/{lang}/{table}'；GET '/{lang}/{table}/{uid}'；HEAD '/{lang}/{table}/{uid}' |
| `install.public.next_url(t, page)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `install.public.versioned(url)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `install.public.detail_url(t, key)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `install.public.language_url(code)` | 由所属路由/模块调用，参数及权限按源码处理。 |
| `create_public_app(factory, static_root=None)` | 由所属路由/模块调用，参数及权限按源码处理。 |

### [backend/app/ports/diagnostics.py](../backend/app/ports/diagnostics.py)

Optional request diagnostic context for SQL adapters; no feature imports or I/O.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `database(statements)` | Attach only failing SQL fingerprints to an active diagnostic operation; zero extra queries. |

### [backend/app/ports/operations.py](../backend/app/ports/operations.py)

Bounded request-local phase diagnostics; no payloads, credentials or task execution.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `current()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `request_context(**values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `emit(event, **values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `error(exc)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `stage(name, **values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `operation(name)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `operation.decorate(fn)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async operation.decorate.call(*args, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/ports/upload_stream.py](../backend/app/ports/upload_stream.py)

Request-local native upload handle; never retain a body across requests.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `bind(request, binding)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `current()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async put(key, extension, limit, allowed_mimes, validate_bytes, session=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/public_performance.py](../backend/app/public_performance.py)

Single Public policy: successful standard anonymous pages, no application cache.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `PublicPerformance.to_env(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `PublicPerformance.from_env(cls, env=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `public_headers()` | Default for dynamic or unconfirmed responses; successful pages opt in below. |
| `navigation_target(request)` | Only a bare fixed-entry URL; configuration is verified on render MISS. |
| `page_request(request)` | Static allowlist used before platform lookup and after rendering. No D1. |
| `page_headers(request=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `data_target(request)` | Exactly sixteen module/locale URLs. No visitor query or identity lookup. |
| `data_headers()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/resource_budget.py](../backend/app/resource_budget.py)

Conservative per-process cache budgets for Windows, Linux and constrained runtimes.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `memory_snapshot()` | Return physical/container total and available bytes; no optional dependency. |
| `CacheBudget.__init__(self, probe=memory_snapshot, clock=time.monotonic, environ=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `CacheBudget.limits(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `WorkerBudget.limits(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/app/security/http.py](../backend/app/security/http.py)

模块常量/类型及组装代码；通过所属业务入口使用。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `AuthError.__init__(self, status, code, message)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `AuthConfig.from_origin(cls, origin, allowed_origins='')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AuthConfig.from_env(cls, env=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AuthConfig.request_origin(self, request)` | Resolve only an explicitly allowed Host, including behind a TLS proxy. |
| `AuthConfig.origin_matches(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AuthConfig.name(self, kind)` | 根据HTTPS状态选择安全Cookie名称。 |
| `AuthConfig.set_cookie(self, response, kind, value, max_age)` | 写入受HttpOnly、Secure和SameSite约束的Cookie。 |
| `AuthConfig.clear(self, response)` | 清除本服务指定的身份或防伪Cookie。 |
| `AuthConfig.same_origin(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AuthConfig.valid_host(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async payload(request, form=False, limit=16384, max_fields=20)` | 读取有大小限制的表单或JSON正文，并拒绝重复字段。 |
| `payload.no_duplicates(pairs)` | 拒绝表单中重复的字段名，避免参数解释歧义。 |

### [backend/app/security/origins.py](../backend/app/security/origins.py)

Bounded origin parsing shared by runtime and deployment; no application imports.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `normalize_origin(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `parse_origins(origin, values='')` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/app/security/passwords.py](../backend/app/security/passwords.py)

Password format v1; platform KDF implementations, never a home-made KDF.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `validate_password(password)` | 检查密码长度和输入类型，避免无效密码进入派生过程。 |
| `Passwords.__init__(self, derive)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async Passwords.hash(self, password)` | 生成独立随机盐并派生带参数的密码摘要。 |
| `async Passwords.verify(self, password, encoded)` | 按统一参数验证密码；不接受其他迭代次数的哈希。 |

### [backend/app/web/rendering.py](../backend/app/web/rendering.py)

模块常量/类型及组装代码；通过所属业务入口使用。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Renderer.__init__(self, loader, budget=None)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Renderer.local(cls, root)` | 从本地模板目录创建共享Jinja2渲染器。 |
| `Renderer.bundled(cls, templates)` | 从Worker打包的模板字典创建Jinja2渲染器。 |
| `Renderer.render(self, name, **context)` | 使用指定模板与上下文输出HTML。 |

### [backend/cli.py](../backend/cli.py)

Explicit local initialization, account creation, native-schema checks and demo insertion.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async main(argv=None)` | Maintenance always uses the same Settings as the web entrypoint. |

### [backend/entrypoints/vps.py](../backend/entrypoints/vps.py)

Local main service; the configured SQLite runtime lock prevents accidental live reset.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async release()` | Release only this service's database lock when shutdown finishes. |

### [backend/entrypoints/worker.py](../backend/entrypoints/worker.py)

Main Python Worker using configurable D1/R2 bindings and the same native services.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `resource_factory(request)` | Resolve current platform binding names without any local filesystem address assumptions. |

### [backend/maintenance/backup.py](../backend/maintenance/backup.py)

SQLite online backup；恢复必须停止服务、显式目标并通过原生结构核验。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `backup(source, target)` | Create a consistent complete SQLite snapshot; media bodies are independently stored. |
| `restore(source, target)` | Replace a stopped local database from a validated native snapshot, without migration. |
| `main()` | Select configured database and explicit backup/restore file. |

### [backend/maintenance/history.py](../backend/maintenance/history.py)

Historical retention; never delete payloads or change current quota accounting.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `HistoryPolicy.__post_init__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `iso(at)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `History.__init__(self, sql, settings, policy=None, clock=milliseconds)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async History.tick(self, apply=False, after='')` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/maintenance/log_retention.py](../backend/maintenance/log_retention.py)

Portable bounded log pruning: no file adapters, log details or application graph.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async prune(sql, apply=False, batch=20, days=None, cutoff=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async scheduled(sql)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/maintenance/media_uploads.py](../backend/maintenance/media_uploads.py)

Durable, bounded upload recovery queue in the existing service_meta table.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `create(uid, key, owner, stamp=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `fence(name)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `finish(name)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async _move(sql, row, due)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async recover(sql, store, stamp=None, batch=5)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async scheduled(sql, bindings)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/maintenance/monitor.py](../backend/maintenance/monitor.py)

Bounded directory steps and current process measurements; no recursive request scan.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `process_memory()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Monitor.__init__(self, settings)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Monitor.close(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Monitor.step(self, restart=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Monitor.snapshot(self, sql)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [backend/maintenance/policy.py](../backend/maintenance/policy.py)

One validated policy for scheduled, CLI and admin maintenance; existing key/value table.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `validate(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async load(sql)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [backend/maintenance/runtime.py](../backend/maintenance/runtime.py)

Bounded local maintenance. Preview and apply use the same eligibility checks.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Maintenance.__init__(self, sql, settings)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.load(self, key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.save(self, key, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.report_state(self, report)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.file(self, row, apply)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.tick(self, apply=False, batches=1)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.run(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/admin_release.py](../deploy/cloudflare/admin_release.py)

Admin publication uses the existing verified multipart uploader, never linked CI deploy.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `AdminRelease.__init__(self, release, env=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AdminRelease.owned(self, value)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AdminRelease.preflight(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AdminRelease.prepare(self, stage, work)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `AdminRelease.prepare.read()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/admin_sql.py](../deploy/cloudflare/admin_sql.py)

Capture native administrator initialization as offline SQL, without contacting D1.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Capture.__init__(self)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async Capture.query(self, *args)` | 在离线捕获器中模拟空库查询，不连接远程数据库。 |
| `async Capture.batch(self, items)` | 记录原生管理员初始化语句，供离线SQL文件导出。 |
| `async main()` | Prompt for credentials and write private native SQL outside the source tree. |

### [deploy/cloudflare/build.py](../deploy/cloudflare/build.py)

构建 CLI；check/prepare/bundle 等不发布，只有 deploy 经管线发布。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `log(stage, message, **values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `git_value(*args)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `check_lock(project, manifest, lock)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `preflight(env=None, version=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `run_stage(name, command, cwd, env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `dependency_environment(dependencies)` | Create disposable dependencies outside the checkout; clean even after failures. |
| `main(argv=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/cloud_check.py](../deploy/cloudflare/cloud_check.py)

Read-only platform configuration checks; no upload, SQL or Cron mutation.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `check(env, config, log, report_path=None, *, client=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/companion_release.py](../deploy/cloudflare/companion_release.py)

Publish authorized private companion Workers through the Cloudflare API.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `APIError.__init__(self, status, codes=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `NoRedirect.redirect_request(self, *args, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Client.__init__(self, account, token, *, opener=None, sleep=time.sleep)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Client.request(self, method, worker, suffix='', body=None, content_type='application/json', missing=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Client.migration_tag(self, worker)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Client.credential_status(self, database)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Client._request(self, url, method, body, content_type, missing, object_result)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `owned(settings, main, role)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `private(client, worker)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `schedule(client, worker, crons)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `callback(settings, runner)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `callback_view(settings)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `revision(info, key)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `check_bindings(settings, cfg, require_key=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `configuration_view(settings, cfg, expected_revision, require_key=False)` | Only the release number is printable; all other values are match flags. |
| `configuration_view.version(v)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `payload_with_secret(path, info, main, role, key, migration_tag=None, runner=None, extra_secrets=None)` | Change metadata only, preserving the original binary module parts. |
| `Release.__init__(self, env, config, log, *, client=None, sleep=time.sleep)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Release.preflight(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Release.prepare(self, stage, work)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Release.prepare.read()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Release.confirm(self, worker, read, check, view, event)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Release.activate(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Release.activate.read()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/companions.py](../deploy/cloudflare/companions.py)

Inspect official Wrangler multipart artifacts; no network or publication.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `names(main)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `inspect_artifact(path, config, main_name, role)` | Reject wrong targets, incomplete modules, secrets, or website bindings. |
| `upload_request(path, config, main_name, role, account_id, token)` | Construct only; caller must explicitly send after ownership/permission checks. |

### [deploy/cloudflare/credential_probe.py](../deploy/cloudflare/credential_probe.py)

Fixed read-only D1 probe: never return the key or its fingerprint.


### [deploy/cloudflare/d1_setup.py](../deploy/cloudflare/d1_setup.py)

Initialize only empty D1 databases; validate schemas without Python SQLite.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `normalized(sql)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `catalog(rows)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `validate(expected, actual)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `execute_json(command, cwd, env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `setup(node, wrangler, stage, env, config, log, *, publish, query=execute_json)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async setup.backup()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async setup.upgrade()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/deploy_config.py](../deploy/cloudflare/deploy_config.py)

Build-only identity and credential checks. Never serialize credentials.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `validate(env, main, *, credentials=True)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/domains.py](../deploy/cloudflare/domains.py)

One canonical site origin, optionally derived from the workers.dev account name.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `hostname(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `settings(env, name)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `apply(config, values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/integration_package.py](../deploy/cloudflare/integration_package.py)

Add untouched transfer source/templates to disposable Workers output only.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `entrypoint_source()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify_entrypoint(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `extend(root, stage, config)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify(root, stage, config)` | Gate missing exports/bindings/assets before a real deployment can start. |

### [deploy/cloudflare/native_build.py](../deploy/cloudflare/native_build.py)

Native companion validation without website staging or Python dependencies.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `execute(config, runner, log, report_path=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/pipeline.py](../deploy/cloudflare/pipeline.py)

模块常量/类型及组装代码；通过所属业务入口使用。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `settings(env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `settings.required(key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `prepare_arguments(config, output)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `lock_identity(path)` | Ignore generated timestamp, but reject any runtime package/version/hash drift. |
| `verify_stage(stage)` | Verify copied Python, generated schema and browser resource URLs before upload. |
| `workspace()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `execute(command, runner, log, *, report_path=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/prepare.py](../deploy/cloudflare/prepare.py)

Prepare main Worker resources without deployment.


### [deploy/cloudflare/r2_check.py](../deploy/cloudflare/r2_check.py)

Probe effective media/cache prefixes with a small disposable binary object.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `targets(config)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `check(node, wrangler, stage, env, config, runner, log, *, publish)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/resource_module.py](../deploy/cloudflare/resource_module.py)

Reuse the canonical resource factory without executing its legacy app bootstrap.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `source(root)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `generate(root, stage)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify(root, stage)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/__init__.py](../deploy/cloudflare/runtime/__init__.py)

Worker-only adapters. Business modules remain byte-for-byte unchanged.


### [deploy/cloudflare/runtime/admin_entrypoint.py](../deploy/cloudflare/runtime/admin_entrypoint.py)

Private HTTP-only Admin Worker: no scheduled event or sync_tick export.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async LazyAdmin.__call__(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async direct(app, request, env, ctx, fetch)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async Default.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/admin_recovery.py](../deploy/cloudflare/runtime/admin_recovery.py)

既有后台恢复支持，不是 Public 新增 Recovery 层。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `response(request, trace)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async run(request, invoke, stage)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async forward(binding, request)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/admin_snapshot.py](../deploy/cloudflare/runtime/admin_snapshot.py)

既有私有后台快照支持，不用于缓存登录公共页面。


### [deploy/cloudflare/runtime/bridge.py](../deploy/cloudflare/runtime/bridge.py)

Normalize Python/JavaScript boundaries for existing D1 and R2 adapters.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `normalize(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Statement.__init__(self, native)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Statement.bind(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Statement.all(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Database.__init__(self, native)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Database.prepare(self, sql)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Database.batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Bucket.__init__(self, native)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Bucket.optional(value)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Bucket.get(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Bucket.head(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Bucket.put(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Bucket.delete(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Bucket.list(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Environment.__init__(self, native)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Environment.__getattr__(self, name)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `BoundApplication.__init__(self, app)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async BoundApplication.__call__(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/cache_policy.py](../deploy/cloudflare/runtime/cache_policy.py)

Worker configuration adapter for the single success-only Public policy.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `policy(env, *, admin=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `variables(env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `edge_cache(env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `entrypoint_cache(env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/cleanup.py](../deploy/cloudflare/runtime/cleanup.py)

Scheduled bounded cleanup; durable lease and checkpoints use existing tables.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async run(sql, store, clock=time.time)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/diagnostics.py](../deploy/cloudflare/runtime/diagnostics.py)

Bounded event diagnostics: never log request data or exception messages/locals.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `emit(stage, status, **values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `failure(exc)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `phase(stage, *, progress=True, **context)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/entrypoint.py](../deploy/cloudflare/runtime/entrypoint.py)

主 Worker 与两个公开缓存 entrypoint、快传及同步调度的既有导出。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `build_application(include_transfer=False)` | Build a fresh app synchronously; a failed attempt cannot leave cached routes. |
| `async build_application.transfer_admin(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /admin/transfer |
| `LazyApplication.__init__(self, include_transfer=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LazyApplication.__call__(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TransferCoordinator.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async PublicPage.update_public_cache(self, payload)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async PublicPage.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async PublicData.update_public_cache(self, payload)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async PublicData.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default._dynamic_fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default._dynamic_fetch.committed_admin()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.sync_tick(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.scheduled(self, controller, env=None, ctx=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/maintenance.py](../deploy/cloudflare/runtime/maintenance.py)

One maintenance job per minute slot; no counters or full resource graph.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `job_for(controller=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async run(sql, bindings, controller=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/media_upload.py](../deploy/cloudflare/runtime/media_upload.py)

Keep raw upload streams out of the ASGI Python receive path.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async dispatch_upload(application, request, env, ctx, fetch, dispatch)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/public_data.py](../deploy/cloudflare/runtime/public_data.py)

PublicData entrypoint gate and minimal D1-only generation on a platform MISS.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `eligible(request, env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async forward(request, env, ctx)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async serve(request, env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/public_invalidation.py](../deploy/cloudflare/runtime/public_invalidation.py)

主站提交或维护结果经现有私有通道调用拥有缓存的 entrypoint；RPC 无权限旁路。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `encode(plan)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `decode(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `copy_response(response)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `with_commit(response, plan)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async update(ctx, payload, *, data=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async relay(response, ctx)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async relay_reset(response, ctx)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async relay_reset.one(name)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/public_page.py](../deploy/cloudflare/runtime/public_page.py)

Static anonymous PublicPage forwarding; never reads SQL or response bodies.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `eligible(request, env)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async forward(request, env, ctx, *, entrypoint='PublicPage')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `restricted_fallback(request, response, env)` | A private fixed entry remains dynamic for a browser with a session cookie. |

### [deploy/cloudflare/runtime/request_cancel.py](../deploy/cloudflare/runtime/request_cancel.py)

Conservative HTTP cancellation classification; no task/state mutations.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `aborted(request)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `client_cancelled(request, exc)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `cancelled_response()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/request_diagnostics.py](../deploy/cloudflare/runtime/request_diagnostics.py)

Small request envelopes; cf metadata is observed, never inferred from origin.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `field(obj, name, pattern)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `traced(component, http=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `traced.decorate(fn)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async traced.decorate.wrapped(self, *args, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/routing.py](../deploy/cloudflare/runtime/routing.py)

Keep both peers and their code lookup in the same short-lived coordinator.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `coordinated(url)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async dispatch(application, request, env, ctx, fetch)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/setup.py](../deploy/cloudflare/runtime/setup.py)

One-time administrator form, using the existing transactional Auth.bootstrap.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `SetupPasswords.__init__(self, passwords)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async SetupPasswords.hash(self, password)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `page(message='', status=200, form=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `install(app, factory)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.available(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.setup_form(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET PATH |
| `async install.setup_submit(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST PATH |

### [deploy/cloudflare/runtime/site_resources.py](../deploy/cloudflare/runtime/site_resources.py)

Shared binding resolution; public reads never construct admin tool clients.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `resource(request, renderer, *, admin=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/site_routes.py](../deploy/cloudflare/runtime/site_routes.py)

One ownership table for same-origin dispatch and packaging tests.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `owner(url)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/runtime/snapshot.py](../deploy/cloudflare/runtime/snapshot.py)

部署运行快照支持；不表示新增加公共页面备份。


### [deploy/cloudflare/runtime/storage.py](../deploy/cloudflare/runtime/storage.py)

R2 transfer storage shared by HTTP and cron without importing HTTP installers.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async TransferStore.prune_task(self, task, limit=8)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/sync_executor.py](../deploy/cloudflare/runtime/sync_executor.py)

Private sync executor: cold startup has no HTTP/catalog resources.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async Default.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.sync_tick(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.scheduled(self, controller, env=None, ctx=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/sync_resources.py](../deploy/cloudflare/runtime/sync_resources.py)

Request-local sync resources: no website factory, templates or login state.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async application(scope, receive, send)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async application.resources(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/runtime/transfer.py](../deploy/cloudflare/runtime/transfer.py)

Same-origin transfer adapter; existing services own authorization and quotas.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `CatalogRoot.__init__(self, text)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `CatalogRoot.__truediv__(self, path)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `CatalogRoot.read_text(self, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, factory, templates, catalog, stores=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.runtime(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.workspace(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.enter(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /transfer；GET /transfer/login |
| `async install.status(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /transfer/api/storage-status |

动态注册/挂载：

- `app.mount('/transfer', BoundedIO(child, capacity), name='worker-transfer')`

### [deploy/cloudflare/site_workers.py](../deploy/cloudflare/site_workers.py)

模块常量/类型及组装代码；通过所属业务入口使用。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `admin_name(main)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `literals(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `subset(templates, roots)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `extend(root, stage, cfg, env=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify(stage)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify_routes()` | Build-host check of the actual route installers; no runtime resources. |
| `verify_routes.blocked(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/cloudflare/smoke.py](../deploy/cloudflare/smoke.py)

GET-only checks for a deployed test website; no login or cloud API calls.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `origin_value(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `SameOrigin.__init__(self, origin)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `SameOrigin.redirect_request(self, req, fp, code, msg, headers, newurl)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `inspect(origin, open_url=None, *, repeat_startup=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `main()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/cloudflare/startup_check.py](../deploy/cloudflare/startup_check.py)

Isolated import check for project startup code; not a Workers SDK emulator.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `check(runtime, source=None, executor_only=False, executor_dependencies=False, admin_only=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `check.blocked(*args, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `check.guarded_import(name, *args, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `check.audit(event, args)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [deploy/linux/tweb.py](../deploy/linux/tweb.py)

受管 Linux 安装与实例管理；命令入口 main/perform 驱动 Manager，不直接拼路径删除。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `site_origins(state, value=None)` | Standalone manager validation; no dependency on installed application packages. |
| `site_domains(state)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `port_number(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `color(text, code='36')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `heading(text)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Layout.current(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Layout.state(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `layout_identity(layout)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `layout_arguments(layout)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `instance_layout(instance, base=None, command=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `argument_layout(args)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `check_identity(layout, recovery=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `check_port(port)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `choose_port(port=8003)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `port_available(port)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `command_available(layout)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `suggest_base(base)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `select_install_layout(args)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `run(argv, **kwargs)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `repository(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `branch_name(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `hostname(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `no_symlinks(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `owned(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `claim(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `write(path, text, mode=420)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `confirm(token, supplied)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `seed_media(source)` | Validate all source seeds before any copy; database/cache/credentials stay forbidden. |
| `file_digest(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `import_seed_media(source, destination)` | Add only missing files, preserve existing bytes, and remain safe to retry. |
| `check_source(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `protected_digest(root, names=('backend', 'database', 'transfer', 'site_sync', 'deploy', 'pyproject.toml'))` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Manager.__init__(self, layout=Layout(), runner=run)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.step(self, label, action, *args, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.run(self, argv, **kwargs)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.load(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.save(self, state)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.write_command(self, state)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.active(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.switch(self, release)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.release(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.fetch(self, repo, branch)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.prepare(self, release, python)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.import_media(self, release)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.pip_source(self, value=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.install_dependencies(self, release)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.db(self, release, mode)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.healthy(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.start(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.restart(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.generate(self, release, state)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.remnants(self)` | Read-only discovery also works when install.json or ownership markers were removed. |
| `Manager.recovery_guard(self, account, group)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.clean_remnants(self, supplied=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.repair_install(self)` | Fetch verified source, preserve storage/env, recover missing local deployment files. |
| `Manager.install_entry(self, args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.install(self, args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.resume_install(self)` | Resume the dependency-stage failure without discarding the user's installation. |
| `Manager.update(self, args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.check_unit(self, state)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.data_paths(self)` | Only the managed default layout is eligible for destructive operations. |
| `Manager.permissions(self, repair=False)` | Test actual service-account access; never grant public write permissions. |
| `Manager.dependencies(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.update_source(self, args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.configure(self, port=None, allowed_origins=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.configure.write_environment(text)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.restore_source(self, args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.remove(self, scope, supplied=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.database(self, reset=False, supplied=None, update=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.uninstall(self, supplied=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.refresh_logging(self, state)` | Upgrade only the owned service command; preserve storage/env/proxy settings. |
| `Manager.paths(self, state=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.doctor(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manager.proxy(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `choose(title, entries)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `parser()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `execute(a)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `perform(a)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `main(argv=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/shared/bootstrap.py](../deploy/shared/bootstrap.py)

One shared, idempotent environment preparation path for Windows and Linux.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `prepare_environment()` | 复用虚拟环境，锁文件摘要变化时安装依赖；不读写网站数据库。 |
| `main()` | Delegate legacy convenience arguments to the single configured launcher. |

### [deploy/shared/development.py](../deploy/shared/development.py)

Dedicated disposable database settings; normal website paths are never reset implicitly.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `configure(root_default)` | Override normal settings only for explicit demo/fresh commands; confine dev paths. |
| `claim(settings)` | Mark only an empty directory or a previously owned development directory. |
| `reset(settings)` | Reset only the dedicated development SQLite file; preserve media/cache files. |

### [deploy/shared/http_limits.py](../deploy/shared/http_limits.py)

Shared bounded main-site HTTP capacity; not a change to upload/job limits.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `teacher_concurrency()` | Allow explicit small-host tuning; reject invalid settings before launch. |

### [deploy/shared/launcher.py](../deploy/shared/launcher.py)

跨平台启动派发与唯一服务；normal/demonstration 模式和显式重建彼此区分。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `state_root()` | Keep launcher-managed data outside replaceable source directories. |
| `configure(profile='normal')` | TOML and explicit environment paths take precedence over launcher defaults. |
| `check_ports(ports)` | Reject live listeners; allow POSIX TIME_WAIT after an owned service stops. |
| `async initialize(settings, both=False, development=False)` | Preserve native records; only the first empty account set prompts for an administrator. |
| `stop(process)` | Stop only a child process owned by this launcher. |
| `serve(settings, both=False, open_browser=True, seconds=None)` | Run the single integrated service, using the configured cache for logs. |
| `main(argv=None)` | Default missing mode to start; seed and reset remain explicit operations. |

### [deploy/shared/package_release.py](../deploy/shared/package_release.py)

输出源码外的发布 ZIP；清单、校验和排除运行数据通过既有 release 工具。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `archive(folder, target)` | Generate a content manifest and archive only validated, non-runtime files. |
| `main()` | Copy runtime files to temporary staging; refuse existing outputs and nested destinations. |

### [deploy/shared/service.py](../deploy/shared/service.py)

Single-process server entry with bounded, cross-platform runtime logging.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `RuntimeLog.__init__(self, directory, max_bytes=10 * 1024 * 1024, backups=5, days=14)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `RuntimeLog._write(self, text)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `RuntimeLog.emit(self, record)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `RuntimeLog._trim(self, path)` | Keep only the newest bytes with a 64 KiB copy buffer and the same inode. |
| `RuntimeLog.maintain(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `RuntimeLog.apply_policy(self, policy)` | Called by the existing maintenance loop; keeps one writer and lock. |
| `RuntimeLog._maintenance(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `RuntimeLog.close(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LogStream.__init__(self, logger, level)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LogStream.write(self, value)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LogStream.flush(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `main(argv=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/shared/testing.py](../deploy/shared/testing.py)

Explicit test command; dependencies and isolated tests use the selected interpreter.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `run(dom=False, report=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [deploy/shared/worker_package.py](../deploy/shared/worker_package.py)

Copy shared native resources into independent Worker packages; never publish or run SQL.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `prepare(transfer=False, argv=None, *, migration_plan=True)` | Write UTF-8 resources and binding configuration without depending on host code pages. |

### [deploy/vps/release.py](../deploy/vps/release.py)

Read-only preflight, immutable release inventory and configuration generation.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `digest(path)` | 计算文件SHA-256，供发布清单校验内容。 |
| `inventory(root)` | 收集可交付文件并拒绝数据库、凭据及不安全路径。 |
| `write_manifest(root, refresh=False)` | Create or explicitly refresh the byte manifest after editing; never changes runtime data. |
| `verify(root)` | 核对发布清单中的路径、文件大小与摘要。 |
| `stage(source, destination)` | 把已核验的发布包展开到新目录，不覆盖在用版本。 |
| `check_data(root, teacher, transfer)` | Read-only comparison of explicitly configured database files with canonical native SQL. |
| `memory()` | 读取本机可获取的内存信息，供本地部署预检。 |
| `preflight(root, data_parent, ports=(8003,))` | 检查目标部署目录、可用资源及依赖条件。 |
| `safe_path(value)` | 校验部署路径可安全写入配置文件。 |
| `domain(value)` | 校验反向代理使用的域名格式。 |
| `render(output, base, teacher_domain, transfer_domain, python, port=8003, service_name='teacher-site.service', service_user='teacher-site', config_dir='/etc/teacher-site', allowed_origins='')` | Generate one service, one origin and one local HTTP port; never deploy. |
| `main()` | 解析本模块命令行参数并执行对应的维护或打包功能。 |

### [site_sync/__init__.py](../site_sync/__init__.py)

Independent sync redesign. Importing this package has no runtime side effects.


### [site_sync/adapters/__init__.py](../site_sync/adapters/__init__.py)

Small database adapters; no imports or connections at package import time.


### [site_sync/adapters/d1.py](../site_sync/adapters/d1.py)

Cloudflare binding adapter. No BEGIN/COMMIT or non-atomic exec() calls.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `sql_type(sql)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `diagnostic(exc, operation, sql, args, started)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `plain(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `js_array(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `blob(value)` | Copy one Python buffer to a JS ArrayBuffer, never a Python integer list. |
| `D1.__init__(self, binding, *, backup_callback=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `D1.statement(self, sql, args, blobs=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async D1.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async D1.batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async D1.backup(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/adapters/local_media.py](../site_sync/adapters/local_media.py)

Local immutable staging: bounded socket reads, fsync, atomic part receipts.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `durable_replace(path, write)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `LocalMedia.__init__(self, repo, root)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMedia.directory(self, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMedia.store_part(self, f, item, peer, buffer_bytes)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMedia.store_part.copy(out)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMedia.complete(self, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMedia.complete.assemble(out)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LocalMedia.step(self, ctx, item, f, peer)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LocalMedia.discard(self, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMedia._discard(self, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LocalMedia.prune_parts(self, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalMedia.prune_parts.prune()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/adapters/sqlite.py](../site_sync/adapters/sqlite.py)

SQLite implementation of ordered atomic batches, used locally and at deploy.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `SQLite.__init__(self, path=':memory:')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async SQLite.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async SQLite.batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async SQLite.backup(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `SQLite.close(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/adapters/staging.py](../site_sync/adapters/staging.py)

Shared SQLite/D1 bounded staging statements. Used by the bounded transfer handler.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `StagingStore.__init__(self, adapter)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async StagingStore.append(self, *, task_id, item_id, field, lease, grant_revision, source_version, expected_seq, offset, data, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/adapters/tasks.py](../site_sync/adapters/tasks.py)

Small SQL task repository, shared by SQLite and D1.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `token()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `scopes(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Tasks.__init__(self, db, *, lease_seconds=300, platform='worker')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.put_grant(self, *, grant_id, principal_id, scope, can_write, can_delete, expires_at=0, enabled=True)` | Trusted host authorization service only; never accept browser role claims. |
| `async Tasks.read(self, task_id)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.grant(self, grant_id, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.command_task(self, task_id, grant_id, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.create(self, *, peer_id, grant_id, scope, operation_id, now, mode='manual', auto_confirm=False, auto_delete=True, expected_grant_revision=None, settings=None, expected_schedule=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.confirm(self, task_id, grant_id, selected, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Tasks.command_guard(self, task_id, grant_id, revision, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.pause(self, task_id, grant_id, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.cancel(self, task_id, grant_id, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.resume(self, task_id, grant_id, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.bind_upgraded_task(self, task_id, grant_id, now)` | Trusted migration/admin service: bind an unowned paused v1 task. |
| `async Tasks.claim(self, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Tasks.assertion(self, task, now, *, write=False, extra='1', args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.add_item(self, task, *, item_id, module, record_id, source_version, now, action='upsert', target_version=None, discovery_cursor=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.advance(self, task, phase, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.mark_staged(self, task, item_id, expected_bytes, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.cleanup_one(self, task, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.commit_item(self, task, item_id, statement, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.defer(self, task, now, *, diagnostic=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.finish(self, task, now, *, error=None, permanent=False, resource=False, uncertain=False, diagnostic=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Tasks.reconcile_one(self, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/adapters/transfer.py](../site_sync/adapters/transfer.py)

One bounded durable action per engine invocation; no whole-record reads.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Transfer.__init__(self, repo, peer, media=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Transfer.__call__(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `MediaReceipts.__init__(self, repo)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `MediaReceipts.progress(self, t, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MediaReceipts.part(self, ctx, f, offset, length, etag)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MediaReceipts.uploaded(self, ctx, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MediaReceipts.commit_item(self, ctx, item_id, statement)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Cleanup.__init__(self, repo, media)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Cleanup.partial_progress(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Cleanup.__call__(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/adapters/worker_media.py](../site_sync/adapters/worker_media.py)

Bridge supplied by the Worker host. JS owns fetch/R2 streams end-to-end.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `WorkerMedia.__init__(self, repo, bridge)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async WorkerMedia.step(self, ctx, item, f, peer)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async WorkerMedia.discard(self, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/adapters/worker_peer.py](../site_sync/adapters/worker_peer.py)

Metadata/record-only Python bridge; media never crosses Python/JS FFI.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `WorkerPeer.__init__(self, bridge)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async WorkerPeer.read(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async WorkerPeer.manifest(self, item)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async WorkerPeer.slice(self, item, field, offset, length)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async WorkerPeer.candidates(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/admin/__init__.py](../site_sync/admin/__init__.py)

Embed into the website's authenticated admin; no independent login service.


### [site_sync/admin/asgi.py](../site_sync/admin/asgi.py)

Mount under the website admin router. Host supplies session+CSRF callbacks.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `AdminASGI.__init__(self, admin, authenticate, verify_csrf, *, prefix='/admin/site-sync/api')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async AdminASGI.__call__(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async AdminASGI.handle(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async AdminASGI.dispatch(self, actor, method, p, q, b)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/admin/connectivity.py](../site_sync/admin/connectivity.py)

Bounded, read-only diagnostic using the production peer transport.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async probe(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async probe.run()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/admin/monitor.py](../site_sync/admin/monitor.py)

Read-only monitor projections; no runtime, clone, media or event traversal.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `query(grant, view, cursor, limit)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `state(task, events, clone)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `event(row)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `source_schedule_id(task)` | Parse persisted scheduler identity without lookups; malformed legacy data is absent. |

### [site_sync/admin/retention.py](../site_sync/admin/retention.py)

One bounded metadata batch per tick (up to 50 rows). NEVER delete external objects or business data.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Retention.__init__(self, db, days=90)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Retention.step(self, now, grant_id=None, *, requested_only=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/admin/service.py](../site_sync/admin/service.py)

同步任务、默认参数、计划和控制；调用需 Actor 与当前授权，不单靠任务ID。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `integer(value, minimum, maximum)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `policy(values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Admin.__init__(self, repo, clock, *, retention_days=90, catalog=None, principal_scopes=None, preflight=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.grant(self, actor, write=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.own_task(self, actor, task_id, write=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.retry_policy(self, actor, body=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.options(self, actor)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.summary(self, actor, *, view='all', cursor=None, limit=20)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.tasks(self, actor, *, view='active', cursor=None, limit=50)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.detail(self, actor, task_id)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.logs(self, actor, task_id, *, before=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.items(self, actor, task_id, *, cursor='')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.create(self, actor, body)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.command(self, actor, task_id, command, body)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.save_defaults(self, actor, body)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.schedules(self, actor, *, cursor='')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.delete_schedule(self, actor, uid, body)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Admin.save_schedule(self, actor, body)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/core/__init__.py](../site_sync/core/__init__.py)

Runtime-neutral types and decisions; no website, storage, or network imports.


### [site_sync/core/adaptive.py](../site_sync/core/adaptive.py)

Small durable load policy. No isolate state, payloads or additional task scans.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `classify(diagnostic=None, *, resource=False, uncertain=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `empty()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async read(db, task_id)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `adjust(task, state, now, classification, *, progress=False, failed=False, body_success=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `credential_wait(count, fast, slow)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `save(task_id, state)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `quarantine(task, state, diagnostic, *, failed, progress, permanent=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/authority.py](../site_sync/core/authority.py)

Fresh grant predicates shared by all commit paths; no website dependencies.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `guard(task, now, *, write=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/contracts.py](../site_sync/core/contracts.py)

New sync boundaries. Adapters will implement these in subsequent steps.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Slice.__post_init__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TaskStore.read(self, task_id: str)` | Bounded task metadata only; no body or entire candidate payload. |
| `async TaskStore.claim(self, now: int)` | Acquire one due task with fresh authorization and a global exclusive lease. |
| `async TaskStore.reconcile_one(self, now: int)` | Reconcile at most one expired attempt before any business replay. |
| `async TaskStore.finish(self, task: dict, now: int, *, error=None, permanent=False, resource=False, uncertain=False)` | Persist outcome using actual progress and the same attempt/lease token. |
| `async PeerReader.field_slice(self, record_id: str, field: str, version: str, offset: int, maximum_bytes: int)` | Authenticated bounded byte range tied to one immutable source version. |
| `async BusinessWriter.apply_staged(self, lease: Lease, item_id: str, expected_target_version: str)` | Apply one complete staged record and its progress in one DB transaction. |

### [site_sync/core/diagnostics.py](../site_sync/core/diagnostics.py)

Bounded diagnostic vocabulary shared by admin and peer transports.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `coded(exc, code)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `classify(exc, fallback)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `fields(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `peer_headers(headers)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/engine.py](../site_sync/core/engine.py)

One invocation, one bounded handler or one expired-attempt reconciliation.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Engine.__init__(self, repository, handlers, clock, *, step_timeout=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Engine.tick(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Engine.tick.work()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Context.__init__(self, repo, task, clock)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Context.describe(self, sub_stage, **values)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Context.advance(self, phase)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Context.add_item(self, **item)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Context.commit_item(self, item_id, statement)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/core/input_errors.py](../site_sync/core/input_errors.py)

Safe, structured input errors. Never echo arbitrary request values or secrets.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `InputError.__init__(self, field, message, expected)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `InputError.payload(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/core/journal.py](../site_sync/core/journal.py)

Small structured diagnostics; never serialize exception bodies or secrets.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `failure(exc)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `statements(uid, now, kind, detail=None, level='info', condition='1', args=())` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/policy.py](../site_sync/core/policy.py)

Small, runtime-independent recovery policy for the redesigned sync module.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `recover(before, after, consecutive, *, failed=False, permanent=False, fast_retries=30, slow_seconds=900, fast_seconds=10)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `smaller(current, minimum)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/preflight_errors.py](../site_sync/core/preflight_errors.py)

Safe structured task admission failure; no transport or website imports.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `PreflightError.__init__(self, payload, status=409)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `PreflightError.payload(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/core/receiver.py](../site_sync/core/receiver.py)

Shared admission for manual pulls, incoming proposals and scheduled pulls.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `selection(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `validate(values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async create_receiver(repo, **values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/retry_settings.py](../site_sync/core/retry_settings.py)

Site-wide retry cadence; per-task retry count remains independently configurable.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `validate(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async read(db)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/selection.py](../site_sync/core/selection.py)

Explicit privileged restore scopes; no website imports on generic paths.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `is_restore(scope)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `selected_tables(scope)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `normalize(scope)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `meta_record(scope)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `meta_scope(record)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `visible_scopes(scope)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `descriptions(scope)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/settings.py](../site_sync/core/settings.py)

Bounded deployment defaults, persisted site policy and sparse task overrides.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `size(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `validate(values, *, partial=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `defaults(platform)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async site(db, platform)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async resolve(db, platform, overrides=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/core/trace.py](../site_sync/core/trace.py)

Invocation-local diagnostics. Tokens always reset; never persist payloads here.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `current()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `scope(**values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `annotate(**values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `invocation(component, executor_mode='unknown', trigger='tick')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `record(stage, **values)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `category(exc)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `step(name)` | Keep the failing substep in the invocation context; no payload logging. |

### [site_sync/deploy/__init__.py](../site_sync/deploy/__init__.py)

Deployment-only schema preparation; never called by normal web requests.


### [site_sync/deploy/cloudflare.py](../site_sync/deploy/cloudflare.py)

Prepare D1 before code release; no cloud mutation unless --apply supplied.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `preflight(config)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async deploy(config, *, apply=False, release=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async deploy.backup()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `main()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/deploy/d1_remote.py](../site_sync/deploy/d1_remote.py)

Deployment-host-only D1 REST adapter. Never bundled into runtime paths.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `RemoteD1.__init__(self, account, database, token, backup)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `RemoteD1.send(self, payload)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async RemoteD1.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async RemoteD1.batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async RemoteD1.backup(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/deploy/database.py](../site_sync/deploy/database.py)

Local automatic provisioning and D1 plan build CLI. No production HTTP route.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async provision_d1(binding, plan_json, *, backup_callback=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `main()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/deploy/migrations.py](../site_sync/deploy/migrations.py)

Fresh deployments only; historical synchronization schemas are not converted.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `registered(plan)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/deploy/recovery.py](../site_sync/deploy/recovery.py)

Obtain and durably record a D1 Time Travel bookmark via installed Wrangler.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async wrangler_bookmark(config)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/deploy/schema.py](../site_sync/deploy/schema.py)

One canonical SQL source, explicit migrations and guarded atomic deployment.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `canonical(sql)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `objects(rows)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Plan.compile(cls, path)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Plan.dump(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Plan.load(cls, content)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async ensure(adapter, plan, *, migrations=(), check_only=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/capabilities.py](../site_sync/integration/capabilities.py)

Signed, bounded metadata handshake; never scans business data or creates tasks.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async published(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async handshake(peer)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `compare(value, requested)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async preflight(r, peer_id, requested)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async preflight.run()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/integration/catalog.py](../site_sync/integration/catalog.py)

Explicit mappings from the user-selected v0.15.160 website only.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ident(s)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `row_json(t, alias='r')` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/clone.py](../site_sync/integration/clone.py)

Privileged full website clone. Records are staged before any restore writes.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `pk(t)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `rowjson(t)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `prefix(task)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `prefix_range(base)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `key(task, record)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `body_sql()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async inventory(db, tables=ORDER)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `inventory_version(info)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async candidates(site, q)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async check_source(site, q)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async snapshot(site, q)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async discover(site, ctx)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async progress(ctx, statements)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async apply(site, ctx)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async clone_admin(db, pre)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async finish_accounts(site, ctx, pre, statekey)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async approve_all(repo, task_id, grant_id, now)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/control.py](../site_sync/integration/control.py)

Durable, site-wide admission switch. In-flight bounded steps drain safely.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async paused(db)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async stopped(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async status(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async save(r, value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/control_api.py](../site_sync/integration/control_api.py)

Host session and CSRF protected recovery control.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, csrf)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.handle(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/admin/site-sync/control；POST /api/admin/site-sync/control |

### [site_sync/integration/credentials.py](../site_sync/integration/credentials.py)

Site-local credentials shared by management and runtime consumers.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `normalize(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `generate()` | Generate a draft only; callers must authorize before exposing it. |
| `ResolvedCredential.secret_bytes(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `ResolvedCredential.status(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async resolve(r)` | Internal runtime read: one indexed SELECT per operation, no admin required. |
| `async require_secret(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `authorize_management(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async status(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async save(r, value)` | Internal mutation; HTTP caller must additionally enforce CSRF/no-store. |
| `async reveal(r)` | Explicit administrator reveal; HTTP caller must enforce CSRF/no-store. |

### [site_sync/integration/credentials_api.py](../site_sync/integration/credentials_api.py)

Session-authorized credential endpoints. Never cache responses or echo input.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install_headers(app)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install_headers.credential_headers(request, call_next)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, resources, csrf, *, shared_middleware=True)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.handle(request, action)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.status(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET PREFIX |
| `async install.save(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST PREFIX |
| `async install.reveal(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST PREFIX + '/reveal' |

### [site_sync/integration/database.py](../site_sync/integration/database.py)

Native website database adapter; preserve production transaction semantics.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `LocalDB.__init__(self, native)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LocalDB.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalDB._query(self, sql, args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LocalDB.batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalDB._batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `adapter(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/host.py](../site_sync/integration/host.py)

网站运行资源、连接、授权和本地同步后台循环；tick 是有界推进。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `environment(r, key, default='')` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async secret(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `scopes(p)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `grant_id(p)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async authorize_export(r, module=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async configure(r, body)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `runtime(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async runtime.peer(t)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async tick(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `install_local(app, r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install_local.loop()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install_local.start()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install_local.stop()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async refresh_scopes(r)` | Explicit owner action; expand saved scope without changing task revisions. |

### [site_sync/integration/lazy_routes.py](../site_sync/integration/lazy_routes.py)

Publish sync route definitions on first matching request, never task state.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `is_sync(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `LazySyncRoutes.__init__(self, resources, csrf, render)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LazySyncRoutes.matches(self, scope)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LazySyncRoutes.url_path_for(self, name, **path_params)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async LazySyncRoutes.handle(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, resources, csrf, render)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/migration.py](../site_sync/integration/migration.py)

Exact v0.15.160 -> v0.16.001 migration; no other website predecessor.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `definitions(name)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `statements()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `clone_upgrade_statements()` | Atomic bound expansion from this branch's exact previous schema. |
| `monitor_predecessor()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `monitor_upgrade_statements()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/outgoing.py](../site_sync/integration/outgoing.py)

Small per-administrator delivery receipts; never local execution tasks.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `prefix(uid)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `identity(uid, request_id)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `trim(uid, key)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async begin(r, data, origin)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async save(r, key, row, **changes)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async listing(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/package.py](../site_sync/integration/package.py)

Package private native stream companion from this source tree only.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `worker_names(main)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `worker_names.name(limit, suffix)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `write_native(root, stage, config)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `native_package(root, stage, config)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify(root, stage)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/peer_api.py](../site_sync/integration/peer_api.py)

Signed peer endpoint, independent of website application construction.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async peer_read(request, resources)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/proposals.py](../site_sync/integration/proposals.py)

Authenticated metadata proposal; receiver owns approval policy.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async receive(r, q)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async send(r, data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/web.py](../site_sync/integration/web.py)

同步网页与受授权 HTTP 端点；安装到现有主服务，部分子路由由 AdminASGI 派发。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, csrf, render, *, shared_middleware=True)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.page(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /admin/site-sync |
| `async install.connection(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/admin/site-sync/connection |
| `async install.refresh_authorization(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/admin/site-sync/authorization/refresh |
| `async install.connectivity(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/admin/site-sync/connectivity |
| `async install.outgoing_proposals(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/admin/site-sync/proposals |
| `async install.propose(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/admin/site-sync/proposal |
| `async install.propose.submit()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.admin(request: Request, rest: str)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /admin/site-sync/api/{rest:path}；POST /admin/site-sync/api/{rest:path} |
| `async install.admin.auth(scope)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.admin.verify(scope, actor)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.admin.check_peer(peer_id, scope)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.admin.send(event)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.peer_read(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /sync/v1/read |

### [site_sync/integration/website.py](../site_sync/integration/website.py)

现行同步适配器，发现/快照/读取/应用业务数据，不绕过版本和授权。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `TeacherWebsite.__init__(self, db, resource=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TeacherWebsite.check(self, db)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TeacherWebsite.discover(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TeacherWebsite.source_candidates(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TeacherWebsite.snapshot(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TeacherWebsite.source_read(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async TeacherWebsite.apply(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/integration/worker_schedule.py](../site_sync/integration/worker_schedule.py)

Cron shares the site's D1/R2 bindings; one bounded action, no HTTP app.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async _run(sql, bindings)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async history(sql, bindings)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async _wrapped_run(sql, bindings, *, wake=True)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async arm(r)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async run(sql, bindings, *, wake=True)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/integration/write_gate.py](../site_sync/integration/write_gate.py)

Small shared write protection; GET never reads sync state or builds sync routes.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.clone_write_gate(request, call_next)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/runtime/__init__.py](../site_sync/runtime/__init__.py)

Isolated hosts; no automatic registration in the website request router.


### [site_sync/runtime/bridge.py](../site_sync/runtime/bridge.py)

Service-binding RPC uses bounded binary bodies and small JSON control replies; media stays native.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `NativeError.__init__(self, kind)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `NativeBridge.__init__(self, binding, db, peer=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async NativeBridge.call(self, name, value)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async NativeBridge.read(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async NativeBridge.step(self, f, item, parts)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async NativeBridge.discard(self, f)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/runtime/local.py](../site_sync/runtime/local.py)

python -m site_sync.runtime.local --config FILE [--once|--check].

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `settings(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `logger(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async serve(config, *, once=False, check=False, stop=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async serve.peer(task)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `main()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/runtime/mapping.py](../site_sync/runtime/mapping.py)

Explicit scalar-table mapping. No guessed teacher tables or arbitrary SQL.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `identifier(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `MappedWebsite.__init__(self, db, config)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `MappedWebsite.bind(self, runtime)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MappedWebsite.check(self, db)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `MappedWebsite.mapping(self, module)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MappedWebsite.discover(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MappedWebsite.apply(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MappedWebsite.source_candidates(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async MappedWebsite.source_read(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/runtime/peer_server.py](../site_sync/runtime/peer_server.py)

Separate local source process, loopback only; reverse proxy supplies HTTPS.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `BoundedServer.__init__(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `BoundedServer.process_request(self, request, address)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `BoundedServer.process_request_thread(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalSource.__init__(self, config)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalSource.call(self, name, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalSource.authorize(self, module, record)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalSource.candidates(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalSource.manifest(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalSource.slice(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `LocalSource.media(self, q)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `main()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/runtime/peer_worker.py](../site_sync/runtime/peer_worker.py)

Optional isolated public READ-ONLY source Worker for scalar mapped modules.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async Default.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/runtime/schedules.py](../site_sync/runtime/schedules.py)

One receiver-side schedule per invocation, idempotent after a lost receipt.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Schedules.__init__(self, repo)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Schedules.put(self, *, schedule_id, peer_id, grant_id, scope, interval_seconds, now, enabled=True, settings=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Schedules.tick(self, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Schedules.defer(self, s, now)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/runtime/service.py](../site_sync/runtime/service.py)

Shared local/Worker host wiring. Dependencies supplied only by trusted code.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `load_factory(spec)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Runtime.__init__(self, db, adapter, peer_factory, media_factory, *, platform, clock=lambda: int(time.time()), history_days=90)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Runtime.check(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Runtime.transfer(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Runtime.cleanup(self, ctx)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Runtime.tick(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/runtime/worker.py](../site_sync/runtime/worker.py)

Python Worker entry; scheduled/service-binding wake, health-only public HTTP.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async Default.runtime(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.runtime.peer(task)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.run_once(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.scheduled(self, controller, env=None, ctx=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.tick(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Default.fetch(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/transport/__init__.py](../site_sync/transport/__init__.py)

Bounded authenticated read protocol; writes remain receiver-local.


### [site_sync/transport/http.py](../site_sync/transport/http.py)

Local background executor transport. Blocking I/O always uses a thread.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `close_connection(connection)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `DeadlineReader.__init__(self, response, deadline)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `DeadlineReader.read(self, size)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `DeadlineReader.close(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `HTTPPeer.__init__(self, origin, secret, *, allow_loopback=False, clock=time.time, timeout=20)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `HTTPPeer.open(self, request, *, stream=False, recovered=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `HTTPPeer.open.release()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async HTTPPeer.manifest(self, item)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async HTTPPeer.slice(self, item, field, offset, length)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `HTTPPeer.media(self, item, file, offset, length)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async HTTPPeer.candidates(self, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [site_sync/transport/protocol.py](../site_sync/transport/protocol.py)

HMAC authenticates small bodies; TLS protects native media streams.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `encode(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `digest(body)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `mac(secret, text)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `request_headers(secret, body, *, clock=time.time, nonce=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify_request(secret, headers, body, *, clock=time.time)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `response_headers(secret, nonce, status, metadata, body=b'', *, stream=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify_response(secret, nonce, status, headers, body=b'', *, stream=False)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `manifest(value, version)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [site_sync/transport/server.py](../site_sync/transport/server.py)

Read-only local peer handler. Mount on a separate bounded server in step 5.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `handler(source, secret, *, clock=time.time)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `handler.PeerHandler.log_message(self, *args)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `handler.PeerHandler.do_POST(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [transfer/backend/accounting.py](../transfer/backend/accounting.py)

日/周/月授权字节预留与结算，复用原生transfer_allowances，不改变数据库结构。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `milliseconds()` | 返回UTC毫秒，所有配额及租约使用同一时基。 |
| `assertion(condition, args=())` | 条件不满足时由原生NOT NULL约束中止整个SQLite/D1事务。 |
| `identity(p)` | 用户配额独立于角色变更，匿名下载共享同一池，不按IP拆分。 |
| `period_starts(name, at=None)` | 使用明确的中国标准时间或UTC日/周/月边界，避免依赖Worker时区数据库。 |
| `periods(name, at=None)` | 周一零点开始；保持原有日/周/月边界接口兼容。 |
| `limit(value)` | 空值表示不限，零表示禁止；只接受安全范围内的非负整数字节。 |
| `Accounting.__init__(self, sql)` | 共享请求内SQL适配器，所有写入可并入任务事务。 |
| `Accounting.reserve(self, p, task, member, size, kind, settings, rule, expiry)` | 在同一事务内检查日/周/月用量与配置版本，然后占用本次授权字节。 |
| `Accounting.charge(self, task, member, size, complete=False)` | 按已接受上传/即将发出的下载块记账，和检查点或下载状态原子提交。 |
| `Accounting.release(self, task, member=None)` | 取消/清理只释放未传额度，已经结算的字节不退款、不删除用量历史。 |
| `async Accounting.usage(self, p, settings, rule)` | 显示当前身份按授权时间归属的已用加预留量，以及每周期剩余额度。 |
| `async Accounting.total_usage(self, settings)` | 管理员全站用量；汇总复用同一授权账本，不生成第二份流量历史。 |

### [transfer/backend/chunks.py](../transfer/backend/chunks.py)

Constant-size checkpoints, bounded chunk pages and explicit legacy conversion.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `index_legacy(c)` | Stopped-service migration: one historical (<=200 MiB) task at a time, same transaction. |
| `async page(sql, task, after=0, limit=PAGE)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async one(sql, task, offset)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [transfer/backend/cli.py](../transfer/backend/cli.py)

Initialize native transfer tables and explicitly authorize an existing teacher account UID.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async main()` | Use the shared configuration for initialization and structural diagnostics. |

### [transfer/backend/codes.py](../transfer/backend/codes.py)

Shared receive-only short codes. Existing room IDs and share links stay valid.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ms()` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `capability(row, share)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async find_share(sql, token)` | Original bearer token or derived receive-only token; no sender secret is stored. |
| `Limiter.__init__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Limiter.take(self, client)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Codes.__init__(self, app)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Codes.rooms(self, mode)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Codes.owner(self, r, mode, target, key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Codes.issue(self, r, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Codes.resolve(self, r, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Codes.revoke(self, r, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, get, check)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.action(op: str, request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/codes/{op} |

### [transfer/backend/examples.py](../transfer/backend/examples.py)

Explicit transfer demonstrations through real quota, upload and state-control services.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async add(r, kind)` | Generate one tiny owned scenario; existing or interrupted examples keep their actual state. |
| `async add.GuardedSQL.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async add.GuardedSQL.batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [transfer/backend/folder_receiver.py](../transfer/backend/folder_receiver.py)

Folder receive control reuses the existing keyed, metered chunk session.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async limits(receiver, row, settings, rule)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async operate(receiver, id, key, action, data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [transfer/backend/folders.py](../transfer/backend/folders.py)

Bounded folder manifests in the shared metadata store; chunks keep one task cursor.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `path(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `integer(value, maximum)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `prefix(id)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `path_key(id, p)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `entry_key(id, n)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Folders.__init__(self, s, p)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Folders.create(self, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Folders.task(self, id, write=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Folders.guard(self, row)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Folders.submit(self, id, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Folders.seal(self, id)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Folders.listing(self, id, after)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, get, check)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.create(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/folders |
| `async install.submit(request: Request, id: str)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/folders/{id}/manifest |
| `async install.seal(request: Request, id: str)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/folders/{id}/seal |
| `async install.listing(request: Request, id: str)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /api/folders/{id}/manifest |

### [transfer/backend/identity.py](../transfer/backend/identity.py)

Live main-site authorization, also checked inside transfer write transactions.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `permission(p, action='view')` | Use the current role, never historical admin_grants or an ft_session ticket. |
| `SessionSQL.__init__(self, sql, p, action='view')` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async SessionSQL.query(self, sql, args=())` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async SessionSQL.batch(self, statements)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [transfer/backend/indexed.py](../transfer/backend/indexed.py)

Indexed upload acknowledgements and paged recovery without growing JSON arrays.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async checkpoint(service, p, id, after=0)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async chunk(service, p, id, offset, data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async _chunk(service, p, id, offset, data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [transfer/backend/integration.py](../transfer/backend/integration.py)

Mount the existing transfer application in the local teacher process.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `install(app, resources, root)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.runtime(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.admin_workspace(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.lifespan(application)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.storage_status(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：GET /transfer/api/storage-status |

动态注册/挂载：

- `app.mount('/transfer-static', StaticFiles(directory=root / 'transfer/frontend/native'), name='transfer-static')`
- `app.mount('/transfer', BoundedIO(app_factory(None, integrated=runtime, base='/transfer'), capacity), name='transfer')`

### [transfer/backend/lan.py](../transfer/backend/lan.py)

Bounded, ephemeral same-origin signaling. Never accepts or stores file bodies.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `identity(p)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `valid_key(key)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `description(value, kind)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async policy(r, p, action, size, folder=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Rooms.__init__(self, clock=time.monotonic, budget=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Rooms.sweep(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Rooms.drop(self, code)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Rooms.expire(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Rooms.arm(self, row)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Rooms.peer(self, p, key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Rooms.count(self, p)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Rooms.act(self, r, op, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Rooms.view(self, code, row, role)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, get, check)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.action(op: str, request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/lan/{op} |
| `async install.process(op, request)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [transfer/backend/live_folders.py](../transfer/backend/live_folders.py)

Ephemeral bounded folder metadata shared by LAN signaling and online relay.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `path(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Budget.__init__(self, maximum=TOTAL)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `app_budget(app)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `specification(data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `check_limits(settings, rule, size, folder=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Manifest.__init__(self, name, size, header, budget)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manifest.release(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manifest.__del__(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manifest.view(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manifest.submit(self, after, entries)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manifest.seal(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manifest.read(self, after)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Manifest.operate(self, side, op, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [transfer/backend/management.py](../transfer/backend/management.py)

全量任务分页、分批控制和缓存预检；不依赖常驻进程或新增表。

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Management.__init__(self, service, p, secret='', cache=None)` | 复用当前快传服务和已配置的两个对象存储。 |
| `async Management.require(self)` | 读取与每次写操作均重新检查独立快传管理员授权。 |
| `Management.guard(self)` | 事务内部复核管理员授权，签名会话有期限时同时检查过期。 |
| `Management.ticket(self, audience, **value)` | 为分页游标和删除预检绑定操作人、用途和五分钟有效期。 |
| `Management.decode(self, token, audience)` | 拒绝其他账号、用途和过期游标；不信任客户端路径或原始目录游标。 |
| `Management.where(self, query, admin=True)` | 服务器白名单筛选，选择完整任务集合，不以当前页为全部范围。 |
| `async Management.listing(self, query=None)` | 白名单排序后分页；100是可选每页数量，任务总数没有上限。 |
| `async Management.control(self, id, action, expected, stamp=None)` | 以原生状态和检查点版本控制任务；撤销同时释放未用流量额度。 |
| `async Management.purge(self, id, expected=None, stamp=None)` | 先持久停止任务，再逐次删除至多8个分块；失败保留意图，允许再次清理。 |
| `async Management.batch(self, data)` | 所选最多100项，全范围使用签名游标逐批推进，清理每次仅推进一个任务。 |
| `async Management.cache_page(self, area='files', cursor=None)` | 只列举快传自己的文件与缓存根/前缀；活动及未清理任务文件标记受保护。 |
| `async Management.delete_cache(self, token)` | 复核路径、对象版本和任务引用后删除单个孤立/缓存文件，保留失败意图。 |

### [transfer/backend/migrate.py](../transfer/backend/migrate.py)

Stopped-service local import with byte verification, snapshots and guarded rollback.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `digest(path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `objects(c)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `expected(name)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `validate(c)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `content_hash(c)` | Logical content hash remains stable across WAL checkpoint and VACUUM. |
| `safe_path(value)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `snapshot(c, path)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `receipt_write(path, data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `file_inventory(root)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `verify_parts(c, root)` | Validate referenced remaining chunks; prior completed cleanup may omit its prefix. |
| `import_legacy(settings, source_db, source_files, source_cache, receipt)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `rollback(receipt)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `main()` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [transfer/backend/native.py](../transfer/backend/native.py)

Reusable temporary transfer service; local mode shares the teacher database and session.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `ms()` | 返回当前毫秒时间戳，供任务期限和速率检查。 |
| `Transfers.__init__(self, sql, store, indexed=False, disk=None)` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `async Transfers.initialize(self, admin_uid=None)` | Seed original settings only if absent; explicit CMS UID grants manager access. |
| `async Transfers.manager(self, p)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Transfers.settings(self)` | 读取或按版本保存原工具设置文档。 |
| `async Transfers.task(self, id, p)` | 按任务ID读取临时分享记录及其恢复检查点。 |
| `async Transfers.policy(self, p, action)` | Apply original identity rules; unsupported metering protection fails closed. |
| `async Transfers.create(self, p, name, size, folder=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Transfers._create(self, p, name, size, folder=None)` | Reserve quota and create recovery state atomically; file bytes stay in object storage. |
| `async Transfers.chunk(self, p, id, offset, data)` | Immutable chunks plus native JSON checkpoints provide resumable upload without extra tables. |
| `async Transfers.control(self, p, id, action, expected, stamp=None)` | 复用全量管理服务的权限、状态和检查点版本保护。 |
| `async Transfers.cleanup(self, p)` | 兼容维护入口：每次推进最多一个到期/撤销任务，保留历史和失败检查点。 |
| `app_factory(factory, integrated=None, base='')` | Reuse routes with main-site identity locally; legacy Worker keeps its explicit bridge adapter. |
| `async app_factory.get(request, required=True)` | 从本适配器的数据源读取指定对象或记录。 |
| `app_factory.check(request, r, data)` | 检查快传身份、来源、防伪和管理权限。 |
| `async app_factory.errors(request, exc)` | 将快传业务错误转换为适当的HTTP错误响应。 |
| `async app_factory.protect(request, next)` | 为快传请求校验来源并附加响应安全头。 |
| `async app_factory.health(request: Request)` | 返回服务就绪信息，供启动器和反向代理检查。；路由：GET /health |
| `async app_factory.login(request: Request)` | 显示教师站身份入口，不创建独立密码账户。；路由：GET /login |
| `async app_factory.bridge(request: Request)` | 消耗一次性签名票据并建立快传短时会话。；路由：POST /bridge |
| `async app_factory.page(request: Request)` | 显示发送界面和可见任务的控制列表。；路由：GET /；GET /admin；GET /tasks |
| `async app_factory.listing(request: Request)` | 分页读取所有授权任务，提供局部刷新HTML，不设置总条数上限。；路由：GET /api/tasks |
| `async app_factory.examples(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/examples |
| `async app_factory.usage(request: Request)` | 返回当前上传身份已用及预留流量，不影响设置草稿。；路由：GET /api/usage |
| `async app_factory.admin_usage(request: Request)` | Read totals even when disabled; user quota inspection requires administrator access.；路由：GET /api/admin/usage |
| `async app_factory.batch(request: Request)` | 每次有限执行选择集/完整匹配集，并返回下一批签名游标。；路由：POST /api/batch |
| `async app_factory.cache(request: Request)` | 分批扫描快传文件与缓存目录，仅管理员可读。；路由：GET /api/cache |
| `async app_factory.delete_cache(request: Request)` | 按已签名预检删除缓存文件；不接受任意原始路径。；路由：POST /api/cache/delete |
| `async app_factory.create(request: Request)` | 校验身份规则和配额并创建临时分享任务。；路由：POST /api/tasks |
| `async app_factory.checkpoint(request: Request, id: str)` | 返回上传恢复状态和已确认分块摘要。；路由：GET /api/tasks/{id} |
| `async app_factory.chunk(request: Request, id: str)` | 接收并校验下一分块，更新任务检查点。；路由：POST /api/tasks/{id}/chunk |
| `async app_factory.control(request: Request, id: str)` | 按权限暂停、恢复或撤销指定任务。；路由：POST /api/tasks/{id}/control |
| `async app_factory.cleanup(request: Request)` | 清理到期或撤销任务的对象及相关原生记录。；路由：POST /api/cleanup |
| `async app_factory.settings(request: Request)` | 读取或按版本保存原工具设置文档。；路由：POST /api/settings |
| `async app_factory.download(request: Request, token: str)` | 核验分享令牌、下载规则与次数并返回文件流。；路由：GET /s/{token} |
| `async app_factory.download.body()` | 逐块校验状态/版本与内容，发送前原子结算，断连释放未用预留。 |
| `async app_factory.download.body.chunks()` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [transfer/backend/offline.py](../transfer/backend/offline.py)

Local disk admission and resumable expiry maintenance; no new tables or user grants.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `DiskBudget.__init__(self, root, disk_usage=shutil.disk_usage)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async DiskBudget.run(self, operation)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async DiskBudget.snapshot(self, sql, settings)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async DiskBudget.check(self, sql, settings, additional=0)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async DiskBudget.write(self, service, id, key, data, settings)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async ExpiredService.task(self, id, p)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `ExpiryCleanup.__init__(self, service, id)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async ExpiryCleanup.require(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `ExpiryCleanup.guard(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Maintenance.__init__(self, sql, store)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.tick(self, batches=32)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Maintenance.run(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |

### [transfer/backend/presentation.py](../transfer/backend/presentation.py)

Public transfer presentation; reuse the teacher site's navigation and identity.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async portal_context(main, request, root)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `messages(root)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async management_context(r, query)` | Reuse the same permission-scoped listing and settings for either admin shell. |

### [transfer/backend/receivers.py](../transfer/backend/receivers.py)

Single outstanding chunk, persistent ACK cursor, expiring quota and idempotent retries.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Receiver.__init__(self, r)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.share(self, token, folder=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.inspect(self, token)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.start(self, token, key, folder=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Receiver.info(self, receiver, row)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.load(self, id, key, closing=False)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Receiver.guard(self, row)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.status(self, id, key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.read(self, id, key, offset)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.ack(self, id, key, offset, digest)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Receiver.cancel(self, id, key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, get, check)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.context(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.inspect(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/share-info |
| `async install.start(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/receive |
| `async install.window(request: Request, id: str, action: str)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/receive/{id}/{action} |

### [transfer/backend/relay.py](../transfer/backend/relay.py)

Same-site online HTTPS relay: one retained block per bounded room, no disk payload.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `async policy(r, p, side, size, folder=None)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `Relay.__init__(self, slots=None, clock=time.monotonic, budget=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Relay.drop(self, code)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Relay.sweep(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Relay.expire(self)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Relay.arm(self, code, row)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Relay.count(self, p)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Relay.peer(self, p, key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Relay.view(self, code, row, side)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Relay.release(self, r, code)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Relay.act(self, r, op, data, body=None)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Relay._act(self, r, op, data, body)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async Relay.retry_charge(self, r, row, task, side, size, settings, rule, expiry, guards)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `install(app, get, check)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `async install.context(request)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async install.chunk(request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/relay/chunk |
| `async install.action(op: str, request: Request)` | 内部步骤；在外层函数/实例生命周期中使用。；路由：POST /api/relay/{op} |

### [transfer/backend/resources.py](../transfer/backend/resources.py)

Admission before reading payloads; one shared budget, no waiting request queue.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `Capacity.__init__(self, slots=4, budget=16 * CHUNK, idle=30)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `Capacity.from_env(cls)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `BoundedIO.__init__(self, app, capacity)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async BoundedIO.__call__(self, scope, receive, send)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async BoundedIO.__call__.read()` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async BoundedIO.__call__.write(message)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async read_chunk(request)` | Limit the body and total receive time; slow trickles cannot hold a slot forever. |
| `async DurableStore.put(self, key, data)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async DurableStore.delete(self, key)` | 内部步骤；在外层函数/实例生命周期中使用。 |
| `async DurableStore.prune_task(self, id, limit=8)` | Remove only generated stale chunks/temp files in one terminated task folder. |

### [transfer/backend/settings.py](../transfer/backend/settings.py)

Validated edits to the existing settings JSON; no new schema or parallel policy store.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `select_rule(settings, p)` | 本模块内部/组装函数；先通过所属功能入口使用。 |
| `edit(settings, data)` | 本模块内部/组装函数；先通过所属功能入口使用。 |

### [transfer/backend/vps.py](../transfer/backend/vps.py)

Compatibility module: local transfer is served by backend.entrypoints.vps.


### [transfer/backend/worker.py](../transfer/backend/worker.py)

Independent transfer Worker with separately configurable D1, media and cache storage.

| 函数/方法（实际参数） | 用途 / HTTP注册入口 |
| --- | --- |
| `factory(request)` | Build a per-request resource context from explicit transfer platform bindings. |

## 前端命名函数与使用入口

浏览器模块由对应模板script/import加载；命名函数多数位于IIFE或ES模块中，不是window全局API。匿名回调、事件处理和对象方法不作为独立外部入口，具体作用可结合所属页面、data-*选择器和源码查看。下面是当前命名function声明/具名表达式的定位摘录，括号参数取源码文本；不据此构造绕过服务端的调用。

| 文件 | 命名函数与入口 | 职责（源码注释/加载范围） |
| --- | --- | --- |
| [frontend/admin/static/js/history-values.mjs](../frontend/admin/static/js/history-values.mjs) | `historyFragment(value,caret=value.length,multiple=false)`；`replaceHistoryFragment(value,fragment,candidate)` | Caret-aware multi-value replacement; commas inside names and institutions remain literal. |
| [frontend/admin/static/js/media-crop-geometry.js](../frontend/admin/static/js/media-crop-geometry.js) | `fitView(width,height,cw,ch)`；`imagePoint(view,p)`；`zoomView(view,factor,p,min,max)`；`fullRect(width,height,ratio=0)`；`pointRect(a,b,ratio,width,height)`；`outputSize(rect,longEdge)` | Pure image-space geometry. Panning/zooming never changes a crop rectangle or anchor. |
| [frontend/admin/static/js/media-image-size.js](../frontend/admin/static/js/media-image-size.js) | `imageSize(file)` | Inspect common image headers before browser decode to bound original bitmap memory. |
| [frontend/admin/static/js/native-access.js](../frontend/admin/static/js/native-access.js) | `showAccessNotice({message='当前角色没有此功能的权限。',code='access_denied',status=403,trigger=document.activeElement}={})`；`adminFetch(input,options)` | Accessible denial feedback; the server decides every permission and no request is replayed. |
| [frontend/admin/static/js/native-accounts.js](../frontend/admin/static/js/native-accounts.js) | `groupState(control,inputs)`；`refresh()`；`filter()`；`setBox(box,value)`；`depend(box,value)`；`batch(inputs,value,before=new Map(boxes.map(box=>[box,box.checked])` | Edit native role grants as one draft; hidden rows remain part of the form. |
| [frontend/admin/static/js/native-assistance.js](../frontend/admin/static/js/native-assistance.js) | `assist(path,data,{signal,csrf}={})` | Shared authenticated helper requests; callers may cancel stale read-only previews. |
| [frontend/admin/static/js/native-columns.js](../frontend/admin/static/js/native-columns.js) | `setupColumns(root, table, transient = null)`；`read(name)`；`sanitize(value)`；`persist(message)`；`visibility()`；`paintWidths()` | Column visibility and widths share one versioned, per-module preference controller. |
| [frontend/admin/static/js/native-copy.js](../frontend/admin/static/js/native-copy.js) | `copyText(value)` | One text-only clipboard action for lists/details; never opens mail or sends a request. |
| [frontend/admin/static/js/native-corresponding-authors.js](../frontend/admin/static/js/native-corresponding-authors.js) | `authorMarkers(authors,corresponding)`；`paintAuthorMarkers(host,authors,corresponding)` | Display-only author markers; author/citation values are never rewritten. |
| [frontend/admin/static/js/native-dashboard.js](../frontend/admin/static/js/native-dashboard.js) | `load()` | One on-demand summary request, no per-card fanout or automatic retries. |
| [frontend/admin/static/js/native-data-crypto.js](../frontend/admin/static/js/native-data-crypto.js) | `base64(bytes)`；`unbase64(text,limit=MAX_FILE)`；`key(password,salt)`；`encryptDocument(document,password)`；`decryptDocument(text,password)` | 后台编辑、请求与状态组件 |
| [frontend/admin/static/js/native-data-tools.js](../frontend/admin/static/js/native-data-tools.js) | `request(path,value,raw=false)`；`download(value,name,type)`；`sync()`；`invalidate()`；`work(fn)` | 后台编辑、请求与状态组件 |
| [frontend/admin/static/js/native-draft-review.js](../frontend/admin/static/js/native-draft-review.js) | `createDraftReview({form,root,labels,sourceNames,generate,citations})`；`updateApply()`；`drawEntry(name)`；`sourceChanged(name,changed=true)`；`clear()`；`values(fields)`；`remember(name,before,after,source,beforeLock=null)`；`applyValues(selected,source,feedback)`；`show(fields,{host,source,feedback,autoApply=false})`；`applySelected()`；`undo(name)` | Paper-only draft helpers: parsed suggestions share per-field history with selected metadata and citation updates. |
| [frontend/admin/static/js/native-editor.js](../frontend/admin/static/js/native-editor.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Shared editor save lifecycle; server authorization and version checks remain authoritative. |
| [frontend/admin/static/js/native-examples.js](../frontend/admin/static/js/native-examples.js) | `controls()`；`refresh()` | Explicit one-at-a-time insertion; refresh never resumes and a lost response is not resent automatically. |
| [frontend/admin/static/js/native-field-help.js](../frontend/admin/static/js/native-field-help.js) | `attachHelp(control,text,{group=false}={})`；`refreshOptionHelp(control)`；`describeControls(root)` | Shared contextual help for auxiliary controls; business fields are already described by Jinja. |
| [frontend/admin/static/js/native-history.js](../frontend/admin/static/js/native-history.js) | `close()`；`position()`；`fragment()`；`pick(value,snapshot)`；`query()`；`schedule()`；`focusOption(delta)`；`cancel()`；`fields()`；`search()` | Shared, bounded history suggestions for all registered fields and the read-only dictionary page. |
| [frontend/admin/static/js/native-http.js](../frontend/admin/static/js/native-http.js) | `stopReads()`；`requestJSON(url,options={},timeout=15000)` | Shared bounded JSON requests; interrupted writes are never automatically replayed. |
| [frontend/admin/static/js/native-image-format.js](../frontend/admin/static/js/native-image-format.js) | `imageSize(name,value)`；`imageGeometry(node)`；`registerImage(Quill)`；`moveImage(editor,Quill,image,to)`；`dropIndex(editor,Quill,x,y)` | Only bounded numeric image geometry is persisted; all other styles are discarded. |
| [frontend/admin/static/js/native-list.js](../frontend/admin/static/js/native-list.js) | `mountList(root,transient=null,orderDrafts=new Map()`；`dispose()`；`refresh()`；`failedRefresh(summary,error)`；`finish(summary,state='success')`；`patch(row,saved)`；`mutate(row,data)`；`perform(work)`；`orderKey(input)`；`orderChanged(input)`；`paintOrder(input)`；`saveOrder(input)`；`purge(rows)`；`batch(button)` | One controller for every native list, including newly rendered panels after a mutation. |
| [frontend/admin/static/js/native-maintenance.js](../frontend/admin/static/js/native-maintenance.js) | `api(action,extra={})`；`results(target,data)`；`files(scan)`；`refresh()`；`run(fn)` | 后台编辑、请求与状态组件 |
| [frontend/admin/static/js/native-media-audit.js](../frontend/admin/static/js/native-media-audit.js) | `api(action,values={})`；`state(s)`；`ensureReport()`；`recheck(rows,button)` | Bounded scan and explicit preflight/commit. A failed batch reports partial success and stops. |
| [frontend/admin/static/js/native-media-crop.js](../frontend/admin/static/js/native-media-crop.js) | `notice(value,state='info')`；`snapshot(s)`；`remember(s)`；`pointer(event)`；`stateControls(s)`；`schedule(s)`；`draw(s)`；`fit(s)`；`zoom(s,factor,point={x:s.cw/2,y:s.ch/2})`；`resetAnchor(s)`；`commit(s,rect)`；`pick(s,p)`；`ratioChanged(s)`；`finish(result=null)`；`editImage({file,extensions,maxBytes})` | Shared crop editor. Image-space selection survives all view transforms; output is only a draft File. |
| [frontend/admin/static/js/native-media-fields.js](../frontend/admin/static/js/native-media-fields.js) | `externalControls()`；`assign(row)`；`update(fromKey=false)`；`choose(editCurrent=false,startTab='library')` | One link input, native key, chooser and complete preview for every media field. |
| [frontend/admin/static/js/native-media-links.js](../frontend/admin/static/js/native-media-links.js) | `lookupMedia(key,csrf,signal)`；`showLinkPreview(box,row,onStatus=()`；`imageFile(row,signal)` | URL presentation and bounded browser-only image reads shared by fields and the chooser. |
| [frontend/admin/static/js/native-media-locations.js](../frontend/admin/static/js/native-media-locations.js) | `setupMediaLocations(root)`；`stop()`；`paint(anchor,text)`；`summary(item)`；`batch(offset)`；`resume()`；`close()`；`load(url)` | Read-only paged source panel; late responses never reopen a dismissed dialog. |
| [frontend/admin/static/js/native-media-picker.js](../frontend/admin/static/js/native-media-picker.js) | `mediaContext(form,field)`；`responseJSON(response)`；`feedback(message,state='info')`；`localCleanup(s)`；`finish(value=null)`；`busy(s,value)`；`cropControls(s)`；`selection(s)`；`addSelected(s,row)`；`drawRows(s,rows)`；`drawPages(s,result)`；`search(s,page=1)`；`tab(name)`；`filesChanged(s,files)`；`editSelected(s,local=false)`；`chooseMedia({context,currentKey='',multiple=false,files=[],editCurrent=false,startTab='library'})`；`resolveLink(s,register=false)` | Shared media chooser: bounded pages, isolated draft selection and explicit upload/confirmation. |
| [frontend/admin/static/js/native-media.js](../frontend/admin/static/js/native-media.js) | `checkMedia(work)`；`pumpChecks()`；`clearMediaPreviews(root)`；`watchMediaPreview(media,{host=media.parentElement,onStatus=()`；`show(value,state='error')`；`loaded()`；`diagnose(token)`；`failed()`；`reload(manual=true)`；`refreshDialog()`；`openDetails()`；`setupMediaPreviews(root=document)`；`setupMediaViewer(root)`；`close()` | Shared media loading state. A failed request must not permanently hide a readable image. |
| [frontend/admin/static/js/native-message-logs.js](../frontend/admin/static/js/native-message-logs.js) | `setupLogExport(root)` | Shared log downloads and message detail actions; lists keep their existing save lifecycle. |
| [frontend/admin/static/js/native-metadata-query.js](../frontend/admin/static/js/native-metadata-query.js) | `setupMetadata(root,{form=null,onSelect=()`；`stop()`；`clear()`；`changed()`；`select(candidate,control)`；`show(result)` | One query widget for paper drafts and read-only lookup. Results are text nodes, never trusted HTML. |
| [frontend/admin/static/js/native-navigation.js](../frontend/admin/static/js/native-navigation.js) | `syncNavigationPresentation()` | One navigation draft: visual conditions and raw path stay synchronized, while previews never save. |
| [frontend/admin/static/js/native-notifications.js](../frontend/admin/static/js/native-notifications.js) | `notify(message,state='info',{id='operation',action=null,duration}={})`；`rememberNotice(message,state,target)`；`consumeNotice()` | Shared bounded notifications; text only, no external dependency and no layout reflow. |
| [frontend/admin/static/js/native-public-cache.js](../frontend/admin/static/js/native-public-cache.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Explicit one-module maintenance; no polling, warming, or automatic retry. |
| [frontend/admin/static/js/native-publications.js](../frontend/admin/static/js/native-publications.js) | `protectionStatus()`；`changed()`；`generate()`；`setDraft(name,value,label)`；`changeSource(name)`；`highlightText(style)`；`cancelProfile()` | Paper draft tools: field-local undo, compact citation pairs and explicit all-format updates. |
| [frontend/admin/static/js/native-richtext-window.js](../frontend/admin/static/js/native-richtext-window.js) | `richtextWindow({form,body,tools,notice,host,imageTools,preview,beforeClose})`；`restore()`；`finish()` | One editor and one draft, moved between the bounded inline panel and a modal workspace. |
| [frontend/admin/static/js/native-richtext.js](../frontend/admin/static/js/native-richtext.js) | `initialize()`；`button(label,action,title=label)`；`invalidate()`；`syncBody()`；`snapshot()`；`server(extra={})`；`showPreview()`；`imageInspector(node)`；`applyDimensions(explicit=false)`；`insert(kind,files=[])`；`createEditor()`；`sync()` | Single-page news editor. Shared chooser, server renderer and explicit draft conversion preserve one save boundary. |
| [frontend/admin/static/js/native-services.js](../frontend/admin/static/js/native-services.js) | `serviceDraft(family)` | Shared provider configuration, explicit tests and finite single-entry translation feedback. |
| [frontend/admin/static/js/native-sessions.js](../frontend/admin/static/js/native-sessions.js) | `bindHeaders()`；`selection()`；`url(page=1)`；`responseData(response)`；`refresh(target=url()`；`perform(action,target)` | Account-local session controls: refresh fragments, preserve drafts, never retry writes automatically. |
| [frontend/admin/static/js/native-source-focus.js](../frontend/admin/static/js/native-source-focus.js) | `locate()` | Source links focus existing fields/rows without editing their values or opening dialogs. |
| [frontend/admin/static/js/native-student-categories.js](../frontend/admin/static/js/native-student-categories.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Read-only draft matching; saving remains the responsibility of the shared editor. |
| [frontend/admin/static/js/native-table-headers.js](../frontend/admin/static/js/native-table-headers.js) | `mountTableHeaders(root,{query=()`；`paint()`；`commit(values,kind,field)`；`mountListHeaders(root)` | Independent column filters and two-way sorting, shared by full pages and local panels. |
| [frontend/admin/static/js/native-table-layout.js](../frontend/admin/static/js/native-table-layout.js) | `observeActionColumn(table)`；`measure()` | Measure intrinsic action grids without a table-width feedback loop or runtime dependencies. |
| [frontend/admin/static/js/native-table-selection.js](../frontend/admin/static/js/native-table-selection.js) | `mountTableSelection(root)`；`paint()` | Shared page selection for record lists and inventory reports. |
| [frontend/admin/static/js/native-time.js](../frontend/admin/static/js/native-time.js) | `local(ms,zone)`；`choices(value,zone)`；`update()` | Shared timestamp editor. Server independently resolves the selected IANA zone. |
| [frontend/admin/static/js/native-translation-batch.js](../frontend/admin/static/js/native-translation-batch.js) | `render()`；`apply(data)`；`refresh()`；`drive()` | One browser drives bounded requests; reloads only read progress and never resume by themselves. |
| [frontend/admin/static/js/native-translation-groups.js](../frontend/admin/static/js/native-translation-groups.js) | `setupTranslationGroups(root)`；`paint()`；`read(url)` | Group selection exports and explicit per-source version adoption; no provider calls on reads. |
| [frontend/admin/static/js/native.js](../frontend/admin/static/js/native.js) | `failed(label,selector)`；`holdControls(selector,scope=document)`；`initialize()` | Isolated feature loading: failed helpers cannot disable saving, media or unrelated editors. |
| [frontend/admin/static/js/publication-tools.mjs](../frontend/admin/static/js/publication-tools.mjs) | `clean(value         )`；`cleanTerminal(value         )`；`normalizePublicationDoi(value         )`；`normalizePublicationTitle(value         )`；`publicationTitleSimilarity(left         , right         )`；`bibtexValue(source        , key        )`；`bibtexType(source        )`；`parseBibtex(source        )`；`detectFormat(source        )`；`finishParse(format                           , candidate                           , notes                    = [])`；`citationParts(source        )`；`parseGbt(source        , doi        )`；`parseApa(source        , doi        )`；`parseIeee(source        , doi        )`；`parseElsevierOrGeneric(source        , doi        , format                        )`；`parsePublicationCitation(value         )`；`splitPublicationAuthors(value         )`；`authorIdentity(value         )`；`latinAuthorTokens(value         )`；`authorMatches(candidate        , profileName        )`；`citationAuthorName(value        )`；`initials(parts                   , spaced = true)`；`apaAuthor(value        )`；`ieeeAuthor(value        )`；`elsevierAuthor(value        )`；`gbtAuthors(authors                   )`；`apaAuthors(authors                   )`；`joinCitationAuthors(authors                   , style                          )`；`citationTypeMark(value         )`；`bibtexEntryType(value         )`；`bibtexEscape(value         )`；`bibtexKey(source                           , authors                   )`；`matchedAuthors(authors                   , profileNames                   )`；`citationHighlights(authors                   , style                          )`；`compactSentence(parts                   )`；`endWithPeriod(value        )`；`generatePublicationCitations(source                           , profileNames                    = [])` | 后台编辑、请求与状态组件 |
| [frontend/admin/static/js/transfer-bridge.js](../frontend/admin/static/js/transfer-bridge.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Send the one-time bridge ticket in a POST body, keeping it out of browser URLs/history. |
| [frontend/admin/static/js/workspace.js](../frontend/admin/static/js/workspace.js) | `render()`；`setOpen(value)`；`reserveActions()`；`viewport()` | 后台布局增强：只管理视口、导航与焦点，不处理业务保存或权限。 |
| [frontend/public/static/design-preview/preview.js](../frontend/public/static/design-preview/preview.js) | `notify(message)`；`modal(html)`；`route(page, detail='')`；`saveUrl()`；`header()`；`footer()`；`visible()`；`card(r,i,total,page=state.page,home=false)`；`home()`；`list()`；`transfer()`；`updateTransfer()`；`updateFiles()`；`acceptFiles(files)`；`detail(id,page)`；`newsDetail(r)`；`copyEntry(r)`；`copySelected()`；`render()`；`navigate(page)`；`clearSelection()`；`fromUrl()` | Interactive design fixture only: no fetch, authentication or upload requests. |
| [frontend/public/static/js/academic.js](../frontend/public/static/js/academic.js) | `stopImages()`；`enhancePublicHeader()`；`setup()`；`close(focus=false)`；`open()`；`fit()` | One delayed retry per image, shared by logo and media enhancements. |
| [frontend/public/static/js/contact.js](../frontend/public/static/js/contact.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Progressive contact form; native POST remains available without JavaScript. |
| [frontend/public/static/js/public-auth.js](../frontend/public/static/js/public-auth.js) | `focusContent(scope)`；`validURL(value)`；`load(value,scope=slot)`；`openPage(value)` | Shared dialog/page authentication, using existing same-origin routes and cookies. |
| [frontend/public/static/js/public-authors.js](../frontend/public/static/js/public-authors.js) | `paintAuthors(root=document)` | Reuse the existing pure author matching helper; never alter stored author/citation text. |
| [frontend/public/static/js/public-filters.js](../frontend/public/static/js/public-filters.js) | `visible(node)`；`close(restore=false)`；`position(s)`；`active(s,index)`；`sync(s)`；`open(s,last=false)`；`choose(s,index)` | One progressive select enhancement; native selects still own form values. |
| [frontend/public/static/js/public-list.js](../frontend/public/static/js/public-list.js) | `appendIcon(button,name)`；`decode(url)`；`result(state)`；`node(tag,classes,text)`；`safeURL(value,local=false)`；`publicationCard(item,index,total,state)`；`newsCard(item,index,total,state)`；`compactCard(item,index,total,state)`；`card(item,index,total,state)`；`pageURL(state,page)`；`syncForm(state)`；`paging(state,data)`；`adoptInitial(url)`；`render(url,push=false,append=false)`；`valid(value)`；`facets(preserve=false)`；`load()`；`fallback()` | Complete public read models; HTML and scoped navigation remain independent. |
| [frontend/public/static/js/public-people.js](../frontend/public/static/js/public-people.js) | `fieldText(el)`；`copy(value,status)`；`cancelCitation()`；`copyCitations(items,status)`；`prepareCitations(scope=document)`；`refresh()`；`prepare()`；`markReset()`；`changingQuery()`；`navigate(event)` | Shared public list/detail controls. Existing HTML routes; no admin API or bulk prefetch. |
| [frontend/public/static/js/public-query.js](../frontend/public/static/js/public-query.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Encode visitor text state only; fixed conditions never come from this form. |
| [frontend/public/static/js/public-session.js](../frontend/public/static/js/public-session.js) | `schedule()`；`activity()`；`clearPrivate()`；`clear(reset=false)`；`feedback(text)`；`defaultLogin()`；`stop()`；`read(url,signal)`；`identity(data,cached=false)`；`apply(row)`；`watch()`；`pump()`；`start(force=false,pageCheck=false)`；`changed()` | Shared Public identity display; private data and CSRF remain request-bound. |
| [frontend/public/static/js/public-stream.js](../frontend/public/static/js/public-stream.js) | `safeNext(s,value,after=s.page)`；`watch(s)`；`updateLinks(s)`；`retryHome()`；`schedule(s,manual=false)`；`pump()`；`load(s,manual)`；`initial()`；`pause()`；`resume()`；`nearBottom()` | Bounded server-rendered chunks, shared by home modules and public lists. |
| [frontend/shared/static/js/forms.js](../frontend/shared/static/js/forms.js) | `clearErrors(form)`；`showErrors(form, message, fields = {})` | 共享/快传/同步模块；通过对应页面加载 |
| [frontend/shared/static/js/http.js](../frontend/shared/static/js/http.js) | `request(path, {method = 'GET', data, binary, csrf, timeoutMs = 10000, signal} = {})` | 共享/快传/同步模块；通过对应页面加载 |
| [frontend/shared/static/js/identity-cache.js](../frontend/shared/static/js/identity-cache.js) | `valid(v)`；`load()`；`save(data)`；`clear()`；`retry()`；`success()`；`failure()`；`invalidate()`；`acceptLogin(data,target=null)`；`consumeLogin()` | Five display fields only; never a permission, session or CSRF cache. |
| [frontend/shared/static/js/navigation-guard.js](../frontend/shared/static/js/navigation-guard.js) | `eligible(event)`；`reset()` | Native navigation stays native. Only disposable reads listen to these events. |
| [frontend/shared/static/js/news-reader.js](../frontend/shared/static/js/news-reader.js) | `pdfLibrary()`；`release(slot)`；`mountNewsReader(root=document)` | Shared inline PDF reader: lazy documents, per-page geometry, bounded canvases and explicit recovery. |
| [frontend/shared/static/js/public-background.js](../frontend/shared/static/js/public-background.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | CSS owns drawing and motion. Pause it when this public page is not visible. |
| [frontend/shared/static/js/public-controls.js](../frontend/shared/static/js/public-controls.js) | `prepareMedia(scope)` | Public-only progressive controls; no form, account or transfer mutation. |
| [frontend/shared/static/js/public-time.js](../frontend/shared/static/js/public-time.js) | `prepare(root)` | Shared public timestamp enhancement; UTC attributes remain unchanged for crawlers. |
| [frontend/shared/static/js/reading.js](../frontend/shared/static/js/reading.js) | `sync()` | Reuse the existing preference; public controls do not alter admin typography. |
| [frontend/shared/static/js/upload.js](../frontend/shared/static/js/upload.js) | `upload(file,csrf,notify=()` | 共享/快传/同步模块；通过对应页面加载 |
| [frontend/shared/static/js/vendor-loader.js](../frontend/shared/static/js/vendor-loader.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/chunk-client.js](../transfer/frontend/native/chunk-client.js) | `readBlock(response)` | Shared bounded binary response reader for cached and online receiving. |
| [transfer/frontend/native/examples.js](../transfer/frontend/native/examples.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Examples use the existing session and CSRF; settings drafts are retained after every action. |
| [transfer/frontend/native/folder-manifest.js](../transfer/frontend/native/folder-manifest.js) | `segment(name)`；`validPath(path,limits=LIMITS)`；`builder(rootName,options={})`；`add(path,kind,file)`；`tick()`；`finish(emptyDirectoriesKnown)`；`fromHandle(handle,options={})`；`walk(dir,prefix='',depth=0)`；`fromFileList(files,options={})`；`fromEntry(entry,options={})`；`captureDrop(items)` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/folder-receive.js](../transfer/frontend/native/folder-receive.js) | `readManifest(call,info,stopped=()`；`absent(parent,name,kind)`；`folderSink(parent,manifest,{progress=()`；`keepAlive()`；`advance(stopped=()` | Validate paged metadata, then write one file at a time in a fresh child folder. |
| [transfer/frontend/native/folder-upload.js](../transfer/frontend/native/folder-upload.js) | `folderFile(manifest)`；`sendFolder({manifest,current,csrf,created=()` | One cached task; bounded manifests and existing hashed chunk uploader. |
| [transfer/frontend/native/lan-core.js](../transfer/frontend/native/lan-core.js) | `message(value,type)`；`sendFile({wire,file,rate,progress=()`；`receiveFile({wire,size,sink,progress=()`；`connectionPath(pc)` | Bounded DataChannel adapter. Logical blocks reuse the existing receive/ACK sink. |
| [transfer/frontend/native/live-folder.js](../transfer/frontend/native/live-folder.js) | `selectedFolder()`；`submitManifest(call,manifest,stopped=()`；`directoryStream(parent,info,call,{stopped=()` | Transport-neutral adapter: existing local manifest + virtual file + directory sink. |
| [transfer/frontend/native/native.js](../transfer/frontend/native/native.js) | `bindTaskHeaders()`；`request(path,options={})`；`api(path,data)`；`refreshTasks(automatic=false)`；`currentQuery()`；`setBusy(value)`；`runBatch(data,label)`；`loadUsage()`；`drawCache()`；`cacheRow(item,index)`；`scanCache(next=false)`；`deleteCache(items)` | 分页仅读取，写操作显式触发；批量写入仅在前一批成功后继续。 |
| [transfer/frontend/native/portal-codes.js](../transfer/frontend/native/portal-codes.js) | `registerCodeReceiver(mode,receiver)`；`receiveKey()`；`normalizeCode(value)`；`receiveCode(value)`；`codeCard(host,{input=null}={})`；`issue()` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/portal-core.js](../transfer/frontend/native/portal-core.js) | `shareURL(text,origin)`；`bytes(n)`；`request(path,options={})`；`upload({file,current,csrf,maxBytes,call=request,hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()`；`wait(ms)` | Frontend-only transport. Never retries a write automatically. |
| [transfer/frontend/native/portal-folder-send.js](../transfer/frontend/native/portal-folder-send.js) | `refresh()`；`remember(value)` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/portal-folder.js](../transfer/frontend/native/portal-folder.js) | `reset()`；`render()`；`scan(read)` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/portal-lan.js](../transfer/frontend/native/portal-lan.js) | `controls()`；`cleanup(task=current,notify=true)`；`fail(error,task=current)`；`schedule(task,ms)`；`signal(task,description)`；`gather(pc)`；`end(error)`；`channel(task,dc)`；`connect(task,offer=null)`；`poll(task)`；`send(folder=false)` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/portal-receive.js](../transfer/frontend/native/portal-receive.js) | `controls()`；`read(offset)`；`makeKey()`；`shareLanding()` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/portal-relay.js](../transfer/frontend/native/portal-relay.js) | `controls()`；`binary(t,offset,body)`；`heartbeat(t)`；`init(t)`；`send(folder=false)` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/portal-shell.js](../transfer/frontend/native/portal-shell.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | Display-only controller. Existing transport controllers own every task and request. |
| [transfer/frontend/native/portal.js](../transfer/frontend/native/portal.js) | `readSaved()`；`save(value)`；`select(next)`；`usage()` | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/receive-core.js](../transfer/frontend/native/receive-core.js) | `receive({session,sink,call,read,hash,stopped=()` | One received block awaits sink.write and ACK before the next read. No whole-file Blob. |
| [transfer/frontend/native/relay-core.js](../transfer/frontend/native/relay-core.js) | `relaySend({file,call,put,stopped=()` | Sender progresses only after server state confirms the receiver's write ACK. |
| [transfer/frontend/native/settings.js](../transfer/frontend/native/settings.js) | `mountSettings({api,request,loadUsage})`；`refreshUsage()` | Reuse the existing request/CSRF pipeline, preserving unsaved settings during task refresh. |
| [transfer/frontend/native/storage-status.js](../transfer/frontend/native/storage-status.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/transfer-i18n-catalog.js](../transfer/frontend/native/transfer-i18n-catalog.js) | 模块初始化 / 匿名事件回调；具体方法见源码 | 共享/快传/同步模块；通过对应页面加载 |
| [transfer/frontend/native/transfer-i18n.js](../transfer/frontend/native/transfer-i18n.js) | `t(key,args=[])`；`joinText(a,b)`；`errorText(value)`；`bind(node,name,value)`；`getText(node)`；`setText(node,value)`；`setAttr(node,name,value)`；`renderPage()`；`getLanguage()`；`setLanguage(next,{refreshHeader=true}={})` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/connection.mjs](../site_sync/frontend/static/connection.mjs) | 模块初始化 / 匿名事件回调；具体方法见源码 | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/control.mjs](../site_sync/frontend/static/control.mjs) | `load(value)` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/credentials.mjs](../site_sync/frontend/static/credentials.mjs) | `lock(value)`；`hidden()`；`clean(value)`；`api(action,data)`；`describe(result)`；`perform(work,feedback=true)`；`loadCurrent()` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/feedback.mjs](../site_sync/frontend/static/feedback.mjs) | `show(title,text,state)`；`begin(title='同步操作')`；`finish(text,state='success',title='同步操作结果')`；`confirmAction(text)`；`isOperationOpen()` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/model.mjs](../site_sync/frontend/static/model.mjs) | `time(value)`；`status(t,now)`；`settings(form,partial=false)`；`explanation(code)`；`currentState(t)` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/navigation.mjs](../site_sync/frontend/static/navigation.mjs) | `locate(hash)` | Open folded settings and locate them inside the existing admin scroller. |
| [site_sync/frontend/static/panel.mjs](../site_sync/frontend/static/panel.mjs) | `el(tag,text,cls)`；`button(text,fn)`；`scope(f)`；`updateScope(f)`；`scopePicker(f,modules,details={})`；`api(path,body)`；`action(fn)`；`drawTasks(now)`；`tasksPage(more=false)`；`monitor(d)`；`logsPage(older=false)`；`openTask(id)`；`itemsPage(more)`；`fillSchedule(s)`；`schedulesPage(more=false)`；`refresh()` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/proposal-client.mjs](../site_sync/frontend/static/proposal-client.mjs) | `retryKey(origin,scope)`；`requestJSON(url,{body,fetcher=fetch,timeoutMs=30000}={})` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/proposal-ui.mjs](../site_sync/frontend/static/proposal-ui.mjs) | `installProposal({begin=()`；`load()`；`submit(scope,existing)` | 共享/快传/同步模块；通过对应页面加载 |
| [site_sync/frontend/static/status-poller.mjs](../site_sync/frontend/static/status-poller.mjs) | `createStatusPoller({run,visible=()`；`tick()` | 共享/快传/同步模块；通过对应页面加载 |

## 模板复用与样式入口

模板没有Python函数；Jinja宏才是可include/import的模板符号。先定位完整路径，再查看下表实际extends/include/import关系；含动态模板名的关系在运行上下文解析，不可按字面文件名打开。

| 模板文件 | 当前复用关系/宏 |
| --- | --- |
| [frontend/admin/templates/layout.html](../frontend/admin/templates/layout.html) | 复用 shared/base.html, shared/macros.html, admin/native-media-picker.html, admin/native-media-crop.html |
| [frontend/admin/templates/native-access-error.html](../frontend/admin/templates/native-access-error.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-account-cell.html](../frontend/admin/templates/native-account-cell.html) | ；宏 account_cell(table,col,row,model,principal) |
| [frontend/admin/templates/native-account-password.html](../frontend/admin/templates/native-account-password.html) | 复用 admin/native-help.html |
| [frontend/admin/templates/native-account-tabs.html](../frontend/admin/templates/native-account-tabs.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-bridge.html](../frontend/admin/templates/native-bridge.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-citation-parser.html](../frontend/admin/templates/native-citation-parser.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-dashboard.html](../frontend/admin/templates/native-dashboard.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-data-tools.html](../frontend/admin/templates/native-data-tools.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-draft-review.html](../frontend/admin/templates/native-draft-review.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-edit.html](../frontend/admin/templates/native-edit.html) | 复用 admin/layout.html, admin/native-fields.html, admin/native-help.html, admin/native-account-tabs.html, admin/native-fixed-scope.html, admin/native-translation-comparison.html, admin/native-publication-citations.html, admin/native-footer-help.html, admin/native-citation-parser.html, admin/native-navigation.html, admin/native-metadata.html, admin/native-account-password.html, admin/native-permissions.html, admin/native-student-category.html, admin/native-translation-tools.html, admin/native-translation-source.html |
| [frontend/admin/templates/native-examples.html](../frontend/admin/templates/native-examples.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-fields.html](../frontend/admin/templates/native-fields.html) | 复用 admin/native-metadata-providers.html, admin/native-media-field.html；宏 control(field, spec, value, choices, json_dump) |
| [frontend/admin/templates/native-fixed-scope.html](../frontend/admin/templates/native-fixed-scope.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-footer-help.html](../frontend/admin/templates/native-footer-help.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-help.html](../frontend/admin/templates/native-help.html) | ；宏 hint(id,text) |
| [frontend/admin/templates/native-list-panel.html](../frontend/admin/templates/native-list-panel.html) | 复用 admin/native-table-parts.html, admin/native-pagination.html, admin/native-media-parts.html, admin/native-account-cell.html, admin/native-translation-cell.html, admin/native-account-tabs.html, admin/native-media-tabs.html, admin/native-fixed-scope.html, admin/native-message-tools.html, admin/native-log-tools.html, admin/native-message-source.html, admin/native-order-cell.html |
| [frontend/admin/templates/native-list.html](../frontend/admin/templates/native-list.html) | 复用 admin/layout.html, admin/native-list-panel.html |
| [frontend/admin/templates/native-log-tools.html](../frontend/admin/templates/native-log-tools.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-login.html](../frontend/admin/templates/native-login.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-maintenance.html](../frontend/admin/templates/native-maintenance.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-media-audit.html](../frontend/admin/templates/native-media-audit.html) | 复用 admin/layout.html, admin/native-pagination.html, admin/native-table-parts.html, admin/native-media-parts.html |
| [frontend/admin/templates/native-media-crop.html](../frontend/admin/templates/native-media-crop.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-media-detail.html](../frontend/admin/templates/native-media-detail.html) | 复用 admin/layout.html, admin/native-media-parts.html, admin/native-pagination.html, admin/native-media-locations.html |
| [frontend/admin/templates/native-media-field.html](../frontend/admin/templates/native-media-field.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-media-locations.html](../frontend/admin/templates/native-media-locations.html) | 复用 admin/native-pagination.html |
| [frontend/admin/templates/native-media-parts.html](../frontend/admin/templates/native-media-parts.html) | ；宏 thumbnail(row,source=none,details=none,peek=false), media_cell(col,row), preview(row) |
| [frontend/admin/templates/native-media-picker.html](../frontend/admin/templates/native-media-picker.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-media-tabs.html](../frontend/admin/templates/native-media-tabs.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-message-source.html](../frontend/admin/templates/native-message-source.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-message-tools.html](../frontend/admin/templates/native-message-tools.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-metadata-page.html](../frontend/admin/templates/native-metadata-page.html) | 复用 admin/layout.html, admin/native-metadata-query.html |
| [frontend/admin/templates/native-metadata-providers.html](../frontend/admin/templates/native-metadata-providers.html) | 复用 admin/native-service-providers.html |
| [frontend/admin/templates/native-metadata-query.html](../frontend/admin/templates/native-metadata-query.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-metadata.html](../frontend/admin/templates/native-metadata.html) | 复用 admin/native-metadata-query.html, admin/native-draft-review.html |
| [frontend/admin/templates/native-navigation-results.html](../frontend/admin/templates/native-navigation-results.html) | 复用 admin/native-pagination.html |
| [frontend/admin/templates/native-navigation.html](../frontend/admin/templates/native-navigation.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-order-cell.html](../frontend/admin/templates/native-order-cell.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-pagination.html](../frontend/admin/templates/native-pagination.html) | ；宏 pager(listing, page_url=none, numbers=none, preview=false, unit='条'), page_item(p,text,title,disabled,current,page_url,preview,number) |
| [frontend/admin/templates/native-password.html](../frontend/admin/templates/native-password.html) | 复用 admin/layout.html, admin/native-help.html |
| [frontend/admin/templates/native-permissions.html](../frontend/admin/templates/native-permissions.html) | 复用 admin/native-help.html |
| [frontend/admin/templates/native-publication-citations.html](../frontend/admin/templates/native-publication-citations.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-record-detail.html](../frontend/admin/templates/native-record-detail.html) | 复用 admin/layout.html, admin/native-message-source.html |
| [frontend/admin/templates/native-service-providers.html](../frontend/admin/templates/native-service-providers.html) | 复用 admin/native-help.html |
| [frontend/admin/templates/native-sessions.html](../frontend/admin/templates/native-sessions.html) | 复用 admin/native-pagination.html |
| [frontend/admin/templates/native-student-category.html](../frontend/admin/templates/native-student-category.html) | 复用 admin/native-student-matches.html |
| [frontend/admin/templates/native-student-matches.html](../frontend/admin/templates/native-student-matches.html) | 复用 admin/native-pagination.html |
| [frontend/admin/templates/native-suggestions.html](../frontend/admin/templates/native-suggestions.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-table-parts.html](../frontend/admin/templates/native-table-parts.html) | ；宏 column_header(col,label,spec,visible=true,first=false,fixed=none), column_controls(columns,column_labels,recommended_columns) |
| [frontend/admin/templates/native-transfer.html](../frontend/admin/templates/native-transfer.html) | 复用 admin/layout.html |
| [frontend/admin/templates/native-translation-batch.html](../frontend/admin/templates/native-translation-batch.html) | 复用 admin/layout.html, admin/native-help.html |
| [frontend/admin/templates/native-translation-cell.html](../frontend/admin/templates/native-translation-cell.html) | ；宏 translation_cell(col,row) |
| [frontend/admin/templates/native-translation-comparison.html](../frontend/admin/templates/native-translation-comparison.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-translation-group-panel.html](../frontend/admin/templates/native-translation-group-panel.html) | 复用 admin/native-pagination.html |
| [frontend/admin/templates/native-translation-group.html](../frontend/admin/templates/native-translation-group.html) | 复用 admin/layout.html, admin/native-translation-group-panel.html |
| [frontend/admin/templates/native-translation-source.html](../frontend/admin/templates/native-translation-source.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/admin/templates/native-translation-tools.html](../frontend/admin/templates/native-translation-tools.html) | 复用 admin/native-help.html |
| [frontend/public/static/design-preview/index.html](../frontend/public/static/design-preview/index.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/action.html](../frontend/public/templates/action.html) | 复用 public/layout.html, public/contact-form.html |
| [frontend/public/templates/auth-form.html](../frontend/public/templates/auth-form.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/auth-page.html](../frontend/public/templates/auth-page.html) | 复用 public/layout.html, public/auth-form.html |
| [frontend/public/templates/back-top.html](../frontend/public/templates/back-top.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/card-fields.html](../frontend/public/templates/card-fields.html) | ；宏 fields(row, items, lang, template=false) |
| [frontend/public/templates/card-icons.html](../frontend/public/templates/card-icons.html) | ；宏 icon(name), list_icons() |
| [frontend/public/templates/citation.html](../frontend/public/templates/citation.html) | ；宏 fallback(row,lang,style,slots=false) |
| [frontend/public/templates/contact-fields.html](../frontend/public/templates/contact-fields.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/contact-form.html](../frontend/public/templates/contact-form.html) | 复用 public/contact-fields.html |
| [frontend/public/templates/content-body.html](../frontend/public/templates/content-body.html) | 复用 public/content-config.html, public/card-fields.html, public/card-icons.html, public/citation.html, public/project-card.html, public/course-card.html, public/patent-card.html, public/content-fields.html, public/content-links.html, public/publication-tags.html |
| [frontend/public/templates/content-card.html](../frontend/public/templates/content-card.html) | 复用 public/news-media.html, public/description-attributes.html, public/content-body.html |
| [frontend/public/templates/content-config.html](../frontend/public/templates/content-config.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/content-detail.html](../frontend/public/templates/content-detail.html) | 复用 public/content-config.html, public/content-fields.html, public/content-links.html, public/news-media.html, public/contact-fields.html |
| [frontend/public/templates/content-entry.html](../frontend/public/templates/content-entry.html) | 复用 public/time.html |
| [frontend/public/templates/content-fields.html](../frontend/public/templates/content-fields.html) | 复用 public/time.html |
| [frontend/public/templates/content-links.html](../frontend/public/templates/content-links.html) | 复用 public/card-icons.html |
| [frontend/public/templates/course-card.html](../frontend/public/templates/course-card.html) | 复用 public/description-button.html |
| [frontend/public/templates/description-attributes.html](../frontend/public/templates/description-attributes.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/description-button.html](../frontend/public/templates/description-button.html) | 复用 public/card-icons.html |
| [frontend/public/templates/filter-control.html](../frontend/public/templates/filter-control.html) | 复用 public/card-icons.html |
| [frontend/public/templates/header.html](../frontend/public/templates/header.html) | 复用 shared/macros.html, public/native-navigation-links.html, public/reading-controls.html |
| [frontend/public/templates/home-card.html](../frontend/public/templates/home-card.html) | 复用 public/news-media.html, public/person-fields.html, public/content-body.html |
| [frontend/public/templates/home-icons.html](../frontend/public/templates/home-icons.html) | 复用 public/card-icons.html；宏 arrow(external=false) |
| [frontend/public/templates/home-section.html](../frontend/public/templates/home-section.html) | 复用 public/home-icons.html, public/home-card.html, public/stream-controls.html |
| [frontend/public/templates/home.html](../frontend/public/templates/home.html) | 复用 public/person-overview.html, public/native-navigation-links.html, public/home-section.html |
| [frontend/public/templates/layout.html](../frontend/public/templates/layout.html) | 复用 shared/base.html, public/header.html, public/back-top.html |
| [frontend/public/templates/list-rows.html](../frontend/public/templates/list-rows.html) | 复用 public/home-card.html, public/person-card.html, public/content-card.html |
| [frontend/public/templates/native-footer-links.html](../frontend/public/templates/native-footer-links.html) | 复用 public/native-navigation-links.html |
| [frontend/public/templates/native-footer.html](../frontend/public/templates/native-footer.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/native-navigation-links.html](../frontend/public/templates/native-navigation-links.html) | 复用 shared/macros.html |
| [frontend/public/templates/native.html](../frontend/public/templates/native.html) | 复用 public/layout.html, public/home.html, public/person-detail.html, public/content-detail.html, public/person-tools.html, public/card-icons.html, public/content-card.html, public/person-links.html, public/list-rows.html, public/stream-controls.html |
| [frontend/public/templates/news-media.html](../frontend/public/templates/news-media.html) | ；宏 cover(row,media_map,css='content-cover',detail=false,lang='zh') |
| [frontend/public/templates/patent-card.html](../frontend/public/templates/patent-card.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/person-card.html](../frontend/public/templates/person-card.html) | 复用 public/person-media.html, public/card-icons.html, public/description-attributes.html, public/person-identity.html, public/person-contact.html, public/person-fields.html, public/person-links.html, public/description-button.html |
| [frontend/public/templates/person-connections.html](../frontend/public/templates/person-connections.html) | 复用 public/person-contact.html, public/person-links.html |
| [frontend/public/templates/person-contact.html](../frontend/public/templates/person-contact.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/person-detail.html](../frontend/public/templates/person-detail.html) | 复用 public/card-icons.html, public/person-overview.html |
| [frontend/public/templates/person-fields.html](../frontend/public/templates/person-fields.html) | 复用 public/person-contact.html |
| [frontend/public/templates/person-identity.html](../frontend/public/templates/person-identity.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/person-links.html](../frontend/public/templates/person-links.html) | 复用 public/card-icons.html |
| [frontend/public/templates/person-media.html](../frontend/public/templates/person-media.html) | ；宏 avatar(row,lang,media_map,css='person-photo',size=88,eager=false) |
| [frontend/public/templates/person-overview.html](../frontend/public/templates/person-overview.html) | 复用 public/person-media.html, public/person-connections.html, public/person-identity.html |
| [frontend/public/templates/person-tools.html](../frontend/public/templates/person-tools.html) | 复用 public/card-icons.html, public/filter-control.html |
| [frontend/public/templates/project-card.html](../frontend/public/templates/project-card.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/publication-tags.html](../frontend/public/templates/publication-tags.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/reading-controls.html](../frontend/public/templates/reading-controls.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/stream-controls.html](../frontend/public/templates/stream-controls.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/public/templates/time.html](../frontend/public/templates/time.html) | ；宏 timestamp(value) |
| [frontend/shared/templates/base.html](../frontend/shared/templates/base.html) | 复用 public/native-footer.html |
| [frontend/shared/templates/list-pagination.html](../frontend/shared/templates/list-pagination.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [frontend/shared/templates/macros.html](../frontend/shared/templates/macros.html) | ；宏 icon(name), module_name(kind), notice(message,kind='info'), csrf_field(token), field(name,label,value='',required=false,type='text',multiline=false,maxlength=none,hint='',error='',readonly=false,autocomplete='off'), error_summary(message,fields={}), page_header(title,description='',eyebrow='网站管理'), empty_state(title,description,href='',label=''), pager(page), badge(status,visibility='public',enabled=1) |
| [frontend/shared/templates/special-list-controls.html](../frontend/shared/templates/special-list-controls.html) | 复用 shared/list-pagination.html |
| [transfer/frontend/native/management.html](../transfer/frontend/native/management.html) | 复用 settings.html, tasks.html |
| [transfer/frontend/native/native.html](../transfer/frontend/native/native.html) | 复用 management.html |
| [transfer/frontend/native/portal.html](../transfer/frontend/native/portal.html) | ；宏 tr(value) |
| [transfer/frontend/native/rule.html](../transfer/frontend/native/rule.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [transfer/frontend/native/settings.html](../transfer/frontend/native/settings.html) | 复用 rule.html；宏 number(key,label,value='',low=0,high=9007199254740991,required=false) |
| [transfer/frontend/native/tasks.html](../transfer/frontend/native/tasks.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [site_sync/frontend/templates/connection.html](../site_sync/frontend/templates/connection.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [site_sync/frontend/templates/create.html](../site_sync/frontend/templates/create.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [site_sync/frontend/templates/operation-dialog.html](../site_sync/frontend/templates/operation-dialog.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [site_sync/frontend/templates/page.html](../site_sync/frontend/templates/page.html) | 复用 admin/layout.html, sync/panel.html, sync/operation-dialog.html |
| [site_sync/frontend/templates/panel.html](../site_sync/frontend/templates/panel.html) | 复用 sync/ |
| [site_sync/frontend/templates/schedules.html](../site_sync/frontend/templates/schedules.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [site_sync/frontend/templates/settings.html](../site_sync/frontend/templates/settings.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |
| [site_sync/frontend/templates/tasks.html](../site_sync/frontend/templates/tasks.html) | 本页/片段结构；由对应后台/公开/快传/同步路由渲染 |

### 统一样式的修改位置

| 文件 | 用法 |
| --- | --- |
| frontend/shared/static/css/public-theme.css | 统一--public-*颜色/字体/行高/阅读等级；优先在这里调公共文字风格 |
| frontend/shared/static/css/public-controls.css | 阅读、字体、语言等共用按钮布局 |
| frontend/public/static/css/academic.css | 页头、导航、各公开卡片、列表与手机布局；只引用公共变量 |
| frontend/public/static/css/faculty.css | 教师身份、联系方式、学术链接补充布局 |
| frontend/public/static/css/home.css | 首页分区和卡片布局 |
| frontend/admin/static/css/ | 后台表格/编辑/辅助功能布局；按对应模板加载，不混入Public共享身份 |
| frontend/shared/static/vendor/ | 随包第三方资源和许可证，不作为本项目函数索引来源 |

## 数据与契约

- database/schema.sql是主原生DDL；database/native/schema-spec.json和editor-contract.json分别提供表/字段与编辑分区。schema_sources/schema_migrations/schema_upgrade是读取/核验/升级代码，不能用文档推导新表或默认迁移。
- site_sync/core、adapters、transport、worker保持现有签名、任务、checkpoint、租约和原生协议；其函数列在Python索引。不要根据某一子模块文件名启动第二套应用。
- transfer/backend/vps.py保留明确拒绝旧独立监听的提示，正常本地入口backend.entrypoints.vps。旧桥接/独立适配的存在不代表推荐部署方式。
- tests及各子项目测试目录保留现有测试；其函数不在生产索引。新增函数、移动模板或路由变更后同步更新本索引，不继续积累逐版复制文档。

## 显式性能探测（测试工具，不进入Worker热路径）

文件tests/probe_public_performance.py复用原探测：samples(navs=())定义有界路径；classification(status,headers)只呈现观测到的边缘状态；probe(origin,expected,navs=())执行匿名HTTP，不跟随重定向、无登录/写入/重试、单响应最多读取512KiB+1；SQLCounter临时包装既有SQL对象，计数后恢复方法；measure_local(client,sql,targets)逐请求记录；local_baseline()只在TemporaryDirectory造数并读取；main()解析--local或--origin，不接受源码内或已存在输出文件。

SQLCounter报告仅含SQL形状指纹、调用/重复次数、分类、返回行数和SQLite等待耗时，不包含原SQL、参数或查询内容。相同形状不等于相同参数，exact_duplicate_calls也不意味着可以删除安全校验。此工具仅显式测试CLI加载，生产资源工厂/路由未接入计数。

## 请求内设置与媒体入口

public_site_options(r)读取raw公开站点设置，返回副本；public_media_map(r,data)返回仅当前data允许的UID映射、附加既有MIME字段并复用已读/缺失键；public_footer.navigation(r,lang)使用当前可见范围与语言，原始行和展示副本分别保存。public_render_reads由web_common.create_base.resources每请求重新分配，缺少该容器的内部直接调用沿用即时读取，不在factory或模块中偷偷创建持久缓存。

### v0.16.132内部读取调整

backend/app/native/content.py：Content.listing签名不变。public=True且COUNT=0，在所有projection校验后返回正常空分页结果；无需调用方添加分支。backend/app/native/translation_sources.py：_overlay_batch(sql,batch)签名不变；仅未被精确本地决定阻断的字段进入共享查询，overlay/overlay_many调用方式及80字段/128KiB有界批次不变。两处不新增公共API、文件或配置选项。

### 两端运行/缓存策略定位

| 平台功能 | 文件/函数 | 具体用法 |
| --- | --- | --- |
| 公共HTTP策略 | backend/app/public_performance.py：page_request、navigation_target、page_headers、data_target、data_headers | 内部按GET/HEAD、URL/query和响应类型白名单判定；TTL为当前固定常量，不读取已废弃缓存环境开关 |
| Worker缓存开关与并发 | deploy/cloudflare/runtime/cache_policy.py：entrypoint_cache、edge_cache、policy | 构建时关闭default/general edge cache，启用PublicPage/Data缓存entrypoint；policy将流并发固定1 |
| Worker应用与数据生成 | deploy/cloudflare/runtime/entrypoint.py：LazyApplication.__call__、Default.fetch、PublicPage.fetch、PublicData.fetch；runtime/public_data.py：serve | 路由应用实例成功后复用；数据MISS最小D1生成；请求业务结果不跨请求共享 |
| 公开匿名转发 | deploy/cloudflare/runtime/public_page.py：eligible、forward、restricted_fallback | Host检查、去身份头、私有固定入口的既有动态回退；不由管理员传任意可缓存URL |
| Ubuntu主服务 | deploy/shared/service.py：main；deploy/linux/tweb.py：Manager.generate、paths | 单进程uvicorn和统一HTTP端口；paths查看实例实际位置；generate不生成Nginx proxy_cache |
| 请求内读取复用 | backend/app/native/web_common.py：create_base.resources；public_data.py：public_site_options、public_media_map；public_footer.py：navigation | r.public_render_reads每请求新建；返回副本/分语言分可见范围复用；不是Ubuntu跨请求缓存 |
| 模块维护 | backend/app/native/public_cache_tags.py及deploy/cloudflare/runtime/public_invalidation.py：relay、relay_reset、update | 后台提交后复用已有标签通道；Ubuntu维护返回not_applicable，不能清浏览器副本 |

详细边界和操作见部署手册第3/5/6节；此表是现有内部函数索引，不新增配置、服务或接口。
