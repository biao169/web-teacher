# 代码文件与函数用途

本文件描述当前运行代码的职责和可调用函数，不包含开发步骤。历史实现位于planning/archive，不属于当前入口。Python函数说明与源码docstring对应。

## 显式示例中心

| 文件 | 函数或组件 | 功能与用途 |
| --- | --- | --- |
| backend/app/native/example_catalog.py | GROUPS、identity、values、permission_preset、translation_source、translation_original、initial_translation | 定义16组数据和独立版本标识，生成真实关联、非系统角色及人工译文；核对原文后才允许预置译文。 |
| backend/app/native/example_assets.py | portrait、PDF | 用标准库构造几何PNG，提供原创演示PDF字节；经正式媒体上传服务登记。 |
| backend/app/native/example_citations.py | PAPERS | 由现有引用生成器生成的虚构论文、五种引文及高亮示例，不增加运行依赖。 |
| backend/app/native/examples.py | Examples.authorize、guard、present、status、assets、step | 读取覆盖数量，按模块授权、短租约和稳定标识逐项添加；核对真实媒体、保留现存条目，复用编辑/上传/翻译/留言服务并记录真实操作。 |
| backend/app/native/example_admin.py | install | 挂载只读页面、状态接口和有CSRF及字段白名单的逐项添加接口。 |
| backend/app/native/example_cli.py | run | 使用真实管理员登录调用同一服务，完成或失败后注销，不合成权限身份或固定密码。 |
| backend/app/native/content.py、media.py | Content.save、Media.upload 的 new_uid、creation_guard | 内部可信调用可提供稳定创建标识及额外事务条件；公共表单不接受此参数，原校验与日志保留。媒体对象键仍随机生成，避免覆盖旧文件。 |
| backend/app/native/assistance.py | Assistance.queue 的 initial_text | 内部人工示例通过同一来源/版本/权限校验建立译文；既有译文直接保留，无预置文本时保持原有排队及复用流程。 |
| backend/app/native/public_actions.py | contact 的 new_uid、before、after | 内部示例复用公开留言验证及原表写入，以同事务权限和审计包围；公开路由仍使用原调用方式。 |
| backend/app/native/demo.py | seed | 保留旧基础示例；已有native-2标记不会被旧seed降级。 |
| backend/cli.py、deploy/shared/launcher.py、add-demo-data.cmd | seed-examples、examples入口 | 显式登录后补齐新版样例；普通启动及旧seed模式保持原有行为。 |
| frontend/admin/templates/native-examples.html、frontend/admin/static/js/native-examples.js、css/native-examples.css | 示例中心及逐项控制 | 卡片分组、依赖提示、进度、暂停、重复添加、只读刷新和响应式布局，复用后台通知及权限处理。 |
| transfer/backend/examples.py | add、GuardedSQL | 独立管理权限与短租约包围真实任务创建、分块上传、暂停/撤销及缓存生成；保留已存在或中断的示例标记。 |
| transfer/backend/native.py、transfer/frontend/native/native.html、examples.js | /api/examples及示例任务按钮 | 复用签名会话、CSRF和现有额度；显式创建后显示结果，保留设置草稿。 |

## 留言与日志的共享实现

| 文件 | 函数或组件 | 功能与用途 |
| --- | --- | --- |
| backend/app/native/messages.py | validate、decorate_fields、presentation | 保护访客原始字段，限制处理状态；为共用表单和列表提供只读提示、中文选项及状态标签。 |
| backend/app/native/operation_logs.py | Logs.query、listing、get | 限定日志搜索/排序列，通过共用内容查询执行有界投影，列表与详情只返回脱敏数据。 |
| backend/app/native/operation_logs.py | Logs.export、append、csv_line | 固定ID边界并分批生成CSV/JSON，限制条数及字节数，复核交付权限，复用公式防护。 |
| backend/app/native/log_privacy.py | text、detail、record | 文本常见敏感信息处理、详情白名单递归、深度/节点/长度限制及安全非有限数值；不改数据库原值。 |
| backend/app/native/message_log_admin.py | install、detail | 复用后台渲染入口构建留言/日志只读区块、复制信息、附件入口及状态处理权限。 |
| backend/app/native/content.py | listing、save、audit、delete | 增加内部投影长度和最大ID边界；留言只保存处理字段，原始记录不物理删除，状态前后值与变更原子提交。 |
| backend/app/native/data_tools.py | csv_cell、csv_export | 业务备份与日志导出共用公式型单元格防护。 |
| backend/app/native/web.py | list_page、export、editor、row_action | 接入日志安全列表/下载及留言状态动作，禁止后台新建留言，呈现只读原文和有权限的处理控件。 |
| frontend/admin/static/js/native-http.js | requestJSON | 从列表控制器抽取共享JSON请求，限制等待、区分不确定写结果，不自动重试写请求。 |
| frontend/admin/static/js/native-copy.js | copyText、点击处理 | 显式复制邮箱或UID；使用Clipboard API和受点击触发的选择复制降级，复用顶部通知。 |
| frontend/admin/static/js/native-message-logs.js | setupLogExport、详情状态点击处理 | 按筛选生成脱敏文件，下载失败保留页面；确认后单独更新状态，不确定结果锁定至重新读取。 |
| frontend/admin/static/js/native-list.js | mountList、batch | 挂载日志下载和留言批量状态动作；复用逐条提交、首错停止、片段刷新及通知生命周期。 |
| frontend/admin/templates/native-record-detail.html | 共享详情 | 留言纯文本与日志脱敏JSON复用两列/手机单列分区、目录、固定底栏与复制控件。 |
| frontend/admin/templates/native-message-tools.html、native-log-tools.html | 工具栏片段 | 在既有工具栏组合处理状态、导出格式及详情选项，不创建第二套列表。 |
| frontend/admin/templates/native-fields.html | control | 支持无name属性的只读内容，避免访客原文字段混入处理表单。 |

## backend/app/adapters/d1/sql.py

D1 SQL adapter with atomic batches and native domain errors; no schema translation.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `plain` | Normalize Pyodide JS values into plain Python records. |
| `rows` | 把D1返回的结果集合转换为普通Python字典列表。 |
| `D1SQL.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `D1SQL.statement` | 预处理SQL并绑定参数，不拼接用户输入。 |
| `D1SQL.query` | 执行查询并返回规范化的记录列表。 |
| `D1SQL.batch` | 以一个数据库事务提交有界SQL批次，保持原子性。 |

## backend/app/adapters/local_files/scholarly.py

Read-only fixed-origin HTTPS; no redirect, bounded bytes and socket timeout.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `NoRedirect.redirect_request` | 拦截外部查询重定向，防止固定服务请求转向其他地址。 |
| `CrossrefTransport.get` | 从本适配器的数据源读取指定对象或记录。 |
| `CrossrefTransport._get` | 从允许的学术元数据服务获取有大小和超时限制的JSON。 |

## backend/app/adapters/local_files/translation.py

Bounded local translation I/O; provider payloads are built by the shared service.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `TranslationTransport.__init__` | Keep the deployment-approved custom hosts outside editable provider payloads. |
| `TranslationTransport.send` | Run blocking HTTPS outside the event loop with per-call and socket time budgets. |
| `TranslationTransport._send` | Read limited chunks without following redirects or returning upstream error bodies. |


## backend/app/adapters/sqlite/passwords.py

CPython/OpenSSL KDF; one bounded hashing operation at a time per process.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `LocalKDF.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `LocalKDF.__call__` | 串行执行本地密码派生，防止高并发占用过多资源。 |

## backend/app/adapters/worker_crypto/passwords.py

Workers Web Crypto adapter; real Pyodide/runtime verification remains required.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `derive` | 使用Web Crypto按指定盐和迭代次数执行PBKDF2。 |
| `derive.obj` | 将Python字典转换为Web Crypto所需的JavaScript对象。 |

## backend/app/adapters/worker_crypto/scholarly.py

Worker HTTP adapter; imports only inside the Worker call.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `CrossrefTransport.get` | 从本适配器的数据源读取指定对象或记录。 |
| `CrossrefTransport.get.fetch_bounded` | 用流式读取限制学术查询响应体大小。 |

## backend/app/adapters/worker_crypto/translation.py

Worker translation I/O uses the same request policy and bounded JSON decoding as local.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `TranslationTransport.__init__` | Store the deployment-approved custom hosts, independent of request form input. |
| `TranslationTransport.send` | Fetch with an abort signal, redirect refusal and a bounded stream; never log bodies. |


## backend/app/config.py

One storage configuration for Windows, Linux and Workers; environment overrides TOML.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Settings.__post_init__` | 解析独立存储地址，并确保数据根目录及各存储地址位于源码外；保护联合启动密钥不随源码更新丢失。 |
| `Settings.from_env` | Read TEACHER_CONFIG TOML locally; Worker vars use the same TEACHER_* keys. |

## backend/app/domain/admin_presentation.py

Backend-only presentation defaults; never rewrite stored timestamps or permissions.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `admin_datetime` | Display ISO timestamps or Unix seconds; preserve date-only values and reject malformed dates. |

## backend/app/domain/richtext.py

One safe HTML policy; DOM postprocessing only narrows trusted sanitizer output.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `render_body` | 三种原生正文格式共用安全输出；Markdown原始HTML只作为文字，源码不改写。 |
| `body_references` | 以实际呈现格式提取媒体引用；纯文本、代码示例和转义HTML不会获得公开授权。 |
| `convert_body` | 显式转换编辑格式；返回受控HTML或文本，调用方须提示排版可能损失。 |
| `media_references` | 以正文相同安全策略提取精确媒体UID；纯文字地址和相似前缀不构成引用。 |
| `clean` | 清理HTML中的危险标签、属性和链接，仅保留受支持的富文本。 |
| `normalize_bodies` | 规范文本与HTML正文的格式及长度限制。 |
| `plain_to_html` | 转义纯文本并保留换行，生成可安全显示的HTML。 |
| `html_to_plain` | 提取富文本的可读纯文本，供搜索和摘要使用。 |

## backend/app/native/assistance.py

Read-only input assistance and translation cache writes using native reference fields.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Assistance.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Assistance.metadata` | 将DOI调用委托共用MetadataSearch，返回首个候选字段或可读错误，不写论文。 |
| `Assistance.source` | 使用共享来源白名单核对原文标识、全文、摘要和原文查看权限。 |
| `Assistance.queue` | 从授权的已保存原文建立条目，复用相同来源摘要和目标语言的既有条目；批次调用附加任务及公开来源领取条件。 |
| `Assistance.translate` | 调用已配置服务并按版本写入译文；拒绝人工及显式停用记录，正文校验媒体引用，并在事务内检查权限、原文、网络租约和可选批次领取。 |

## backend/app/native/auth.py

Native role/session authentication, password hashing, CSRF and transactional write guards.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Auth.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Auth.bootstrap` | Create the sole initial administrator explicitly, never on ordinary startup. |
| `Auth.login` | Reserve account/network attempts before expensive KDF; inactive roles cannot log in. |
| `Auth.principal` | Re-read role and session for each request; return no password/hash secrets. |
| `Auth.require` | All action gates are server-side, including custom navigation destinations. |
| `Auth.guard` | An invalid guard UID aborts the entire SQLite/D1 batch on stale authorization/CAS. |
| `Auth.logout` | Revoke only the current session. |
| `Auth.password` | Verify the current password, replace its hash and revoke all sessions atomically. |

## backend/app/native/bridge.py

Short-lived signed CMS-to-transfer identity tickets; one-time nonce consumption is in transfer DB.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `sign` | HMAC is only a bridge envelope, never a replacement for password hashing. |
| `verify` | Verify signature, audience, expiry and maximum lease duration before trusting identity. |

## backend/app/native/catalog.py

Native field registry, shared editor sections and server-side validation.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Error.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `now` | Canonical 24-character timestamps; strict monotonic update tokens avoid lost writes. |
| `fields` | Return only approved editable native fields, retaining hidden columns in storage. |
| `label` | 从共享字段元数据取得后台中文标签。 |
| `sections` | 对可编辑字段分区、去重并补齐未分组字段，每个字段只进入一个编辑区。 |
| `defaults` | Display schema defaults without inserting a record. |
| `normalize` | Reject unknown input; validate types, required values, links and native constraints. |

## backend/app/native/editor.py

统一后台编辑描述与关联候选，不修改数据库结构或前台展示。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `editor_fields` | 合并原生类型、文档控件提示、中文标签、帮助文字与展示布局；集中控制多行输入、社交链接数值、可见性选项和表单实际提交值。 |
| `editor_sections` | 生成字段区和辅助工具区的统一目录；将每个学术链接与手工显示数值成对排列，仅添加当前记录适用的工具。 |
| `reference_choices` | 按权限读取候选标识与名称；普通关联最多100条、媒体最多1000条，另补回当前已保存关联，避免候选截断造成关联丢失；同类引用复用请求内查询。 |

## backend/app/native/content.py

Native CRUD, visibility, fixed navigation scopes, category matching and safe exports.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Content.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Content.scope` | Physical native visibility is checked in SQL; public queries never expose hidden rows. |
| `Content.navigation` | Resolve ASCII navigation ID; mandatory base filters stay in native path server-side. |
| `Content.parse_navigation` | Allowlisted table/field equality filters only; repeated or unknown fields are errors. |
| `Content.listing` | Compose authorization AND fixed filters AND user filters, then page using 10/20/50/100. |
| `Content.get` | Read a single authorized record, excluding all password/provider secrets. |
| `Content.save` | Native writes use updated_at CAS and audit in the same authorization-guarded batch. |
| `Content.audit` | Audit metadata only; never serialize submitted passwords or provider credentials. |
| `Content.delete` | Respect native RESTRICT foreign keys; no cascading application-side data removal. |
| `Content.matches` | 按共享关键词规则返回授权学生的匹配总数和当前页，不写入分类关系。 |

## backend/app/native/data_tools.py

业务表白名单、完整字段导出与恢复字段校验；认证及内部运行表不在业务范围。

| 函数 | 功能与用途 |
| --- | --- |
| `encoded`、`digest` | 生成确定性UTF-8文档及不可逆摘要，供票据比对使用。 |
| `authorize`、`selection` | 检查系统管理员、模块权限及明确的业务表选择，拒绝任意表名。 |
| `snapshot` | 有界读取全站业务UID和更新时间，供预检及提交时核对。 |
| `export` | 以事务读取完整原生字段，检查权限和字节预算，按格式剔除敏感字段。 |
| `csv_export` | 输出含BOM的单表CSV，保留多行内容并中和公式前缀。 |
| `row_values` | 使用共享原生标量校验器检查恢复字段、UID和敏感值边界。 |
| `validate_domain` | 复用媒体、富文本、导航、分类及供应商配置的业务规则。 |

## backend/app/native/data_restore.py

会话绑定预检、媒体暂存与有界原子恢复；票据不保存记录正文或服务密钥。

| 函数 | 功能与用途 |
| --- | --- |
| `ticket_path`、`ticket` | 校验随机票据标识、缓存位置、会话、有效期及数据库保留标识。 |
| `cleanup`、`discard` | 清理票据所属暂存文件；取消先撤销数据库保留标识，阻止并发提交。 |
| `prepare` | 规范化所选记录，保留已有数字ID/密钥，统计增删改并检查媒体清单和容量。 |
| `references` | 计算恢复后的关联集合，检查未选表引用、唯一值、正文媒体及回收状态。 |
| `preflight` | 仅为无错误计划签发随机票据；串行管理唯一有效预检及过期暂存。 |
| `stage` | 流式接收一个媒体文件，校验摘要/长度/类型后写入配置的缓存位置。 |
| `inventory_condition` | 将预检UID/更新时间清单转换为提交事务内的比较条件。 |
| `execute` | 再次校验文件及当前数据、独占创建缺失对象、事务写入业务和日志；失败清理新对象。 |

## backend/app/native/data_admin.py

| 函数 | 功能与用途 |
| --- | --- |
| `install`、`page` | 安装共享HTTP入口和统一分区工作区，提供业务表及权限选项。 |
| `download` | 按格式返回JSON、CSV或供浏览器加密的授权业务数据。 |
| `media_bytes` | 核对登记更新时间、原对象版本/大小/摘要，返回一个本地或R2媒体正文。 |
| `preflight`、`stage`、`execute`、`cancel` | 在读取请求或调用业务服务前校验同源、会话、权限与CSRF。 |

## frontend/admin/static/js/native-data-crypto.js

`base64`、`unbase64`执行有界媒体/密文编码；`key`使用原生WebCrypto固定参数派生不可导出密钥；`encryptDocument`及`decryptDocument`封装带认证的ACMS文件，校验固定算法、口令长度和容量。错误口令或被修改密文不能产生可恢复文档，不加载第三方加密库。

## frontend/admin/static/js/native-data-tools.js 与 templates/native-data-tools.html

模板复用后台区块导航、固定底栏、紧凑字段、说明和表格。`request`统一同源JSON/原始文件请求与错误提示；`download`生成短期下载链接；`sync`根据格式、表选择和预检状态控制按钮；`invalidate`取消旧票据并清除内存草稿；`work`统一操作期间禁用控件和气泡反馈。导出、预检、确认和取消处理函数连接实际服务，媒体逐个暂存，口令与解密内容不写浏览器存储。

## backend/app/native/database.py

Fresh canonical initialization, exact schema verification and bounded SQL transactions.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Database.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Database.connect` | Open a short-lived, foreign-key enforcing connection with a 2 MiB cache. |
| `Database.initialize` | Create only an empty database; deletion occurs only with explicit reset=True. |
| `Database._reset` | Delete only the configured SQLite file and sidecars under an exclusive process lock. |
| `Database._initialize_connection` | Initialize an empty native schema; existing schema must compare exactly. |
| `Database.verify` | Compare every executable table/index definition with original final SQL. |
| `Database.query` | Parameterized read; identifiers must come from the native catalog. |
| `Database.batch` | Commit writes and audit together; RETURNING results remain inside one transaction. |

## backend/app/native/demo.py

Explicit, idempotent native-schema examples; never called by server startup.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `seed` | Insert about ten examples per content type; existing examples and user edits survive reruns. |

## backend/app/native/locking.py

Cross-platform process lock prevents resetting a database served by this application.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `RuntimeLock.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `RuntimeLock.__enter__` | 获取非阻塞运行锁，拒绝另一进程同时占用数据库。 |
| `RuntimeLock.__exit__` | 释放当前对象持有的数据库运行锁。 |

## backend/app/native/media.py

Media uses native media_assets records, bounded uploads, private reads and reference checks.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Media.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Media.upload` | One globally reserved upload, maximum 20 MiB; release reservation on every exit. |
| `Media.readable` | A public file needs an actual visible reference and public attachment policy. |
| `Media.inspect` | 后台授权用户可检查活跃或回收站媒体，公开读取仍仅接受活跃资源。 |
| `Media.status` | 引用检查期间预留短时写锁，状态、授权及审计在同一事务提交。 |
| `signature` | Accept only signatures of supported passive media types; executable HTML/SVG is excluded. |
## backend/app/native/public_actions.py

Public registration/contact writes use native accounts, messages and bounded action throttles.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `throttle` | Count attempts before work; retain no raw client address or submitted secret. |
| `register` | Create an ordinary registered role account only while registration is enabled. |
| `contact` | Store visitor messages privately; moderation fields cannot be supplied by visitors. |

## backend/app/native/runtime.py

Local runtime composition uses the same service contracts as Worker bindings.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `local` | Resolve configured addresses once; no example data or accounts are inserted here. |

## backend/app/native/storage.py

Local/R2 media and cache stores use independent configured locations, without SQL helper tables.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `key_path` | Object keys are relative ASCII paths, never user-supplied filesystem addresses. |
| `LocalStore.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `LocalStore.path` | Reject symlink escape in every path component. |
| `LocalStore.put` | Atomic replace within the configured store; files are private to the OS owner. |
| `LocalStore.get` | 读取对象；可选上限最多读取限制加一字节，避免错误登记导致无界预览。 |
| `LocalStore.delete` | 删除指定存储键对应的对象，忽略已不存在的对象。 |
| `R2Store.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `R2Store.put` | Bounded whole-object upload; authoritative metadata is committed after R2 succeeds. |
| `R2Store.get` | 先核对R2返回的实际字节大小，可选上限在读取对象正文前生效。 |
| `R2Store.delete` | 删除指定存储键对应的对象，忽略已不存在的对象。 |
## backend/app/native/web.py

Thin HTTP layer for native-schema admin and public templates; no database compatibility views.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `payload` | Bound request size and reject duplicate form/JSON keys before dispatch. |
| `create_app` | Wire one set of services to either local SQLite/files or Worker D1/R2 resources. |
| `create_app.resources` | 按请求复制资源上下文并获取当前身份，防止请求之间串用权限。 |
| `create_app.csrf` | Require configured origin plus session-bound CSRF, including fetch and multipart alternatives. |
| `create_app.context` | 组合公共页面变量、菜单、身份与模块权限。 |
| `create_app.render` | 使用指定模板与上下文输出HTML。 |
| `create_app.headers` | 核对Host并为响应设置安全策略和缓存控制。 |
| `create_app.domain_error` | 将业务异常转换为对应状态码及页面或JSON错误。 |
| `create_app.database_error` | 将数据库约束失败转换为保存冲突提示。 |
| `create_app.health` | 返回服务就绪信息，供启动器和反向代理检查。 |
| `create_app.public_form` | Render public registration/contact with a short-lived form token. |
| `create_app.public_submit` | Check origin/token, then invoke the native public action with bounded fields. |
| `create_app.login_get` | 显示管理员及注册用户共用的登录表单。 |
| `create_app.login_post` | 验证登录凭据、限流状态和来源后建立会话。 |
| `create_app.logout` | 撤销会话并清理浏览器登录Cookie。 |
| `create_app.password_get` | 显示当前登录用户的修改密码页面。 |
| `create_app.password_post` | 校验旧密码并更新密码摘要，撤销先前会话。 |
| `create_app.dashboard` | 显示用户可访问模块的后台概览。 |
| `create_app.resolve` | 解析普通模块或自定义导航，并取得固定筛选范围。 |
| `create_app.navigation_stamp` | 拒绝持有旧导航条件的编辑或快捷操作；缺少版本也不能继续写入。 |
| `create_app.check_navigation_current` | 导出交付前复核导航仍启用且未变化，避免输出旧固定范围。 |
| `create_app.list_page` | 以同一模板输出完整页或列表片段，重新核验授权、固定范围并校正实际页码。 |
| `create_app.list_page.page_url` | 保留当前筛选参数并生成目标页码链接。 |
| `create_app.custom_list` | 按照自定义导航的固定条件显示授权范围内的列表。 |
| `create_app.transfer_admin` | 显示独立快传管理入口和身份桥接说明。 |
| `create_app.export` | 导出当前权限及筛选范围内的列表数据。 |
| `create_app.editor` | 显示原生字段对应的单页分区编辑表单。 |
| `create_app.save` | 验证表单、权限和更新时间后保存整个记录。 |
| `create_app.news_body_preview` | 只读草稿预览或显式格式转换，复核新闻权限、更新时间和固定导航范围。 |
| `create_app.news_body_preview.check_source` | 返回前再次核对当前版本；预览不能跨过固定范围或旧编辑版本。 |
| `create_app.navigation_assistance` | 解析导航草稿或预览授权记录；元信息解析和数据读取分别检查所需权限。 |
| `create_app.student_matches` | 为当前分类草稿返回同一模板生成的匹配页；检查分类编辑及学生查看权限。 |
| `create_app.row_action` | 复用事务写入后回读开关与原生时间戳，使连续快捷操作使用最新实际值。 |
| `create_app.history_page` | 显示按模块和字段查询的历史词库，与表单共用权限目录。 |
| `create_app.history_suggestions` | 核验会话/CSRF和导航上下文，返回有界历史字段候选，不保存内容。 |
| `create_app.metadata_page` | 独立只读检索页复用编辑器的查询组件；不隐式创建论文。 |
| `create_app.metadata` | 查询DOI/题名候选和尝试状态；保留旧DOI服务入口的字段返回形态。 |
| `create_app.translation` | 为选定原生字段建立带来源摘要的翻译任务。 |
| `create_app.translate` | 执行指定翻译任务并按版本更新原生翻译记录。 |
| `create_app.service_test` | Test one selected draft provider with a fixed sample, without saving settings or content. |
| `create_app.translation_batch_page` | Render one shared batch workspace; no scanning or external calls occur on page load. |
| `create_app.translation_batch_status` | Read authorized progress without resuming a browser-driven job. |
| `create_app.translation_batch_action` | Apply CSRF and strict payload contracts before a bounded job action or single step. |
| `create_app.translation_invalidate` | Explicitly disable a cache under its native timestamp and edit permission. |
| `create_app.upload` | 检查上传权限和配额后保存媒体正文及元数据。 |
| `create_app.listing` | 返回查询后的原生模块记录和分页信息。 |
| `create_app.media_trash` | 回收站入口复用媒体列表的检索、列设置与分页。 |
| `create_app.media_inspect` | 显示媒体预览、元数据和按模块权限分页的真实使用位置。 |
| `create_app.media_inspect.page_url` | 引用页码链接保留当前来源分组。 |
| `create_app.media_preview` | 媒体库和回收站复用有界预览接口。 |
| `create_app.media` | 公开正文、封面和PDF阅读复用同一鉴权及分段读取接口。 |
| `create_app.transfer_login` | 生成独立快传所需的短时签名身份票据。 |
| `create_app.transfer_entry` | 通过POST提交票据到配置的快传来源。 |
| `create_app.home` | 将根页面重定向到默认语言首页。 |
| `create_app.public` | 从原生字段组合访客列表、详情、首页和翻译内容。 |

## backend/app/security/http.py

提供本目录对应的运行适配功能。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `AuthError.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `AuthConfig.from_origin` | 解析并校验站点来源，区分本地HTTP和生产HTTPS。 |
| `AuthConfig.from_env` | 读取环境配置并生成来源与Cookie策略。 |
| `AuthConfig.name` | 根据HTTPS状态选择安全Cookie名称。 |
| `AuthConfig.set_cookie` | 写入受HttpOnly、Secure和SameSite约束的Cookie。 |
| `AuthConfig.clear` | 清除本服务指定的身份或防伪Cookie。 |
| `AuthConfig.same_origin` | 拒绝与允许站点来源不一致的写请求。 |
| `AuthConfig.valid_host` | 验证请求Host与配置来源一致。 |
| `payload` | 读取有大小限制的表单或JSON正文，并拒绝重复字段。 |
| `payload.no_duplicates` | 拒绝表单中重复的字段名，避免参数解释歧义。 |

## backend/app/security/passwords.py

Password format v1; platform KDF implementations, never a home-made KDF.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `validate_password` | 检查密码长度和输入类型，避免无效密码进入派生过程。 |
| `Passwords.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Passwords.hash` | 生成独立随机盐并派生带参数的密码摘要。 |
| `Passwords.verify` | 核对发布清单中的路径、文件大小与摘要。 |

## backend/app/web/rendering.py

提供本目录对应的运行适配功能。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Renderer.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Renderer.local` | 从本地模板目录创建共享Jinja2渲染器。 |
| `Renderer.bundled` | 从Worker打包的模板字典创建Jinja2渲染器。 |
| `Renderer.render` | 使用指定模板与上下文输出HTML。 |

## backend/cli.py

Explicit local initialization, account creation, native-schema checks and demo insertion.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `main` | Maintenance always uses the same Settings as the web entrypoint. |

## backend/entrypoints/vps.py

Local main service; the configured SQLite runtime lock prevents accidental live reset.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `release` | Release only this service's database lock when shutdown finishes. |

## backend/entrypoints/worker.py

Main Python Worker using configurable D1/R2 bindings and the same native services.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `resource_factory` | Resolve current platform binding names without any local filesystem address assumptions. |

## backend/maintenance/backup.py

Local SQLite online backup and explicit stopped-service restore of the exact native schema.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `backup` | Create a consistent complete SQLite snapshot; media bodies are independently stored. |
| `restore` | Replace a stopped local database from a validated native snapshot, without migration. |
| `main` | Select configured database and explicit backup/restore file. |

## deploy/cloudflare/admin_sql.py

Capture native administrator initialization as offline SQL, without contacting D1.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Capture.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Capture.query` | 在离线捕获器中模拟空库查询，不连接远程数据库。 |
| `Capture.batch` | 记录原生管理员初始化语句，供离线SQL文件导出。 |
| `main` | Prompt for credentials and write private native SQL outside the source tree. |

## deploy/shared/bootstrap.py

One shared, idempotent environment preparation path for Windows and Linux.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `prepare_environment` | 复用虚拟环境，锁文件摘要变化时安装依赖；不读写网站数据库。 |
| `main` | Delegate legacy convenience arguments to the single configured launcher. |

## deploy/shared/package_release.py

Create verified source and lean runtime archives without touching installed data.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `archive` | Generate a content manifest and archive only validated, non-runtime files. |
| `main` | 将运行文件复制到临时目录并生成源码/精简包；两个包复用同一README，拒绝覆盖已有输出和源码内输出目录。 |

## deploy/shared/worker_package.py

Copy shared native resources into independent Worker packages; never publish or run SQL.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `prepare` | 以明确UTF-8读取模板、JSON与SQL并生成独立Worker资源；保留可配置绑定和前缀，只生成空库初始化SQL，不发布或执行云端写入。 |

## deploy/vps/release.py

Read-only preflight, immutable release inventory and configuration generation.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `digest` | 计算文件SHA-256，供发布清单校验内容。 |
| `inventory` | 收集可交付文件并拒绝数据库、凭据及不安全路径。 |
| `verify` | 核对发布清单中的路径、文件大小与摘要。 |
| `stage` | 把已核验的发布包展开到新目录，不覆盖在用版本。 |
| `check_data` | Read-only comparison of explicitly configured database files with canonical native SQL. |
| `memory` | 读取本机可获取的内存信息，供本地部署预检。 |
| `preflight` | 检查目标部署目录、可用资源及依赖条件。 |
| `safe_path` | 校验部署路径可安全写入配置文件。 |
| `domain` | 校验反向代理使用的域名格式。 |
| `render` | 生成Caddy、systemd、存储TOML和私有环境文件，不直接部署。 |
| `main` | 解析本模块命令行参数并执行对应的维护或打包功能。 |

## deploy/shared/launcher.py

Shared Windows/Linux launcher; explicit user storage configuration survives code updates.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `state_root` | Keep launcher-managed data outside replaceable source directories. |
| `configure` | TOML and explicit environment paths take precedence over launcher defaults. |
| `check_ports` | 区分POSIX停服后的TIME_WAIT与真实占用；Windows使用独占绑定检查，拒绝占用时不结束任何未知进程。 |
| `initialize` | Preserve native records; only the first empty account set prompts for an administrator. |
| `bridge_secret` | Persist a random shared bridge key outside code and disposable caches. |
| `stop` | Stop only a child process owned by this launcher. |
| `serve` | Run single-worker services, using the configured cache for logs. |
| `main` | Default missing mode to start; seed and reset remain explicit operations. |

## transfer/backend/cli.py

Initialize native transfer tables and explicitly authorize an existing teacher account UID.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `main` | Use the shared configuration for initialization and structural diagnostics. |

## transfer/backend/accounting.py

日/月授权字节预留与结算，复用原生transfer_allowances，不改变数据库结构。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `milliseconds` | 返回UTC毫秒，所有配额及租约使用同一时基。 |
| `assertion` | 条件不满足时由原生NOT NULL约束中止整个SQLite/D1事务。 |
| `identity` | 用户配额独立于角色变更，匿名下载共享同一池，不按IP拆分。 |
| `period_starts` | 使用明确的中国标准时间或UTC日/月边界，避免依赖Worker时区数据库。 |
| `limit` | 空值表示不限，零表示禁止；只接受安全范围内的非负整数字节。 |
| `Accounting.__init__` | 共享请求内SQL适配器，所有写入可并入任务事务。 |
| `Accounting.reserve` | 在同一事务内检查日/月用量与配置版本，然后占用本次授权字节。 |
| `Accounting.charge` | 按已接受上传/即将发出的下载块记账，和检查点或下载状态原子提交。 |
| `Accounting.release` | 取消/清理只释放未传额度，已经结算的字节不退款、不删除用量历史。 |
| `Accounting.usage` | 显示当前身份按授权时间归属的已用加预留量，以及每周期剩余额度。 |

## transfer/backend/management.py

全量任务分页、分批控制和缓存预检；不依赖常驻进程或新增表。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Management.__init__` | 复用当前快传服务和已配置的两个对象存储。 |
| `Management.require` | 读取与每次写操作均重新检查独立快传管理员授权。 |
| `Management.guard` | 事务内部复核管理员授权，签名会话有期限时同时检查过期。 |
| `Management.ticket` | 为分页游标和删除预检绑定操作人、用途和五分钟有效期。 |
| `Management.decode` | 拒绝其他账号、用途和过期游标；不信任客户端路径或原始目录游标。 |
| `Management.where` | 服务器白名单筛选，选择完整任务集合，不以当前页为全部范围。 |
| `Management.listing` | 按时间倒序分页；100是可选每页数量，任务总数没有上限。 |
| `Management.control` | 以原生状态和检查点版本控制任务；撤销同时释放未用流量额度。 |
| `Management.purge` | 先持久停止任务，再逐次删除至多8个分块；失败保留意图，允许再次清理。 |
| `Management.batch` | 所选最多100项，全范围使用签名游标逐批推进，清理每次仅推进一个任务。 |
| `Management.cache_page` | 只列举快传自己的文件与缓存根/前缀；活动及未清理任务文件标记受保护。 |
| `Management.delete_cache` | 复核路径、对象版本和任务引用后删除单个孤立/缓存文件，保留失败意图。 |

## transfer/backend/native.py

Independent temporary transfer service using the original 12-table metadata schema.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `ms` | 返回当前毫秒时间戳，供任务期限和速率检查。 |
| `Transfers.__init__` | 保存构造参数和适配器，供此对象后续操作复用。 |
| `Transfers.initialize` | Seed original settings only if absent; explicit CMS UID grants manager access. |
| `Transfers.manager` | 查询原生管理员授权以判断是否可控制全站任务。 |
| `Transfers.settings` | 读取或按版本保存原工具设置文档。 |
| `Transfers.task` | 按任务ID读取临时分享记录及其恢复检查点。 |
| `Transfers.policy` | Apply original identity rules; unsupported metering protection fails closed. |
| `Transfers.create` | Reserve quota and create recovery state atomically; file bytes stay in object storage. |
| `Transfers.chunk` | Immutable chunks plus native JSON checkpoints provide resumable upload without extra tables. |
| `Transfers.control` | 复用全量管理服务的权限、状态和检查点版本保护。 |
| `Transfers.cleanup` | 兼容维护入口：每次推进最多一个到期/撤销任务，保留历史和失败检查点。 |
| `app_factory` | Run on its own port/Worker; authentication is a signed bridge to configured CMS origin. |
| `app_factory.get` | 从本适配器的数据源读取指定对象或记录。 |
| `app_factory.check` | 检查快传身份、来源、防伪和管理权限。 |
| `app_factory.errors` | 将快传业务错误转换为适当的HTTP错误响应。 |
| `app_factory.protect` | 为快传请求校验来源并附加响应安全头。 |
| `app_factory.health` | 返回服务就绪信息，供启动器和反向代理检查。 |
| `app_factory.login` | 显示教师站身份入口，不创建独立密码账户。 |
| `app_factory.bridge` | 消耗一次性签名票据并建立快传短时会话。 |
| `app_factory.page` | 显示发送界面和可见任务的控制列表。 |
| `app_factory.listing` | 分页读取所有授权任务，提供局部刷新HTML，不设置总条数上限。 |
| `app_factory.usage` | 返回当前上传身份已用及预留流量，不影响设置草稿。 |
| `app_factory.batch` | 每次有限执行选择集/完整匹配集，并返回下一批签名游标。 |
| `app_factory.cache` | 分批扫描快传文件与缓存目录，仅管理员可读。 |
| `app_factory.delete_cache` | 按已签名预检删除缓存文件；不接受任意原始路径。 |
| `app_factory.create` | 校验身份规则和配额并创建临时分享任务。 |
| `app_factory.checkpoint` | 返回上传恢复状态和已确认分块摘要。 |
| `app_factory.chunk` | 接收并校验下一分块，更新任务检查点。 |
| `app_factory.control` | 按权限暂停、恢复或撤销指定任务。 |
| `app_factory.cleanup` | 清理到期或撤销任务的对象及相关原生记录。 |
| `app_factory.settings` | 读取或按版本保存原工具设置文档。 |
| `app_factory.download` | 核验分享令牌、下载规则与次数并返回文件流。 |
| `app_factory.download.body` | 逐块校验状态/版本与内容，发送前原子结算，断连释放未用预留。 |

## transfer/backend/vps.py

Standalone local transfer service with independent configured database, cache and media.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `release` | Release only this transfer process's database lock. |

## transfer/backend/worker.py

Independent transfer Worker with separately configurable D1, media and cache storage.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `factory` | Build a per-request resource context from explicit transfer platform bindings. |

## transfer/deploy/admin_sql.py

Generate a manager grant for an existing teacher account UID, not a separate password account.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `main` | Write explicit native authorization SQL without any network/database mutation. |

## transfer/deploy/package.py

Copy a standalone transfer service with its shared native dependencies.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `main` | Copy source and bundled assets to a new external directory, without user data. |

## 前端与结构资源

| 文件 | 功能与用途 |
| --- | --- |
| frontend/admin/templates/native-list.html | 所有原生模块共享列表；搜索、多选、列配置、固定列、分页和快捷状态。 |
| frontend/admin/templates/native-edit.html | 根据原生字段注册表生成单页分区表单，整合引用、权限、翻译和导航条件辅助。 |
| frontend/admin/templates/native-fields.html | `control`宏统一渲染标签、提示、单行/多行文本、枚举、关联选择与状态开关；帮助文字通过aria-describedby关联输入项。 |
| frontend/admin/static/js/native-editor.js | 共用保存事件处理，等待富文本同步，携带被点击的保存动作提交；保存中阻止重复操作，失败保留输入和版本并显示服务端错误；开关事件同步文字状态；辅助输入框回车仅触发对应查询或添加条件；失败后发出native-save-failed事件以恢复辅助预览；按保存按钮的data-success-anchor恢复异步重定向丢失的区块锚点。 |
| frontend/admin/templates/layout.html | 独立滚动导航、手机抽屉、固定目录及页面操作栏。 |
| frontend/admin/static/js/native.js | 表头筛选浮层、列宽计算与拖动、列显示偏好、选择统计、顺序批量操作和编辑辅助。mutate提交单行操作；论文交互交由native-publications.js，操作列测量交由native-table-layout.js；翻译复用native-assistance.js请求方法。 |
| frontend/admin/static/js/native-richtext.js | 按正文格式切换源码输入与Quill可视化编辑，同步HTML内容到统一表单。 |
| frontend/admin/static/js/publication-tools.mjs | 论文引用辅助方法的可直接执行JavaScript；generatePublicationCitations生成五种引用格式及警告。 |
| frontend/admin/static/js/workspace.js | 桌面侧栏折叠、手机抽屉、目录区块定位、通用返回与提示。 |
| frontend/admin/static/js/transfer-bridge.js | 自动通过POST把短时票据交给配置的快传来源。 |
| frontend/admin/static/css/admin-theme.css | 统一后台语义颜色、字体、字号和状态对比。 |
| frontend/admin/static/css/admin.css | 后台布局、间距、固定列和响应式尺寸。 |
| frontend/public/templates/native.html | 原生首页、内容列表和详情；隐藏非公开字段，使用已确认翻译。 |
| frontend/public/templates/action.html | 注册和联系留言表单，功能由网站设置控制。 |
| transfer/frontend/native | 快传列表与发送模板、分块上传、恢复校验及任务控制JavaScript。 |
| database/schema.sql | 唯一正式初始化DDL，包含主站与整合快传；仅用于空库。 |
| backend/app/native/schema_migrations.py | 已知前置版本的Python迁移，复用唯一初始化结构及原分块数据转换。 |
| backend/app/native/schema_sources.py | 统一结构读取；历史快传快照仅用于兼容测试、导入校验和旧Worker资源生成。 |
| database/native/schema-spec.json、editor-contract.json | 原生字段类型、编辑范围、区块和统一标签。 |
| storage.example.toml | 可复制到源码外部的主站和快传存储配置样例。 |

## 编辑器验证代码

| 文件/函数 | 功能与用途 |
| --- | --- |
| tests/test_native_editor.py / test_content_editors_cover_fields_once | 通过实际HTTP页面核查八类内容字段覆盖、唯一输入和目录目标，检查新增/编辑的工具区差异。 |
| test_multiline_social_and_zero_roundtrip | 核查自由经历、社交链接和0数值实际保存后回显，以及长文本控件。 |
| test_reference_beyond_first_page_is_kept | 构造超过候选首批数量的项目，核查旧引用继续被选中并完整保存。 |
| tests/browser/editor_checks.py / verify_editors | 在浏览器核查校验失败和并发冲突保留输入、保存重试、移动端目录与固定保存栏。 |
| tests/browser/native_check.py | 复用本地独立服务及测试数据执行编辑、列表、富文本和快传浏览器流程，证据写入artifacts/verification。 |

## backend/app/native/student_categories.py

分类关键词语义、输入限制和授权范围内的有界名单查询。

| 函数 | 功能与用途 |
| --- | --- |
| parse_keywords | 分隔、去重并限制关键词；保存与预览共用，英文ASCII忽略大小写。 |
| page_numbers | 生成全部短分页或首末页及当前页附近按钮，省略中间大量页码。 |
| match_page | 组合可见性和参数化字面关键词条件，计数并按sort_order/id查询当前页；仅返回允许展示的字段和编辑权限。 |

## 分类界面与公共分页

| 文件 / 函数 | 功能与用途 |
| --- | --- |
| frontend/admin/templates/native-pagination.html / pager、page_item | 普通列表与表单内名单共享Bootstrap页码；普通列表用链接，匹配预览用非提交按钮。 |
| frontend/admin/templates/native-student-category.html | 组合已保存状态、预览/激活操作、每页数量、权限反馈及结果容器。 |
| frontend/admin/templates/native-student-matches.html | 初次页面与异步预览共用的转义名单模板，显示限定字段、授权编辑链接、空结果和分页。 |
| frontend/admin/static/js/native-assistance.js / assist | 统一防伪JSON辅助请求及错误解析，允许调用者传入取消信号；元数据、翻译和分类预览复用。 |
| frontend/admin/static/js/native-student-categories.js / cancel | 取消排队或过期预览，递增响应序号并恢复预览按钮。 |
| preview | 根据当前关键词及页码请求名单，仅接受仍对应当前草稿的响应；失败保留字段并清理旧名单。 |
| changed | 在关键词改变时清除旧名单，结合输入法状态延迟预览。 |
| native-student-categories.js事件处理 | 连接手动预览、分页、每页数量、中文输入法、整表提交及保存失败恢复；不自行保存字段。 |

## 分类验证代码

| 文件 / 函数 | 功能与用途 |
| --- | --- |
| tests/test_student_categories.py / client_for、preview | 构造真实会话请求，复用分类预览调用。 |
| test_keyword_validation_and_page_window | 检查关键词规范、输入限制与有界页码。 |
| test_literal_matching_and_scope | 检查中文及英文、通配字符按字面匹配、可见性过滤和匹配字段范围。 |
| test_paginated_results_are_bounded_and_ordered | 用105条数据检查分页无遗漏重复、末页修正、返回字段及长度边界。 |
| test_preview_is_read_only_escaped_and_validated | 检查草稿预览不更改业务数据或审计，HTML转义、参数和防伪验证有效。 |
| test_save_activate_disable_and_stale_conflict | 检查新分类激活、普通关闭、并发冲突不覆盖，以及学生数据保持原值。 |
| test_category_editor_works_without_roster_permission | 检查无学生查看权限时仍能维护已授权分类，且名单不可访问。 |
| test_preview_category_actions_and_student_edit_permissions | 分别检查分类创建/编辑与学生查看/编辑权限以及无会话拒绝。 |
| test_invalid_stored_keywords_remain_editable | 检查超限旧规则可以打开修正，未修正前不能启用。 |
| tests/browser/category_checks.py / verify_categories | 核查草稿预览、分页、旧响应取消、失败重试、保存激活、校验失败恢复及手机布局。 |
| verify_categories.delay_old、unavailable | 仅在测试浏览器中模拟延迟和不可用响应，以验证界面恢复行为。 |

## backend/app/native/navigation.py

原生导航配置、类型明确的固定条件和只读预览服务，不建立独立筛选表。

| 函数 | 功能与用途 |
| --- | --- |
| filter_fields | 从原生结构提供字段白名单、类型、枚举和标签，常用摘要字段优先显示。 |
| filter_value | 校验固定值长度、字符、整数、开关及枚举，规范等值比较的数值表示。 |
| build_path | 拒绝重复字段、未知条件和超限输入，生成规范ASCII筛选路径。 |
| parse_path | 严格解析本站模块及f.参数，拒绝外链、锚点、无效编码和非筛选参数。 |
| in_scope | 按字段类型比较记录与固定条件，用于编辑、保存与删除。 |
| editor_state | 返回配置回显数据与目标模块预览权限，不读取目标模块业务记录。 |
| preview | 复用Content.listing按当前条件统计并分页返回有限摘要列。 |
| navigation_guard | 为写事务生成导航标识、版本、启用状态及位置的参数化检查条件。 |

## 导航模板和脚本

| 文件 / 函数 | 功能与用途 |
| --- | --- |
| frontend/admin/templates/native-navigation.html | 单表单内的模块选择、条件行容器、草稿重置、每页数量、预览操作和反馈区。 |
| frontend/admin/templates/native-navigation-results.html | 按服务端裁剪的摘要列渲染只读预览，复用公共页码，日期时间按后台格式显示。 |
| frontend/admin/static/js/native-navigation.js / tell | 统一显示明确文字及已有主题语义状态。 |
| cancel | 取消延迟和请求、作废旧响应，恢复预览控件。 |
| requestData、active | 分别提供当前导航记录标识、判断是否处于后台目标预览状态。 |
| writePath | 从当前可视化草稿生成编码路径；服务器负责最终验证及规范。 |
| preview | 提交授权预览，接收当前草稿对应的结果，处理失败与重试；原始路径待解析时先同步路径。 |
| changed | 使旧结果失效并延迟预览，同时更新路径草稿。 |
| renderRows | 使用DOM控件显示字段、枚举或文本值及删除按钮，避免字符串插入用户输入。 |
| parseRawPath | 服务端解析手工路径并回显条件，失败保留原文，不用旧条件覆盖。 |
| native-navigation.js事件处理 | 连接目标变更、条件增删、草稿重置、输入法、翻页、保存时取消及失败恢复。 |
| frontend/admin/static/js/native.js | 列表快捷操作提交导航版本；固定列筛选框和清除动作锁定，排序仍可使用。 |
| frontend/admin/templates/native-edit.html | 提交导航版本并显示当前固定范围说明，导航生成器复用独立功能模板。 |
| frontend/admin/templates/native-list.html | 固定入口搜索保持当前地址；输出导航版本，锁定固定开关，系统字段范围不显示新增。 |

## 导航验证代码

| 文件 / 函数 | 功能与用途 |
| --- | --- |
| tests/test_navigation.py / make_nav、assist、scoped_values | 在临时库复用导航创建、草稿调用及包含条目/导航版本的表单数据。 |
| test_path_encoding_validation_and_roundtrip | 验证中文和特殊字符编码、整数规范、重复/未知/非法路径拒绝。 |
| test_navigation_save_normalizes_path_and_editor_state | 验证规范保存、配置回显和路径解析接口。 |
| test_navigation_preview_bounded_readonly_and_escaped | 验证105条记录分页、字段裁剪、HTML转义、输入拒绝，以及导航/业务日志不被预览修改。 |
| test_preview_permissions_are_separate_from_configuration | 检查配置维护、数据预览与导航使用分别遵循对应权限。 |
| test_list_search_pagination_export_and_menu_keep_scope | 核查入口规范跳转、当前菜单、搜索、分页、导出和冲突上下文。 |
| test_scoped_save_cannot_move_records_in_or_out | 核查编辑和保存前后范围、删除及快捷开关的越界拒绝。 |
| test_changed_navigation_rejects_stale_forms_and_row_actions | 核查旧导航版本或缺少版本不能提交，原数据保留。 |
| test_navigation_change_inside_write_window_rolls_back / race | 模拟写事务前禁用导航，验证事务守卫回滚条目变更。 |
| test_false_fixed_default_and_disabled_navigation | 核查固定0开关的新增默认值，以及禁用入口不再可用。 |
| test_preview_respects_visibility_and_navigation_identifier_uniqueness | 检查可见范围和重复/非ASCII标识拒绝。 |
| test_all_content_modules_preview_native_summary_fields | 验证八类内容均使用有效原字段生成有界预览。 |
| test_export_rechecks_navigation_before_returning_data / disable_after_query | 模拟查询后禁用导航，验证导出响应交付前再次拒绝。 |
| tests/browser/navigation_checks.py / verify_navigation | 在真实浏览器核查草稿回显、增删重置、路径同步、ASCII入口、范围保护、导出、冲突草稿和390px布局。 |


## 论文辅助与操作列代码

| 文件或函数 | 功能与用途 |
| --- | --- |
| backend/app/native/publication_metadata.py | DOI标准化、六服务候选字段白名单及Crossref结构映射。 |
| `normalize_doi` | 接受DOI及doi.org链接，标准化前缀和大小写并校验长度、字符。 |
| `bounded_fields` | 裁剪服务/缓存字段，忽略空值或错误类型，核对DOI一致性和URL协议。 |
| `crossref_fields`、内部`first` | 从外部数组中安全取首项，提取有限作者、题名、年份和卷期页，拒绝无可用信息的结果。 |
| `Assistance.metadata` | 按论文创建或编辑权限查询；编辑时复核记录可见性，读写指定短期缓存并返回可重试错误。 |
| `editor.citation_profile_names` | 读取首位公开、启用、精选教师的中英文姓名用于作者高亮，不返回内部教师信息。 |
| `web.create_app.editor` | 向单页论文编辑模板传入已裁剪的教师姓名及现有字段注册信息。 |
| `web.create_app.metadata` | 验证会话/CSRF后传递查询词、类型、服务和论文/导航上下文，返回候选与尝试状态。 |
| frontend/admin/templates/native-metadata.html | 同一论文表单中包含共享检索控件与差异回填组件；辅助控件不提交数据库字段。 |
| frontend/admin/templates/native-edit.html | 整合元数据功能模板并向引用生成按钮传入安全编码的教师姓名；继续复用单页目录与保存栏。 |
| frontend/admin/static/js/native-publications.js | 论文草稿交互状态；输出保护、差异核对、撤销、查询取消和快速保存前同步。 |
| `get`、`protectionStatus` | 读取命名表单字段、统计保护项，提供清楚的状态说明。 |
| 引用保护控件及`status`回调 | 按已有内容初始化保护；输入、手动清空、切换保护时同步图标、文字与状态颜色。 |
| `generate` | 复用generatePublicationCitations，只改写未保护的输出并展示缺失信息/姓名匹配提示。 |
| `changeSource`及共享核对器的`sourceChanged`、`updateApply` | 来源输入变动后延迟生成引文，刷新差异当前值、撤销旧勾选和同步回填按钮状态。 |
| `cancelQuery`及共享核对器的`clear` | 取消旧的只读请求并递增请求序号，关闭和清理差异区。 |
| 共享核对器的`show`及查询回调 | 仅以textContent呈现受支持的非空建议，预选空字段，拒绝晚响应，显示服务错误并允许重试。 |
| 共享核对器的`applySelected`、`remember`、`drawEntry` | 快照当前来源/引用，回填勾选字段，并在每个变化字段下方建立原值及单项撤销。 |
| 共享核对器的`undo` | 比较当前值与已回填值，保留后续手动编辑；完整回退时同时恢复未保护的派生输出。 |
| 保存及离页回调 | 在统一保存取得FormData前同步待生成内容，取消查询和延迟任务，防止晚响应干扰草稿。 |
| frontend/admin/static/js/native-table-layout.js | 操作列尺寸观察器，保持网格固有宽度独立于表格上一次列宽。 |
| `observeActionColumn` | 注册字体、窗口、按钮DOM及网格尺寸变化监听，返回可显式解除监听的方法。 |
| 内部`measure`、`schedule` | 用requestAnimationFrame合并测量，按可见按钮最多三列布局，计入单元格内边距和边框，同步全列宽度。 |
| frontend/admin/static/css/admin.css | DOI桌面差异列与手机卡片、辅助按钮区、引文保护控件及操作网格的布局。 |
| frontend/admin/static/css/admin-theme.css | 辅助字段状态、标签的字号和颜色来源，统一使用后台语义变量。 |
| tests/test_publication_assistance.py | 验证DOI格式、结果类型/白名单、缓存恢复、只读性、创建/编辑权限与公开教师选择。 |
| tests/browser/publication_checks.py | verify_publications验证保护、选择回填、撤销、草稿保存与查询竞态；verify_action_columns验证按钮/字体变化、固定列、手机和分页。 |


## 历史建议与原文解析代码

| 文件或函数 | 功能与用途 |
| --- | --- |
| backend/app/native/suggestions.py | 9个模块34个字段的唯一历史目录、多值定义与有界建议服务。 |
| `normalized` | 规范宽窄字符、大小写和空白，供去重、已选项排除及片段核对使用。 |
| `suggestion_catalog` | 将当前账号有查看权限的模块、字段标签与多值属性提供给词库。 |
| `suggestions` | 校验字段/输入，合并可见范围与固定导航条件，仅读取目标列的最近匹配记录，提取去重候选。 |
| `editor.editor_fields` | 为统一字段控件添加历史建议标识和多值属性，复用suggestions中的配置。 |
| `web.create_app.history_page` | 提供已授权模块的独立历史词库HTML，未登录返回登录入口。 |
| `web.create_app.history_suggestions` | 核验会话/CSRF、请求白名单、导航目标/版本，调用只读服务并复核导航仍有效。 |
| frontend/admin/templates/native-suggestions.html | 模块、字段、关键词与复制候选的独立查询页，复用管理布局。 |
| frontend/admin/templates/native-fields.html | control宏向受支持字段标注历史字段名与多值模式，避免逐模块编写下拉控件。 |
| frontend/admin/static/js/history-values.mjs | 与DOM无关的分号/换行片段定位和替换，保留姓名和机构内部逗号。 |
| `historyFragment` | 依据光标计算片段范围、查询文本、已选排除项、原空白和请求快照。 |
| `replaceHistoryFragment` | 用候选替换指定片段并返回恢复光标的位置，保留其他文本。 |
| frontend/admin/static/js/native-history.js | 表单共用单个候选浮层；独立词库共用同一请求方法。 |
| 表单`close`、`schedule`、`query` | 合并短时输入、取消旧请求、校验响应对应的字段/值/光标，显示候选或重试提示。 |
| `position`、`fragment`、`pick`、`focusOption` | 定位浮层到视口与保存栏之间，读取片段、回填并触发原生输入事件，支持键盘选择。 |
| 组字、焦点、滚动和保存回调 | 组字期间暂停查询；焦点移出和保存时关闭候选，滚动时保持定位或隐藏视口外浮层。 |
| 词库`cancel`、`fields`、`search` | 切换模块生成同源字段选项，清除旧结果并显示有界候选，点击复制失败时提供手工处理提示。 |
| frontend/admin/static/js/native-assistance.js | assist共用JSON请求/错误处理；编辑页默认读取CSRF，独立词库可显式传入CSRF。 |
| frontend/admin/static/js/native-draft-review.js | 论文元数据自动填入、原始引用选择回填及引用更新共用的字段原值/撤销控制器。 |
| `createDraftReview`、`show`、`clear` | 建立控制器，将固定字段白名单建议以文本呈现，并把面板放在对应辅助区。 |
| `sourceChanged`、`updateApply` | 同步当前值、相同/差异状态、失效勾选和回填按钮。 |
| `applySelected`、`remember`、`drawEntry`、`undo` | 保存每个字段最近一次变化前值，提供字段下方独立撤销；保留后续手改，完整回退时恢复未保护的派生输出。 |
| frontend/admin/templates/native-draft-review.html | 原始引用解析的可移动选择回填面板；联网补全不再打开集中核对区，撤销位于实际字段下方。 |
| frontend/admin/templates/native-citation-parser.html | 现有原始引用字段旁的本地解析入口、格式/完整度说明和结果容器。 |
| frontend/admin/static/js/native-publications.js | 引文保护和自动生成；DOI与解析分别取得建议并调用同一核对器。原文修改使解析建议失效。 |
| `publication-tools.parsePublicationCitation` | 复用原有BibTeX、GB/T、APA、IEEE、Elsevier及通用格式规则，不请求网络。 |
| `detectFormat`、`parseElsevierOrGeneric` | 识别常见引文特征；兼容IEEE弯引号以及Elsevier括号年份后逗号、序号和作者缩写。 |
| frontend/admin/static/css/admin.css | 历史浮层、键盘选中状态、词库控件和响应式排版，颜色字号引用统一变量。 |
| frontend/admin/static/css/admin-theme.css | 历史候选字体与辅助复选框状态的统一样式来源。 |
| tests/test_history_suggestions.py | 字段范围、字面搜索、去重排除、读取/候选上限、可见性、媒体状态、CSRF及导航范围验收。 |
| tests/browser/input_checks.py | verify_history验证实际输入和独立词库；verify_citation_parse验证五种格式、共享回填/撤销、保存及失效建议。 |
| tests/browser/native_check.py | 完整后台浏览器验收；TEACHER_BROWSER_SCOPE=input可只复验历史建议与引用解析专题。 |


## backend/app/native/media_references.py

从原生外键和经过安全解析的正文派生媒体引用，不增加数据库表或缓存副本。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `MediaReferences.__init__` | 复用内容服务的数据库和可见范围规则。 |
| `MediaReferences.scope` | 没有目标模块查看权限时只允许输出受保护标记。 |
| `MediaReferences.news_rows` | 按20条游标分页解析候选正文；URL文字或相似UID不算实际图片/链接。 |
| `MediaReferences.body_rows` | 统一原文与当前生效译文；源摘要过时的译文不产生正在使用的引用。 |
| `MediaReferences.summaries` | 分组统计当前媒体页；有界返回模块/字段计数，不载入全站人物记录。 |
| `MediaReferences.locations` | 使用位置按字段分组和每页20条展示，受限来源不返回名称或链接。 |
| `MediaReferences.used` | 回收校验覆盖所有可见范围；无法完整解析的正文同样保护媒体。 |
| `MediaReferences.public_body_reference` | 仅真实、可公开阅读的HTML节点可以授予正文媒体公开访问。 |
| `reference_guard` | 在保存事务内重查媒体仍活跃，避免预检后被回收或并发添加引用。 |
| `translated_media` | 校验正文译文中可激活的媒体，供手工译文与供应商写入共用事务保护。 |

## 后台媒体共享呈现

| 文件/函数 | 功能与用途 |
| --- | --- |
| frontend/admin/templates/native-media-tabs.html | 正常媒体、回收站和全部范围入口、计数，复用通用筛选参数。 |
| frontend/admin/templates/native-media-parts.html：media_cell、preview | 预览/使用位置派生列与详情预览共用组件；精确来源提示、受限来源提示、图片/视频/PDF和文件信息。 |
| frontend/admin/templates/native-media-detail.html | 媒体信息、私有预览、来源分组和分页，复用区块目录和固定底部按钮。 |
| frontend/admin/static/js/native-media.js：failed回调 | 图片加载失败时保留不可用提示；详情媒体错误显示说明。 |
| frontend/admin/static/js/native.js：媒体批量处理回调 | 按选择顺序复用mutate，回收/恢复逐条提交；失败立即停止并报告已完成数量。 |
| frontend/admin/templates/native-list.html | 媒体复用派生列、状态范围和通用表格；派生列不发送数据库排序/筛选，媒体动作在手机保留图标与无障碍名称。 |
| frontend/admin/static/css/admin.css | 媒体列表、预览、元数据及移动端操作列布局，视觉值引用主题参数。 |
| frontend/admin/static/css/admin-theme.css | 媒体状态、字号、辅助文字和语义配色的统一来源。 |

媒体相关保存用途：Content.save除固定媒体字段外，也检查正文格式转换、手工正文译文以及旧原文重新匹配的缓存译文，避免激活已回收资源；来源可见性仍决定公开访问。

## 媒体目录与字段预览代码

| 文件或函数 | 功能与用途 |
| --- | --- |
| backend/app/native/media_inventory_store.py | 配置目录/前缀内的扫描、元信息、受限读取、独占副本和版本检查删除适配器；不改变通用对象键规则。 |
| `relative_key` | 校验含中文的扫描相对路径，拒绝绝对路径、父目录、控制字符及空段。 |
| `digest`、`js_options` | 将存储版本转换为比较值；将Worker接口参数转换为JS普通对象。 |
| `LocalInventory.__init__`、`path` | 保持配置根目录边界，拒绝路径中所有符号链接与Windows联接点。 |
| `LocalInventory.head`、`read` | 获取实际大小和文件版本；在指定上限内读取普通文件。 |
| `LocalInventory.list_page` | 使用目录层级/位置游标增量遍历；每批处理有限新条目，报告不可读取目录，限制层数。 |
| `LocalInventory.create`、`delete` | 独占创建新副本；再检查文件版本后删除，不递归删目录。 |
| `R2Inventory.__init__`、`head`、`read` | 复用绑定和前缀；取得对象大小/版本，正文读取前检查大小上限。 |
| `R2Inventory.list_page` | 仅列举指定前缀，使用truncated与cursor继续，即使本批返回不足20条。 |
| `R2Inventory.create`、`delete` | 以onlyIf禁止覆盖已有对象；删除前重新检查版本。 |
| `inventory` | 为本地或R2存储选择媒体核对能力；媒体和缓存使用各自配置。 |
| backend/app/native/media_locks.py | 复用原生写保护表串行化媒体批次，并保留清理失败意图。 |
| `purge_key`、`pending_guard` | 生成固定长度清理标识；阻止待重试条目编辑或恢复。 |
| `live_lease`、`lease` | 校验当前请求仍持有未过期锁；按权限获取短锁并在退出时仅释放自己的锁。 |
| backend/app/native/media_audit.py | 目录报告、只读预检、显式收录与到期清理业务，不增加数据库结构或常驻任务。 |
| `MediaAudit.__init__` | 装配媒体/缓存能力，计算报告账号及存储配置范围。 |
| `read_json`、`write_json`、`root` | 有界读取和原子保存缓存JSON，验证服务端报告标识。 |
| `latest`、`state` | 获取本账号活动报告，验证所有者、存储配置及操作有效期。 |
| `start`、`step` | 建立只读核对报告，以登记主键或目录游标推进批次，保存分类及进度。 |
| `classify` | 区分存在、缺失、大小变化、未登记、不可处理与持久清理待重试。 |
| `page`、`entry` | 仅读取一个分类结果批次；从服务端报告解析操作目标，不接受任意文件路径。 |
| `recheck`、`clear` | 重新读取单项最新状态；分批清除当前账号报告，不触及媒体和清理意图。 |
| `plan`、`get_plan` | 保存并核验账号、配置、用途、文件版本和30分钟有效期的预检凭据。 |
| `checked_file` | 校验读取前后实际文件版本、大小、允许扩展名和签名，生成SHA-256摘要。 |
| `prepare_import`、`commit_import` | 显示原地登记或保留源文件的副本计划，复核后原子登记和审计；重试同计划副本时不覆盖其他内容。 |
| `purge_candidates`、`eligible` | 分页选取到期/待重试回收站候选，校验原生保留期、状态、版本、存储与全部引用。 |
| `prepare_purge`、`commit_purge` | 预检永久清理，先保存意图再删对象及登记；失败保留状态，成功提交审计及清理意图。 |
| backend/app/native/media_admin.py | 后台媒体核对与字段预览的HTTP路由组合。 |
| `install`、`lookup` | 注册明确路由；将原生对象键转换为最少量私有预览信息。 |
| `audit_page`、`audit_action` | 渲染一个报告页和20条清理候选；核验CSRF/请求上限，分发服务并返回明确存储错误。 |
| `Content.save`、`Media.status` | 普通媒体编辑和恢复事务增加待清理标记保护，旧页面不能恢复待删除文件。 |
| `editor_fields`、native-fields.html的`control` | 按原生外键识别媒体字段，将同一旁侧预览接入所有模块。 |
| frontend/admin/templates/native-media-field.html | 独立预览容器、加载/异常文字和新标签完整预览入口。 |
| frontend/admin/static/js/native-media-fields.js的`update`、`message` | 按选择请求预览信息，取消过时查询，创建安全图片/视频节点，处理清空和加载失败。 |
| frontend/admin/templates/native-media-audit.html | 报告分区、分类/批次分页、多选、到期候选及操作预检确认窗口。 |
| frontend/admin/static/js/native-media-audit.js的`api`、`state`、`ensureReport` | 统一带CSRF的有界操作请求，同步扫描版本并按需创建报告。 |
| 扫描、暂停、清除和重新核对回调 | 串行推进短请求，允许批次间暂停，清除私有缓存或显示最新单项结果。 |
| 预检、多选、确认和取消回调 | 限制一次10项，完整呈现每个文件的影响，逐项提交并在失败时保留已完成数量。 |
| admin.css、admin-theme.css | 前者控制完整等比留白、字段并排和手机/确认窗口布局；后者集中定义字体、字号及遮罩配色。 |
| tests/test_media_audit.py | 验证双向核对、权限/过期/版本冲突、中文副本、故障恢复、引用/保留期保护及本地/R2边界。 |
| tests/browser/media_audit_checks.py的`verify_media_audit` | 在临时数据上验证横竖预览、缺失提示、实际扫描/收录/清理与手机交互。 |

## 统一媒体选择与正文接入

| 文件或函数 | 功能与用途 |
| --- | --- |
| backend/app/native/media_policy.py | 所有11个原生媒体字段、正文图片和PDF共用的MIME/扩展名类型目录。 |
| `types_for`、`check_type` | 按目标字段返回允许类型；选择及最终保存检查相同规则。 |
| backend/app/native/media_picker.py：`MediaPicker.__init__` | 复用请求身份、数据库和媒体存储，提供选择器服务。 |
| `context` | 校验媒体查看与目标编辑/创建权限、已有记录可见范围、导航版本及固定条件。 |
| `dto`、`options` | 输出最少媒体字段、100项以内分类建议、上传扩展名/大小限制及可用操作。 |
| `listing` | 参数绑定搜索与分类/类型过滤，按10或20项分页读取当前存储活跃媒体。 |
| `select` | 确认前复核状态、原生更新时间、字段类型、固定键、实际文件存在性及大小，不写内容引用。 |
| `upload` | 校验用途和固定条件，调用唯一上传服务，返回可用于选择的媒体记录。 |
| Media.upload | 支持调用方限定MIME，以及有界标题/分类；格式和元数据写文件前校验，文件登记/元信息/日志一并提交。 |
| Content.save、media_references.translated_media | 固定字段与正文/正文译文图片使用同一类型约束，继续使用原有状态及引用竞争保护。 |
| media_admin.install内`picker_list`、`picker_select`、`picker_upload` | 挂载私有搜索、CSRF选择复核及原始字节上传入口，转换可识别存储错误。 |
| editor.reference_choices、editor_fields | 媒体内部原生键候选限制最近20项并补回旧关联，包含类型适用的external；可见链接由统一装饰方法生成，完整搜索复用选择器。 |
| web.headers | 后台本地图片预览允许blob地址；访客页面维持原图片来源限制。 |
| frontend/admin/templates/native-media-picker.html | 所有媒体用途共用一份独立弹窗，含搜索/类型/分类/分页、上传元信息、待选及固定确认栏。 |
| native-fields.html、native-media-fields.js | 各媒体字段用相同选择/清空按钮；回填原生对象键并触发既有旁侧预览，其他草稿不变。 |
| frontend/admin/static/js/native-media-picker.js：`mediaContext`、`responseJSON` | 读取表单原生目标及导航信息；统一处理HTTP响应和错误。 |
| `chooseMedia`、`finish`、`localCleanup` | 建立隔离的单选/批选会话，关闭时取消请求、恢复焦点并释放临时图片地址。 |
| `feedback`、`busy`、`selection`、`addSelected` | 更新语义状态和操作可用性，保持待选集合，限制最大选择数量。 |
| `drawRows`、`drawPages`、`search` | 安全创建预览卡片/编号分页，按当前查询获取有限候选，取消或忽略过时响应。 |
| `tab`、`filesChanged` | 切换来源，显示本地文件名/大小和完整等比图片预览，释放上一份预览。 |
| 上传、停止、确认回调 | 顺序上传并呈现部分成功/未知结果；逐项复核后才回填，取消不删除已登记媒体。 |
| frontend/admin/static/js/native-richtext.js：`initialize`、`ManagedImage` | 装配新闻HTML编辑及受管理图片格式，禁止Base64/外部图片成为正文嵌入。 |
| `insert` | 从同一选择器取得图片/PDF，保留光标和说明，核对正文快照及10个不同媒体限制，作为整组可撤销操作插入。 |
| `sync`、`syncBody`、`message` | 保持格式/正文编辑区同步、统一保存读取最新HTML，输出明确提示。 |
| 粘贴/拖入监听 | 截获本地图片，先确认并统一上传；拒绝非图片直接嵌入，取消保留正文。 |
| frontend/admin/static/css/admin.css | 选择器卡片、完整等比预览、滚动内容、固定栏和手机布局。 |
| frontend/admin/static/css/admin-theme.css | 选择器字体、字号、标题层级和辅助文字的统一视觉来源；统一轮廓主按钮普通、悬停、聚焦及按下的可读配色。 |
| tests/test_media_picker.py | 验证搜索分页、类型/权限/范围、存在性/版本、最终保存、上传失败及原关联保留。 |
| tests/browser/media_picker_checks.py：`verify_media_picker` | 验证真实搜索/上传/保存、晚响应、失败及取消、正文图片/PDF、批次拖入与手机/键盘交互；内部`loaded_previews`确认可见图片解码和搜索按钮悬停对比度。 |

## 图片裁剪与副本登记

| 代码文件 / 函数 | 功能与用途 |
| --- | --- |
| backend/app/native/media_image.py：`crop_dimensions` | 使用标准库读取PNG IHDR/CRC或JPEG SOF尺寸，限制裁剪输出宽高64–4096；只检查头部，不承担像素解码。 |
| backend/app/native/media_picker.py：`MediaPicker.crop_upload` | 验证目标字段和导航固定范围，已有来源复用select核对版本与存在性，裁剪副本复用Media.upload；来源和引用不被改写。 |
| backend/app/native/media.py：`Media.upload`的validate_bytes参数 | 在文件写入与登记前调用可选用途校验器；裁剪接口借此检查实际输出尺寸，普通上传沿用原行为。 |
| backend/app/native/media_admin.py：`install`内crop_upload | 挂载POST /api/admin/media-picker/crop/file；检查会话、CSRF，将原始图片流及上下文交给裁剪上传服务，转换存储错误。 |
| frontend/admin/templates/native-media-crop.html | 字段和富文本共用的独立图片编辑窗口：比例、画布、数值区域、输出和固定确认栏，无业务记录字段。 |
| frontend/admin/templates/native-media-picker.html、native-fields.html | 分别提供所选/本地单张图片的编辑入口，以及已有图片字段旁的直达按钮。 |
| frontend/admin/static/js/media-crop-geometry.js：`clamp` | 将数值限定于指定边界。 |
| `fitView` | 根据原图和画布大小计算居中等比视图，不裁掉原图。 |
| `imagePoint` | 将显示坐标逆变换为原图坐标，供裁剪选点使用。 |
| `zoomView` | 以鼠标或双指中心为缩放锚点，保留该点对应的原图位置并限制倍率。 |
| `fullRect` | 生成自由整图或指定比例的最大居中矩形。 |
| `pointRect` | 将两个角转换为四方向矩形，固定比例和原图边界共同限制选区。 |
| `outputSize` | 按输出长边保持区域比例计算整数宽高，拒绝过小区域或64–4096之外的输出。 |
| frontend/admin/static/js/media-image-size.js：`imageSize` | 在前1 MiB内识别PNG/JPEG/GIF/WebP尺寸，解码前限制3200万像素及16000单边。 |
| frontend/admin/static/js/native-media-crop.js：`editImage` | 打开共享窗口、验证输入和格式、创建浏览器位图及会话；返回裁剪File或取消，不发送上传请求。 |
| `notice` | 在窗口内展示可访问的状态/错误文本，语义颜色由后台主题提供。 |
| `snapshot`、`remember` | 复制区域与比例状态，保留最多20份撤销记录。 |
| `pointer` | 将浏览器指针位置换算为画布CSS坐标。 |
| `stateControls` | 同步原图区域、比例、缩放和输出尺寸；首角待确认或输出无效时禁用生成按钮。 |
| `schedule`、`draw` | 合并帧绘制，显示原图、透明棋盘、遮罩、比例参考线和首角标记；全部颜色读取admin-theme.css。 |
| `fit`、`zoom` | 只更新视图与画布分辨率；不改动已选区域和首角坐标。 |
| `resetAnchor`、`commit`、`pick` | 管理首角/第二角状态、有效区域提交、撤销入栈及越界反馈。 |
| `ratioChanged` | 校验原图/固定/自定义比例，创建可继续编辑的居中范围。 |
| `release`及pointer/wheel/keyboard事件 | 处理指针捕获、拖动阈值、双指缩放、手势结束抑制和键盘平移缩放；取消与多指不产生裁剪选点。 |
| 生成按钮事件 | 以原图坐标截取像素并按尺寸缩放，输出PNG或白底JPEG；超限保留区域，成功返回本地文件。 |
| `finish` | 结束窗口会话，释放位图、观察器、绘制帧与画布内存，恢复上层焦点并解析结果。 |
| frontend/admin/static/js/native-media-picker.js：`cropControls` | 根据单图选择、本地文件、创建权限与输出格式控制裁剪入口。 |
| `editSelected` | 复核并读取已有图片或使用本地文件，调用编辑器，将裁剪结果作为待上传草稿；旧选择保留到上传成功。 |
| `chooseMedia`的editCurrent参数 | 从字段当前键查找对应媒体并直达编辑，不跳到其他内容页面。 |
| `filesChanged`及上传事件 | 清除过期裁剪上下文；生成副本时保留来源版本，调用crop/file，成功后替换待选项，失败保留本地文件和原选择。 |
| frontend/admin/static/js/native-media-fields.js：`update`、`choose` | 根据当前媒体类型显示编辑按钮，复用选择器回填和字段change预览，不直接保存内容。 |
| frontend/admin/static/css/admin.css | 裁剪窗口固定头尾、内部滚动、画布及紧凑工具条/像素表单，适配手机。 |
| frontend/admin/static/css/admin-theme.css | 裁剪窗口统一字体字号、滑条色、透明棋盘/遮罩/标记/参考线及JPEG白底变量。 |
| tests/test_media_crop.py：`png`、`post` | 使用标准库生成真实测试PNG，并向真实裁剪路由提交受保护请求；不读取用户数据。 |
| test_cropped_copy_preserves_original_bytes_and_shared_references | 验证副本字节、真实保存及共享原图引用保持完整。 |
| test_crop_rejects_bad_headers_dimensions_and_non_images_without_writes | 验证输出尺寸、头部和类型拒绝时无文件/记录/锁残留。 |
| test_crop_requires_csrf_target_and_media_create_rights | 验证CSRF、目标新建/编辑权限与媒体创建权限独立生效。 |
| test_crop_source_version_status_missing_object_and_fixed_navigation | 验证来源版本、文件缺失及固定导航范围拒绝。 |
| test_crop_stream_failure_and_global_output_extension_limit | 验证上传中断清理与全局扩展名限制。 |
| tests/browser/media_crop_checks.py：`verify_media_crop` | 验证数学边界、两次点击之间缩放/拖动、原图像素输出、撤销、取消、上传错误/来源冲突、JPEG白底和手机真实双指事件。 |


## 账号与权限页面

| 代码文件 / 函数 | 功能与用途 |
| --- | --- |
| backend/app/native/accounts.py：ACCOUNT_TABLES、ACTIONS、SCOPES、STATES | 集中定义账户页面范围、中文权限/可见性名称及账号状态语义。 |
| `can_manage` | 为账户列表计算写入口可用性，要求系统角色与对应模块动作同时成立；不取代服务端授权。 |
| `parse_helpers` | 校验密码确认，将可见范围复选框和模块动作复选框转换为原生字段值及权限映射，拒绝未知选项。 |
| `list_context` | 有界补齐当前页角色名称、可访问成员数量、已授模块/操作数和可见范围标签；不写入派生字段。 |
| `scope_choices` | 将原生可见范围JSON转换为编辑器复选项的已选集合。 |
| backend/app/native/editor.py：`editor_fields`、`editor_sections` | 统一账户控件标签、中文选项、范围复选组、密码与权限区块；所有区块共用页面目录。 |
| backend/app/native/web.py：`context` | 保持账号/角色共用一个基础侧栏入口与高亮，角色只读用户的入口指向其有权查看的列表。 |
| `list_page` | 组装账户列表列、中文筛选标签和只读派生单元格；账户写按钮遵循系统管理员限制。 |
| `editor` | 检查账户编辑权限，回显权限矩阵与范围，新账号界面默认要求改密，系统角色锁定启用和权限控件。 |
| `save` | 通过parse_helpers解析账户表单，复用内容事务保存；自身重置密码清除Cookie并返回登录，自身强制改密进入账户安全页。 |
| `row_action`中的账户快捷开关 | 自身开启要求改密时返回账户安全地址，列表客户端按此跳转，其他操作沿用刷新行为。 |
| backend/app/native/catalog.py：`normalize` | 验证范围数组中的每个值均为合法字符串；错误嵌套输入返回字段错误。 |
| backend/app/native/content.py：`Content.save` | 原子保存账户/角色及权限，继续校验系统角色保护、权限、范围、版本和审计；权限动作数组拒绝非字符串元素。 |
| frontend/admin/templates/native-account-tabs.html | 在账号和角色列表/编辑器中呈现相同子导航及只读说明。 |
| frontend/admin/templates/native-account-cell.html：`account_cell` | 以角色名、状态标记、中文范围和受限统计呈现账户单元格，保留授权列表跳转。 |
| frontend/admin/templates/native-account-password.html | 统一创建/重置密码和确认输入，说明空值保留及会话撤销。 |
| frontend/admin/templates/native-permissions.html | 原生权限矩阵、行列选择、筛选/批量工具及系统只读状态，全部权限仍置于同一表单。 |
| frontend/admin/templates/native-fields.html：`control` | 统一范围复选组和受保护开关，隐藏值保留只读开关的合法提交值。 |
| frontend/admin/templates/native-list.html、native-edit.html | 复用账户组件、列标签和单页表单，不另建账户页面保存流程。 |
| frontend/admin/static/js/native-accounts.js：`validate` | 密码与确认输入变化时更新浏览器约束提示，服务端再次校验。 |
| `visible`、`groupState`、`refresh` | 获取可见模块、同步行列全选/部分选中及实时权限概览，恢复失败保存后的按钮状态。 |
| `filter` | 根据中文名称/模块标识过滤矩阵，保留隐藏控件及其选择，兼容中文组字。 |
| `setBox`、`batch` | 统一修改选项、记录修改序号及批次快照，仅作用于当前行/列或显示模块。 |
| 撤销事件 | 按修改序号恢复最近批次仍未被手工改动的控件，不覆盖后续手动选择。 |
| frontend/admin/static/js/native.js | 装载账户辅助模块；共用表头筛选支持中文选项标签和原生过滤前缀；快捷操作处理自身改密跳转。 |
| frontend/admin/static/css/admin.css | 账户短字段列排版、紧凑工具条、固定矩阵表头/模块列、手机布局及禁止外层网格滚动。 |
| frontend/admin/static/css/admin-theme.css | 账户语义标记、矩阵字体和复选框未选/部分/全选配色的唯一视觉参数来源。 |
| tests/test_accounts.py：`row`、`save`、`role`、`user` | 创建隔离的验收数据、读取结果并提交真实带版本和CSRF的账户表单。 |
| tests/test_accounts.py中的用例 | 覆盖完整矩阵保存、输入拒绝、只读授权、可见计数、角色入口、密码会话和并发事务。 |
| tests/browser/account_checks.py：`verify_accounts` | 验证矩阵筛选/撤销、真实保存、失败与冲突草稿、账号密码确认及桌面/手机固定布局。 |


## 论文元数据服务配置与查询

| 文件或函数 | 功能和用途 |
| --- | --- |
| backend/app/native/metadata_config.py | 固定六服务标识、设置解析与部署凭据读取，不扩展数据库。 |
| `credentials` | 从固定环境变量读取可选API密钥和联系邮箱，仅用于后端。 |
| `parse_settings`、`load_settings` | 校验默认服务、启用顺序和0–86400秒缓存设置；读取首条原生全局设置。 |
| `display_options`、`page_options` | 为表单提供服务名称、启用/顺序及密钥是否存在；无效配置不阻塞手动论文编辑。 |
| `form_settings` | 将启用复选框和顺序转换为原生服务标识数组，拒绝空启用或错误顺序。 |
| backend/app/native/metadata_http.py：`validate_request` | 限制六家固定HTTPS端点及Semantic Scholar认证头，不允许任意主机、路径或重定向。 |
| backend/app/native/metadata_sources.py | 供应商请求与字段映射，白名单输出、不下载全文。 |
| `obj`、`items`、`joined`、`year_of` | 安全取可选对象、有限数组、多值文本及四位年份。 |
| `request_for` | 为六家服务构造编码后的DOI/题名查询及对应可选凭据。 |
| `pubmed_summary` | 校验最多5个数字PMID并构造固定ESummary地址。 |
| `extract` | 统一六家响应；校验必需题名和DOI一致性，去重后返回最多5个候选。 |
| backend/app/native/metadata_search.py：`MetadataSearch.__init__` | 复用当前身份、SQL、网络与本地/R2缓存。 |
| `MetadataSearch.authorize` | 校验查看/新增/编辑、记录范围及固定导航版本。 |
| `MetadataSearch.cached` | 校验有界缓存的摘要、时长、来源和字段；坏缓存不阻止查询。 |
| `MetadataSearch.source` | 执行一次服务请求，PubMed包含搜索和汇总；转换可读状态。 |
| `MetadataSearch.search` | 识别查询、选服务、控制逐家回退/时限、缓存成功候选并复核范围。 |
| `catalog.fields` | 为元数据功能启用已有保留缓存字段的后台编辑；不改变原生DDL。 |
| `Content.save` | 对全局服务字段进行联合校验，再由现有冲突保护和审计事务保存。 |
| `editor.editor_fields`、`editor.editor_sections` | 统一默认服务下拉、启用顺序组件和缓存时长，保证同一字段仅出现一次。 |
| `web.create_app.metadata_page` | 以论文查看权限渲染独立只读检索入口。 |
| backend/app/native/runtime.py：`local`；backend/entrypoints/worker.py | 向相同查询服务注入本地环境或Worker同名Secret。 |
| adapters/local_files/scholarly.py、adapters/worker_crypto/scholarly.py | 现有CrossrefTransport扩展为共用六服务传输，限制响应大小、超时和允许请求。 |
| frontend/admin/templates/native-metadata-query.html | 共用类型、查询词、服务、取消、尝试状态与候选容器。 |
| frontend/admin/templates/native-metadata-page.html | 独立检索及纯文本字段详情，不创建或保存论文。 |
| frontend/admin/templates/native-metadata-providers.html | 共享全局表单内的服务启用、顺序和凭据存在状态。 |
| frontend/admin/static/js/native-metadata-query.js：`setupMetadata` | 为编辑页或独立页面绑定检索、候选和取消；请求不发送论文正文或手工引文。 |
| `stop`、`clear`、`changed` | 取消等待并递增查询序号、清除陈旧候选/详情，保留当前表单。 |
| `show`、`select` | 用文本节点显示状态/卡片，选定候选后交给共享差异回填或只读详情。 |
| native-publications.js | 接收统一查询候选，复用差异和撤销，同时保留手工引文保护。 |
| admin.css、admin-theme.css | 检索条、候选卡片和服务配置的紧凑响应式布局；字体与颜色只在主题文件定义。 |
| tests/test_metadata_search.py、tests/browser/metadata_checks.py | 验证服务字段、边界、缓存、配置/论文真实保存、只读候选、取消和手机交互；外部替身明确标注。 |

## 后台工作区外观与交互

| 文件 / 方法 | 功能与用途 |
| --- | --- |
| frontend/admin/static/css/admin-theme.css | 统一后台色彩、文字及工作区/列表间距参数；定义不影响尺寸的悬停、按下、焦点、禁用与忙碌反馈，响应手机和减少动态效果偏好。 |
| frontend/admin/static/css/admin.css | 用共享主题间距布局主区域、固定栏、列表面板与单元格；复选列使用独立留白，操作列继续由已有测宽方法管理。 |
| frontend/admin/templates/layout.html、native-list.html、native-pagination.html | 现有共享容器提供统一样式挂载点，所有模块自动获得相同外观，无需分别复制模板。 |
| tests/browser/appearance_checks.py：`verify_appearance` | 在临时测试数据上检查四种屏幕宽度、内外间距、冻结列、固定栏、目录锚点、按钮尺寸、键盘焦点、减少动画及独立侧栏。可选原始截图模式记录调整前布局。 |
| `verify_appearance.hold_save` | 暂缓测试服务器的真实保存请求，检查已有忙碌状态及按钮位置后放行，不伪造保存结果。 |
| tests/browser/native_check.py：`browser` | 在原有验收入口接入外观专项与完整回归，复用受控本地服务、临时数据库和浏览器错误收集。 |

## 列表推荐列与偏好

| 文件 / 方法 | 功能与用途 |
| --- | --- |
| backend/app/native/list_columns.py：`RECOMMENDED`、`EXTRA`、`ACCOUNT_COLUMNS`、`DERIVED`、`OMITTED` | 描述18类列表的推荐字段、附加可选字段、账号列、已有派生列及不适合列表的正文载荷。 |
| `column_layout` | 按推荐顺序生成去重后的安全可选列及推荐列；只使用原生或已有派生字段，排除密钥及长正文。 |
| backend/app/native/web.py：`list_page` | 取得共享列描述，与原有媒体/账号视图、权限、筛选及分页一起交给统一模板。 |
| frontend/admin/templates/native-list.html | 直接渲染推荐显隐、受保护首列、列恢复按钮和无脚本提示；空列表按推荐列数跨列。 |
| frontend/admin/static/js/native-columns.js：`setupColumns` | 统一接入各功能的显隐、合法旧列宽继承、用户拖动、推荐/旧版恢复及浏览器存储失败反馈。 |
| `read` | 有界读取浏览器偏好；禁用存储或JSON错误时返回安全默认。 |
| `sanitize` | 只接受服务端提供的列名、布尔显隐及65–800px有限数值；首列显隐不可覆盖。 |
| `persist` | 仅在用户操作后写入当前功能的新版偏好；失败说明仅本页有效，旧版键保持不变。 |
| `visibility` | 同步选择框、表头和正文单元格显隐，并更新空结果的跨列数。 |
| `paintWidths` | 根据已有文本估算与用户宽度更新表头；手机限制冻结首列显示宽度，保留桌面原值。 |
| 拖动回调`move`、`end` | 只处理当前指针；实时约束宽度，结束时保存一次，取消或未移动时恢复。 |
| frontend/admin/static/js/native.js | 调用共享列控制器，继续复用原有行操作、分页和表头筛选；移除原来每次进入自动写偏好的重复逻辑。 |
| frontend/admin/static/js/native-table-layout.js：`observeActionColumn` | 沿用已有操作按钮测量、冻结列及数量换行逻辑。 |
| admin.css、admin-theme.css | 隐藏列不占空间，恢复按钮和长标签紧凑排列，选择窗口宽度由后台主题控制。 |
| tests/test_list_columns.py：`Columns`、`handle_starttag` | 从真实HTTP页面读取列及选择器属性，不依赖新增HTML解析库。 |
| `test_rendered_recommendations_and_optional_columns` | 验证所有列表初始推荐、安全可选字段和固定首列的一致性。 |
| `test_hidden_column_filter_export_and_content_preservation` | 验证隐藏列条件仍生效、导出保留原数据、敏感列拒绝查询及列表读取不修改记录。 |
| tests/browser/column_checks.py：`visible_columns`、`verify_columns` | 验证真实浏览器显隐、拖动、恢复、旧数据保留、无JS、存储失败、空列表、手机窗口和冻结边缘。 |


## 操作通知与列表区域更新

| 文件 / 方法 | 功能与用途 |
| --- | --- |
| backend/app/native/web.py：`render` | 为后台通知提供当前会话的非密钥指纹；登录账号与指纹共同约束一次性消息。 |
| `list_page` | 以相同字段、权限和分页上下文输出完整页面或JSON列表片段；片段重新核对固定导航并返回有效页码URL、账号及会话指纹。 |
| `row_action` | 继续使用既有事务与原生时间戳校验；开关写入后回读实际布尔值和新时间戳，只返回必要显示字段；保留必须改密及工作区刷新标记。 |
| frontend/admin/templates/layout.html | 挂载独立于文档流的共享通知区，右侧固定栏、内容区和侧栏继续各司其职。 |
| native-list.html、native-list-panel.html | 完整页与局部刷新包含同一个列表面板，复用媒体、账号单元格及分页宏，去除列表上方占高度的写入反馈。 |
| frontend/admin/static/js/native-notifications.js：`notify` | 有界创建或更新文本通知，提供状态、图标、ARIA播报、关闭及可选操作按钮；同一进度只更新一条消息。 |
| 通知对象的`pause`、`resume`、`close` | 管理剩余阅读时间，鼠标与键盘任一停留均暂停，关闭时释放计时器及节点。 |
| `rememberNotice`、`consumeNotice` | 在必要的同源跳转中保存并消费单一短时成功消息；校验账号、会话、目标路径、类型和时效，读取后立即移除。 |
| frontend/admin/static/js/native-list.js：`requestJSON` | 有超时的单次JSON读写请求，识别明确拒绝与结果不确定；不自动重放写入。 |
| `mountList`、`dispose` | 为完整页或新片段挂载统一列表行为；替换时清理全局事件、列宽监听和操作列观察器。 |
| `selection` | 同步已选数量、全选和半选状态。 |
| `refresh` | 从当前URL读取经过授权的共享列表片段，核对账号和会话，保留列偏好、选择、搜索草稿、焦点和滚动，替换区域并校正页码。 |
| `failedRefresh`、`finish` | 区分业务操作与后续读取结果；刷新失败时阻止陈旧写入，提供只读重试并保留明确提示。 |
| `patch` | 使用服务端实际开关值更新当前行的按钮、提示文字和原生更新时间，支持下一次并发校验。 |
| `mutate`、`perform` | 统一发送带CSRF、导航版本和行时间戳的单条请求；串行化列表写入，恢复原禁用状态与焦点，集中反馈错误。 |
| `batch` | 按快照逐条处理选择项，首次失败停止，汇总成功/失败或待核对/未处理数量，重读列表后保留剩余选择。 |
| 表头筛选回调 | 复用原有筛选/排序/固定条件逻辑，文档级监听器随面板销毁而释放。 |
| 媒体上传回调 | 复用原始字节上传接口；等待上传完成后刷新同一媒体列表和缩略图，失败时保留待上传文件。 |
| frontend/admin/static/js/native-columns.js：`setupColumns`返回的`snapshot`、`dispose` | 获取当前合法列显隐及真实桌面宽度供片段刷新复用；清理旧窗口尺寸监听。 |
| frontend/admin/static/js/native-media.js：`setupMediaPreviews` | 为初始页面及新列表缩略图复用缺失文件反馈，WeakSet避免重复绑定。 |
| frontend/admin/static/js/native-editor.js | 保留草稿与字段错误，保存成功跳转前登记一次性成功反馈。 |
| frontend/admin/static/js/native.js | 接入统一列表控制器，继续加载既有编辑器与辅助工具。 |
| admin-theme.css、admin.css | 通知视觉参数集中于主题文件；布局将气泡定位于右侧安全区域并适配手机。 |
| tests/test_list_updates.py：`client_for`及测试函数 | 使用临时原生数据库和真实HTTP，验证连续开关、原始时间戳、末页回退、固定范围、CSRF、权限及自身改密跳转。 |
| tests/browser/notification_checks.py：`ready`、`replaced`、`verify_notifications` | 验证真实页面的稳定更新、反馈计时、键盘和鼠标阅读、局部读取、列偏好、批量中止及消息不重放。 |
| 测试回调`reject`、`hold`、`fail_second`、`fail_read`、`count_write` | 明确注入拒绝/延迟/读取故障并统计实际请求，验证故障不会触发自动重写。 |
| tests/browser/media_checks.py、native_check.py | 媒体验收等待局部刷新后的通知；主验收接入独立临时记录和通知专项，沿用受控服务生命周期。 |


## 统一导航选项与字段说明

| 文件、函数或组件 | 功能与用途 |
| --- | --- |
| backend/app/native/field_help.py：COMMON、BY_TABLE | 维护通用及按模块区分的字段业务含义，包括当前尚未执行的设置 |
| requirements | 从原生字段校验生成默认/留空、类型、单位及范围要求；权限范围和服务顺序使用专用控件规则 |
| apply_help | 合并字段含义与填写要求，补充多值写法、引文保护和实际展示标签 |
| backend/app/native/navigation_options.py：OPTIONS、PRESETS | 集中定义受支持导航值、中文说明、可用图标/样式及常用页面 |
| decorate_fields | 将导航配置转为下拉，保留空值和现有自定义值，提供选项说明 |
| sidebar_presentation | 将已保存的图标/样式限制在现有资源白名单，其他值安全回退 |
| editor.editor_fields | 接受当前记录以回显自定义选项，并为所有统一控件应用功能及填写要求 |
| navigation.editor_state | 为原有固定筛选草稿附带常用页面预设 |
| web.context、web.edit_page | 按权限生成实际侧栏图标/样式，并传递当前记录与统一字段说明 |
| web访客首页查询 | 仅对原生表实际存在的精选字段添加筛选，研究方向按公开可见范围查询 |
| frontend/admin/templates/native-fields.html：control | 服务端输出功能、规则和选中项说明；关联输入与说明，保留原生表单提交 |
| native-help.html：hint | 为密码、密钥及专用设置复用相同的帮助文字外观 |
| native-account-password.html、native-password.html、native-edit.html | 展示真实密码/确认与密钥要求，说明留空保留和全局配置生效规则 |
| native-metadata-providers.html、native-permissions.html | 为启用顺序、单项权限与批量选择提供可访问的填写说明 |
| native-navigation.html、layout.html | 输出页面预设、锚点应用、样式示意及实际侧栏安全图标 |
| frontend/admin/static/js/native-field-help.js：attachHelp | 给辅助或动态输入添加唯一说明标识和紧凑容器，文本输出并防止重复绑定 |
| refreshOptionHelp | 同步当前选项的正文说明和悬停提示，使手机也可阅读 |
| describeControls | 为注册的媒体、裁剪、论文核对和分类辅助控件提供说明，关联引文保护；限于编辑/工具区域观察新节点 |
| native-navigation.js：syncNavigationPresentation | 显示实际支持提示、安全外观示意及适用锚点控件，保留非当前类型的草稿 |
| native-navigation.js预设和锚点事件 | 复用已有条件模型应用内容预设，校验并编码锚点，停止过期预览，不自动保存 |
| native-navigation.js：renderRows | 给动态条件字段及条件值接入相同帮助组件，复用精确匹配和原有请求生命周期 |
| native.js | 接入辅助字段说明模块，与既有单表单保存、媒体和输入辅助共存 |
| admin-theme.css、admin.css | 集中定义说明文字的视觉参数和侧栏语义样式；布局按控件类型及手机宽度换行 |
| tests/test_field_help.py：Inputs及测试函数 | 读取真实渲染表单，核对说明关联、原生规则、密码/权限/密钥及自定义导航值保存和侧栏权限 |
| tests/browser/field_help_checks.py：missing_help、verify_field_help | 检查真实页面说明引用、导航选择/保存/预览、首页锚点、媒体辅助和多宽度布局 |
| tests/browser/navigation_checks.py、native_check.py | 以原生下拉操作验收已有导航功能，并将说明检查纳入完整受控浏览器回归 |


## 媒体链接与外部资源

| 文件、函数或组件 | 功能与用途 |
| --- | --- |
| backend/app/native/media_links.py：external_url | 校验HTTP(S)地址、端口、IP和主机名，编码中文并保留签名路径及查询；不进行DNS或远程请求 |
| media_link | 将已登记媒体转为用户可读的本站入口或原始外链 |
| MediaLinks.__init__ | 为本请求保存待登记外链和已存在媒体的版本，不建立额外存储 |
| MediaLinks.resolve | 解析原生键、本站媒体入口或外链，检查类型、状态和版本，并生成无写入的登记草稿 |
| MediaLinks.statements | 生成受身份、媒体权限及版本约束的登记/审计语句，加入调用方原生事务 |
| MediaLinks.form | 解析11类字段的链接、类型和版本辅助值，校验目标及导航范围，回填真实对象键 |
| decorate_media_fields | 批量读取当前已选媒体，为共用控件提供显示链接、类型、版本和简明标签 |
| MIME_LABELS、MAX_URL、LOCAL_MEDIA | 集中定义声明类型标签、链接长度及本站入口语法 |
| content.Content.save | 允许当前登记计划参与类型检查，将新媒体登记、业务引用和日志置于同一事务，失败一起回滚 |
| media_picker.MediaPicker.dto | 返回选择所需字段及存储来源，排除校验和和服务端配置 |
| MediaPicker.options、listing | 将external纳入类型适用的活跃媒体，输出共用类型标签、上传权限及有界分类和分页 |
| MediaPicker.select | 已登记外链核对地址、版本及类型；本站文件继续核对存在性和大小 |
| MediaPicker.crop_upload | 接受外链登记作为可选来源，复用输出校验、原版本和正常文件上传 |
| editor.reference_choices | 保留有界原生键候选，纳入适用外链并补回现有选择 |
| field_help.apply_help | 在媒体字段说明中补充链接输入、浏览器加载和私密文件上传要求 |
| media_admin.resolve_link | CSRF保护的只读链接解析与预览接口，不写入登记或内容 |
| media_admin.register_link | 明确登记或复用链接，再执行已有选择确认；不自动保存目标内容 |
| media_admin.lookup | 按媒体键返回授权预览信息；POST体避免带签名链接出现在查找查询参数中 |
| web.edit_page、save | 为表单提供显示值并解析提交的链接计划，继续复用原保存栏和错误处理 |
| web.media_preview、media | 检查私有或公开引用权限后，安全重定向外链；原本站文件读取分支不变 |
| web.headers | 允许浏览器加载外部媒体；后台像素读取仍受CORS限制，外部PDF用沙箱框架 |
| media_audit.MediaAudit.classify、state、page | 将外链单独分类，跳过目录读取；旧报告补足新增分类的零值并保持续扫 |
| MediaAudit.eligible、prepare_purge、commit_purge | 外链继续检查引用、版本及保留期，预检明确仅删除登记；提交不调用对象存储 |
| frontend/admin/templates/native-fields.html | 同一媒体控件输出可见链接、隐藏原生键、声明类型和版本辅助值；使用真实字段标签及帮助关联 |
| native-media-picker.html | 共用弹窗增加链接输入、类型声明、只读预览和明确登记按钮，与原上传/选择/裁剪并列 |
| native-media-parts.html、native-media-detail.html | 外链来源和未核验提示、未知大小、私有回收站预览及受沙箱限制的外部PDF |
| native-list-panel.html、native-media-audit.html | 外链大小显示未知，保留原分页、筛选、操作和使用位置 |
| frontend/admin/static/js/native-media-links.js：mediaURL、previewURL | 为表单和选择器统一生成用户链接与浏览器预览地址 |
| lookupMedia | 通过私有POST查找原生键，不将签名URL写入请求查询参数 |
| suggestedType | 根据文件名提供可修改的声明类型建议，不声称内容已验证 |
| showLinkPreview | 使用图片/视频浏览器解码器完整等比预览，提供失效反馈并忽略已移除预览的晚事件 |
| imageFile | 有界读取同源或CORS允许的图片，限制20MiB/15秒；外部请求不带Cookie/Referer、不跟随重定向，返回可供原裁剪器使用的File |
| native-media-fields.js：externalControls、assign、update、choose | 联动可见链接、隐藏键、版本、类型、完整预览和既有选择器；取消旧预览，不清空失败草稿 |
| native-media-picker.js：resolveLink | 统一处理只读预览和显式登记，更新待选项及反馈，内容引用仍由保存建立 |
| native-media-picker.js：search、drawRows、editSelected、chooseMedia、busy | 复用服务端类型标签，显示来源和未知大小；查找当前媒体不受列表首页限制，裁剪复用有界图片读取并恢复操作状态 |
| frontend/admin/static/css/admin.css | 复用旁侧完整预览布局，为链接、类型说明和手机弹窗安排网格位置 |
| tests/test_media_links.py：register、save及测试函数 | 通过真实临时库/HTTP验证地址、声明类型、11字段、原子回滚、引用、版本、权限及两种存储模式 |
| 测试NoObjects、revoke_before_commit | 显式阻止外链触碰对象存储，并在提交前撤权以验证事务回滚 |
| tests/browser/media_link_checks.py：verify_media_links、remote、save、ready_image | 用受控外部响应验证实际预览、表单回滚、选择器、Canvas输出、读取拒绝、正文引用、回收和响应式布局 |
| tests/browser/media_checks.py、media_audit_checks.py、native_check.py | 将旧媒体下拉交互改为可见链接/清空操作，接入完整回归并保持独立临时数据清理 |


## 服务预设、翻译与连接测试

以下模块共用原生字段、统一服务卡片和请求适配器，不增加数据库结构。

### backend/app/native/service_config.py

Shared native provider-list and form rules; defaults never write settings at startup.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `provider_settings` | Resolve an empty original config; retain explicit defaults, order and disabled sources. |
| `provider_form` | Convert shared checkboxes/order into the existing JSON array, including without JS. |

### backend/app/native/translation_config.py

Five translation presets over native fields, with deployment secrets taking precedence.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `credentials` | Read a fixed set of backend-only variables without exposing their values in UI DTOs. |
| `allowed_hosts` | Custom translation hosts require an explicit deployment allowlist, not a form URL alone. |
| `endpoint` | Retain a public HTTPS base path but reject userinfo, queries, fragments and custom ports. |
| `parse_settings` | Use MyMemory when empty; a previously configured Google key retains the old effective default. |
| `load_settings` | Read only the earliest global settings row and resolve backend-only effective credentials. |
| `form_settings` | Reuse the native shared checkbox/order parser for the five translation services. |
| `availability` | Separate disabled, missing credentials and unapproved custom hosts before sending text. |
| `display_options` | Return effective addresses and credential presence, never key contents or contacts. |
| `page_options` | Decorate settings with stored-key presence while retaining an invalid draft for repair. |

### backend/app/native/translation_http.py

Shared bounded HTTP contract for translation adapters; no redirects or arbitrary destinations.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `validate_request` | Validate a generated request again at the I/O boundary, binding keys to its provider. |
| `decode_response` | Reject oversized/malformed JSON before any provider-specific field extraction. |

### backend/app/native/translation_service.py

Five providers share text segmentation, finite budgets and safe rich-text reconstruction.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `TranslationFailure.__init__` | Store only the public failure code, without carrying an external exception body. |
| `language` | Validate the native language tag before placing it in fixed provider parameters. |
| `chunks` | Split by UTF-8 bytes, preferring sentence/word boundaries without truncating any character. |
| `TranslationDocument.__init__` | 维护当前对象的配置与状态。 |
| `TranslationDocument.handle_starttag` | Retain sanitized markup; pre/code content remains literal. |
| `TranslationDocument.handle_startendtag` | Retain sanitized void tags without changing the code nesting state. |
| `TranslationDocument.handle_endtag` | Close existing markup without allowing a provider to add or remove tags. |
| `TranslationDocument.literal` | Escape text literals only when reconstructing HTML. |
| `TranslationDocument.handle_data` | Preserve URLs and whitespace, deduplicate identical segments within this one call. |
| `TranslationDocument.segment` | Keep paragraph whitespace outside translated payloads and enforce the segment byte limit. |
| `TranslationDocument.chunked` | Register finite byte-bounded pieces from a single paragraph line. |
| `TranslationDocument.render` | Build all-or-nothing text, escaping provider markup and bounding the final document. |
| `request_for` | Build the provider's official language/auth/body mapping without exposing credentials. |
| `extract` | Validate successful text and map auth/limit errors without returning vendor messages. |
| `TranslationService.__init__` | Reuse the current request's backend transport and effective configuration. |
| `TranslationService.execute` | Try one provider unless fallback was explicit; no partial result or automatic retries. |

### backend/app/native/service_jobs.py

Short site-wide network leases in the existing native guard table, not a worker daemon.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `network_lease` | Serialize translation/test calls across local processes and Worker requests for 180 seconds. |

### backend/app/native/service_tools.py

Explicit settings-draft connection tests reuse provider executors without saving data.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `ServiceTools.__init__` | Keep authorization, settings and transports within the current authenticated request. |
| `ServiceTools.current` | Require the current editor record/version before using any stored credential. |
| `ServiceTools.test` | Send only a fixed short sample with selected draft config; no content or config writes. |

### 现有模块接入与共享界面

| 文件、函数或组件 | 功能与用途 |
| --- | --- |
| backend/app/native/assistance.py：Assistance.translate | 按默认／明确回退调用服务，原文、人工译文、并发版本、媒体和会话权限共同约束原子写入；失败保留原成功结果 |
| metadata_config.parse_settings、form_settings | 复用共同的默认值和数组解析，保留已有启用顺序与未启用状态 |
| metadata_config.display_options | 提供论文服务有效地址、凭据状态和简明请求说明 |
| backend/app/native/runtime.py：local | 读取翻译环境密钥及自建域名允许列表，构造本地有界HTTP适配器 |
| backend/entrypoints/worker.py：resource_factory | 从同名Secret及部署变量构造Worker翻译适配器，不使用本地存储地址 |
| content.Content.save | 保存全局设置时复核翻译枚举、顺序、端点、邮箱、区域和密钥格式；空密钥继续保留 |
| editor.editor_fields | 两组服务使用同一控件类型，默认服务采用下拉，自建地址展示有效预设提示 |
| field_help.BY_TABLE、requirements | 描述真实翻译总等待、供应商参数、凭据、尚未接入调度与对应顺序范围 |
| web.editor | 裁剪服务配置给统一模板，只提供密钥存在状态，生成单条翻译工具 |
| web.save | 将两组复选与顺序控件还原到原生数组，然后复用完整表单保存 |
| web.service_test | 严格接受服务测试DTO，验证CSRF后执行固定样例，不保存草稿 |
| web.translate | 接收条目标识、原版本及明确服务选择，返回真实状态及新更新时间 |
| frontend/admin/templates/native-service-providers.html | 共用两组服务卡片、明确测试、推荐值按钮、参数说明和可访问的状态提示 |
| native-metadata-providers.html、native-fields.html | 沿用原字段入口转入统一服务模板，不复制各供应商的业务逻辑 |
| native-translation-tools.html | 展示语言、状态、人工保护、单条服务选择及标题／名称建立入口 |
| native-edit.html | 复用翻译工具，并将所有密钥放入统一紧凑字段网格，显示实际长度和用途 |
| frontend/admin/static/js/native-services.js：serviceDraft | 只提取当前服务组的草稿，保持服务顺序，不发送完整配置或业务正文 |
| changed及测试事件 | 参数改变即将旧结果标为过期；仅显式点击发送样例，等待时阻止重复测试，失败恢复控件 |
| 推荐设置事件 | 只更新本组默认和启用顺序草稿，不改密钥、自建地址及其他组配置 |
| fingerprint与单条翻译事件 | 阻止未保存编辑丢失，锁定执行期间输入，恢复失败操作并用新版本支持重试 |
| native.js | 统一加载服务交互模块，移除原有独立翻译按钮回调 |
| admin.css | 用既有主题变量排列共享服务操作、地址和响应式字段 |
| tests/test_services.py | 临时原生库验证五供应商、默认保留、参数、字节分段、请求预算、状态、HTTP适配、人工／权限／版本保护及真实表单接口 |
| tests/test_media_management.py | 验证人工引入无效媒体仍拒绝，供应商HTML只成为转义文字，不能新增媒体引用 |
| tests/browser/service_app.py | 浏览器验收专用上游替身；实际VPS应用与数据库写入路径仍被调用，生产入口不引用此模块 |
| tests/browser/service_checks.py：verify_services、record | 观察请求并验收显式测试、迟到反馈、保存、失败重试、人工锁定和多宽度布局 |
| tests/browser/native_check.py | 在独立临时服务运行服务专项或完整回归；仅测试参数选择上游替身，记录原始结果 |
| tests/browser/metadata_checks.py：verify_metadata | 明确设置本用例使用的两个来源，验证旧论文交互在新公共预设下保持原有行为 |

## tests/test_release.py

发布边界、非UTF-8系统编码和不可覆盖的新版本目录的受控验证，不读取生产数据。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `legacy_text_host`、内部`read_text`/`write_text` | 模拟CP1252和CP936默认文本编码，检查显式UTF-8文件读写。 |
| `test_persistent_root_cannot_live_inside_release` | 核对独立存储地址不能绕过数据根目录的源码外约束。 |
| `test_native_initialization_preserves_utf8_schema` | 核对两套原生DDL初始化、重复打开及只读数据库检查。 |
| `test_worker_preparation_preserves_chinese_on_legacy_host` | 核对两套Worker中文模板、生成资源、自定义绑定和前缀。 |
| `test_verified_release_stage_is_exclusive_and_detects_tampering` | 验证独立新目录、拒绝覆盖及文件内容变化检测。 |
| `test_launcher_accepts_closed_server_time_wait` | 真实建立并正常关闭TCP连接，检查POSIX同端口立即重启。 |
| `test_launcher_refuses_live_listener_without_stopping_it` | 检查已有监听端口仍被拒绝且原服务可以继续接收连接。 |

## tests/release_check.py

对指定的旧版和候选精简包执行隔离启动检查。使用临时账号、测试媒体和暂停的快传任务；不操作真实配置或数据库。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `unpack` | 约束运行包大小及路径，解压后验证完整发布清单。 |
| `data_snapshot` | 比较39张原生表及持久文件摘要，只排除正常请求会更新的三个会话活跃时间字段；不输出密钥。 |
| `serve_and_probe` | 调用所选发布包的共享启动器启动主站和快传，检查既有内容、人工译文、媒体与后台资源，然后停止自有进程。 |
| `main` | 组织旧包到新包的临时启动检查，核对中文路径、环境覆盖、日志轮换与源码文件不变。 |
| `FIXTURE`中的`create`、`Upload.stream` | 从所选旧包调用真实业务方法生成可辨识数据，提供有限PDF字节并构造暂停任务，供保存行为比较。 |


## backend/app/native/translation_sources.py

Allowlisted public text sources and exact-hash English overlays shared by scan and display.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `reference` | Construct a source key from native table/field allowlists, retaining colon-bearing UIDs. |
| `split_reference` | Decode a source reference without accepting arbitrary SQL identifiers. |
| `public_source` | Apply public/active/published gates before any automatic provider request. |
| `manual_english` | Prefer explicitly maintained native English fields over all automatic caches. |
| `source_format` | 缓存复用区分纯文本、Markdown和HTML，不能只判断是否HTML。 |
| `html_source` | Only news HTML body fields require structural translation and media validation. |
| `candidate` | Classify empty, manual, English-only and oversized text without transmitting it. |
| `overlay` | Apply matching current translations to a public DTO using one query per source row. |

## backend/app/native/translation_batch.py

Browser-driven, checkpointed translation over native JSON fields; one bounded item per request.

| 函数或方法 | 功能与用途 |
| --- | --- |
| `metadata` | Read bounded scheduler annotations while retaining the native source reference array. |
| `encoded_metadata` | Keep other source metadata, replacing only this scheduler's bounded annotation. |
| `eligible_sql` | Reuse native public gates as transaction-time predicates, with no private text projection. |
| `TranslationBatch.__init__` | Use current request authorization and the same SQL/media/translation adapters on both platforms. |
| `TranslationBatch.load` | Read the single job without writing defaults or disclosing service credentials. |
| `TranslationBatch.own` | Restrict control to the initiator; system administrators may pause another user's job. |
| `TranslationBatch.status` | Expose only counters to other users and hide recent source links after permission removal. |
| `TranslationBatch.write` | Atomically compare the whole job and settings timestamp, then save state plus bounded effects. |
| `TranslationBatch.guard` | Fence an in-flight result by its job claim and current public source, including manual English. |
| `TranslationBatch.action` | Create, resume, pause or explicitly retry a finite scan/run plan; never translate on GET. |
| `TranslationBatch.step` | Claim and advance exactly one field/cache row/translation; a lost response can resume safely. |
| `TranslationBatch.cache_statements` | Prepare one guarded cache mutation for a standalone or shared checkpoint transaction. |
| `TranslationBatch.cache_write` | Persist a pre-request attempt or scan annotation through the shared guarded mutation. |
| `TranslationBatch.activate` | Reactivate exact results or reuse public automatic text with native media and donor guards. |
| `TranslationBatch.scan` | Advance a keyset/field cursor under fixed start IDs; never gather all source bodies. |
| `TranslationBatch.reconcile` | Invalidate changed/withdrawn sources or explicitly requeue this job's non-manual failures. |
| `TranslationBatch.donor` | Reuse only current automatic results from equal, still-public, readable source text and format. |
| `TranslationBatch.selection` | Share the exact pending set between execution and wait/completion checks. |
| `TranslationBatch.run` | Run one due item; reuse results, bound retries and checkpoint before contacting a provider. |
| `TranslationBatch.invalidate` | Explicitly disable a current cache; scans respect that choice until a manual save restores it. |

## 翻译批次界面与共享方法

| 文件或函数 | 功能与用途 |
| --- | --- |
| frontend/admin/templates/native-translation-batch.html | 共用后台工作区、字段说明和Bootstrap控件，呈现11类范围、服务、操作、进度、累计计数和最近结果。 |
| frontend/admin/templates/native-list-panel.html | 在翻译列表提供批量管理入口，沿用统一权限和列表模块。 |
| frontend/admin/templates/native-translation-tools.html | 单条服务执行、批量入口、人工保护、停用和未生效提示。 |
| frontend/admin/static/js/native-translation-batch.js | 页面驱动有限请求，初次加载只读取状态，离开页面停止后续请求。 |
| `render` | 更新中文阶段、固定任务范围、操作可用性、计数和安全文本节点；最近记录复用服务端中文字段标签。 |
| `apply` | 忽略同一任务的较旧响应，防止暂停或完成状态被晚响应覆盖。 |
| `refresh` | 只读服务器当前任务，用于手动刷新和并发冲突后的核对。 |
| `call` | 复用assist和页面CSRF提交有限的任务动作。 |
| `drive` | 串行推进一个字段或条目，遵守暂停、完成、领取和重试截止时间；恢复必须明确操作。 |
| 动作监听器 | 收集新扫描范围，提交继续/单批/自动/重试操作；暂停竞态可刷新并重试同一个任务，不新建替代任务。 |
| frontend/admin/static/js/native-services.js | 单条执行和停用复用同一脏表单检测、原生版本、控件锁定、失败恢复和成功刷新流程。 |
| frontend/admin/static/js/native.js | 加载批次模块，其他后台页面没有根节点时不注册批次行为。 |
| frontend/admin/static/css/admin.css | 批次区域留白、紧凑控件、响应式范围网格、计数卡和横向表格布局。 |
| frontend/admin/static/css/admin-theme.css | 批次图例字号、进度颜色及暂停/停用按钮的可读配色，复用现有颜色和字体变量。 |
| `Content.save`的translation_cache分支 | 人工译文保存仍受版本和媒体校验；清除显式停用标记并按正文恢复当前/人工状态。 |
| `create_app.context`、`create_app.public` | 用共享来源注册表覆盖网站、公开内容和导航的英文DTO；不调用翻译服务或写回原文。 |
| backend/app/native/field_help.py | 说明批次条数和并发上限的实际用途，其他字段继续复用原说明规则。 |
| tests/test_translation_batch.py | 原生SQLite、真实D1适配器的本地绑定替身、权限、公开来源、复用、暂停/恢复、失败重试和断点计数的业务验证。 |
| tests/browser/translation_batch_checks.py：verify_translation_batch | 真实HTTP、表单和浏览器操作下验证暂停刷新、有限批次、英文结果、手机布局及可恢复停用。 |
| tests/browser/native_check.py | 将批次界面纳入完整回归，也允许translation-batch专项；测试替身只通过显式测试环境启用。 |

## backend/app/native/media_inventory_store.py

媒体目录只读列举、版本核对及受控收录；支持Unicode原文件名，拒绝路径逃逸。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `relative_key` | 扫描键可含中文，但不能是绝对路径、空段、控制字符或父目录。 |
| `digest` | 将平台版本信息转换为固定长度比较值，不作为内容校验值。 |
| `js_options` | 在Worker中将纯Python配置转换为普通JS对象；本地测试可替换此边界。 |
| `LocalInventory.__init__` | 限定于既有存储根目录，不创建额外媒体目录。 |
| `LocalInventory.path` | 拒绝所有符号链接/Windows联接点，包含指向根目录内部的链接。 |
| `LocalInventory.head` | 读取普通文件实际大小和inode/时间版本，不读文件正文。 |
| `LocalInventory.read` | 对目录内Unicode文件进行有界读取，调用者负责前后版本一致性。 |
| `LocalInventory.read_range` | 只读取指定64KiB以内区间；文件替换或读取中变化时停止返回。 |
| `LocalInventory.list_page` | 深度优先游标，每批最多访问20个目录条目；不把整棵目录树载入内存。 |
| `LocalInventory.create` | 新副本只允许独占创建，碰到已有文件立即停止。 |
| `LocalInventory.delete` | 删除前再检查实际版本；不跟随链接，不递归删除目录。 |
| `R2Inventory.__init__` | 复用配置的桶绑定和媒体前缀。 |
| `R2Inventory.head` | R2 head仅读取元信息，version用于识别对象替换。 |
| `R2Inventory.read` | 先查实际大小再读取R2正文，保持平台内存上限。 |
| `R2Inventory.read_range` | 向R2申请有界区间，检查上传版本和实际返回范围后才读取缓冲区。 |
| `R2Inventory.list_page` | 仅列举配置前缀，以truncated而非返回数量判断是否还有下一批。 |
| `R2Inventory.create` | 通过条件写入新对象，禁止覆盖已存在的目标。 |
| `R2Inventory.delete` | 删除前复核版本；目录应由应用管理，R2 delete本身无条件版本参数。 |
| `inventory` | 按存储适配器选择目录能力，媒体与缓存始终使用各自配置。 |


## backend/app/native/media_response.py

媒体授权后的HTTP输出；本地与R2均实际分段读取，不在应用内存聚合整文件。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `byte_range` | 解析单一区间和后缀范围，拒绝多区间、空后缀、越界及异常长数字。 |
| `media_response` | 先核对公开引用或媒体查看权限，再校验实际大小、签名及每个分段的对象版本。 |
| `media_response.chunks` | 本地每块64KiB、R2每块1MiB；同一响应使用已验证权限，新Range请求会重新核验公开引用。 |


## backend/app/native/news_body.py

新闻正文安全呈现；后台草稿预览与访客详情使用相同HTML和媒体组件标记。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `news_html` | 仅装饰已收录且有效的PDF链接；不查外链，不输出对象路径或任何管理字段。 |


## frontend/admin/static/js/native-richtext.js

| 函数或组件 | 功能与用途 |
| --- | --- |
| `initialize` | 初始化单页正文编辑、媒体辅助、预览及转换草稿。 |
| `server` | 携带当前新闻、版本、导航及CSRF调用只读渲染或转换；取消旧请求。 |
| `syncBody / sync` | 同步Quill语义HTML及正文格式显示；资源失败时保留输入。 |
| `showPreview / invalidate` | 显示服务端实际正文预览，草稿变化时取消过时预览并释放PDF资源。 |
| `insert` | 复用统一选择器插入图片或带标题的PDF，检查光标草稿和10文件上限。 |
| `imageInspector / ManagedImage` | 维护受管理图片地址、替代文字、排版类及当前图片工具；create启用拖动，html输出时去掉临时draggable属性。 |
| `createEditor / Divider` | 建立工具栏、语义分隔线、粘贴上传和已有图片拖动事件。 |
| `snapshot / button / message` | 复用草稿指纹、动作按钮和反馈展示。 |


## frontend/shared/static/js/news-reader.js

| 函数或组件 | 功能与用途 |
| --- | --- |
| `pdfLibrary / schedule` | 按需载入固定PDF.js，串行绘制以控制并发。 |
| `mountNewsReader` | 为正文PDF标记挂载阅读器，返回集中清理函数。 |
| `release` | 释放画布、文字层及页资源，保留页面比例占位和重新显示按钮。 |
| `InlinePDF.constructor / near` | 建立视口、尺寸和按钮事件，区分稳定操作区与底部自动加载标记。 |
| `InlinePDF.open` | 加载文档、限制同时解析数量，并支持明确继续或失败重试。 |
| `InlinePDF.append / autoNext / progress` | 按页追加独立宽高比例，区分手动跳页和接近末尾自动追加，回显进度。 |
| `InlinePDF.render` | 单页按像素上限绘制并生成可选文字层，全页最多3个画布。 |
| `InlinePDF.pause / destroy` | 收起或释放文档，取消任务、观察器与临时资源。 |
| `InlinePDF.note` | 通过状态区域反馈读取进度和错误。 |


## frontend/shared/static/css/news-body.css

| 函数或组件 | 功能与用途 |
| --- | --- |
| `正文与PDF布局` | 共用图片排版、自然页高、PDF文字层几何；后台配色和字号读取admin-theme.css。 |


## 业务恢复与现有共享方法

`catalog.normalize(..., restore=True)`仅供内部恢复校验原生保留字段，普通HTTP编辑继续使用原字段白名单。`Database.restore_batch`、`D1SQL.restore_batch`及内部`_batch`提供最多64条语句的恢复事务，普通写入仍最多25条；SQLite/D1复用同一参数化语句。`metadata_config.load_settings`返回设置更新时间，`MetadataSearch.search`据此使旧候选缓存失效。数据库定义、媒体存储配置及快传业务不依赖这些恢复工具。


## backend/app/native/sessions.py

原生主站会话的分页展示与事务撤销，复用账号权限、内容范围及审计服务；不增加身份字段。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `Sessions.__init__` | 接收同一请求内的认证、内容和SQLite/D1资源。 |
| `Sessions.account` | 校验系统管理员、账号查看/编辑动作、目标记录可见范围和传入固定条件。 |
| `Sessions.listing` | 计算活动/过期/撤销状态计数，提供编号搜索、时间排序、有界分页，输出非敏感展示字段。 |
| `Sessions.revoke` | 保护当前浏览器；以账号版本、权限和会话状态为事务门禁，撤销所选或执行时全部其他活动会话，原子写入日志并返回实际数量。 |

## backend/app/native/session_admin.py

账号编辑页会话片段及HTTP控制器，与主站路由共用资源和CSRF校验。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `panel` | 为首次编辑页面和局部刷新生成相同的会话HTML片段。 |
| `panel.page_url` | 将白名单筛选、页大小与导航标识编码为分页地址。 |
| `install` | 安装会话查询和撤销路由，接入主站统一身份、CSRF、导航校验。 |
| `install.listing` | 每次请求重新授权，返回一页会话片段，保持账号表单独立。 |
| `install.revoke` | 限制请求大小、检查同源和CSRF、核对导航版本，将显式撤销交给领域服务。 |

## frontend/admin/static/js/native-sessions.js

账号编辑页内部的会话交互，不刷新整页、不将辅助筛选写入账号字段、不自动重试写操作。

| 函数或方法 | 功能与用途 |
| --- | --- |
| `root` / `picked` | 取得当前片段及本页所选会话编号。 |
| `selection` | 同步勾选计数、全选/部分选中状态及撤销按钮可用性。 |
| `url` | 从本区筛选控件生成请求地址，不改变账号编辑地址或草稿。 |
| `responseData` | 解析统一JSON响应并转为可读错误。 |
| `refresh` | 只替换服务端安全渲染的会话片段，清空本页选择。 |
| `perform` | 处理刷新或撤销确认，锁定并行提交，区分写成功后刷新失败与写请求失败，使用共用通知展示结果。 |

## frontend/admin/templates/native-sessions.html

首次展示和局部刷新共用的会话模板，提供状态计数、搜索/排序、批量动作、共享数字分页及当前会话标识；不包含登录令牌或密码字段。由native-edit.html的会话区复用，区块目录仍由editor_sections统一生成。


## 快传界面分区

| 文件 | 函数或组件 | 功能与用途 |
| --- | --- | --- |
| transfer/frontend/native/native.html、tasks.html | 页面、任务片段 | 文件发送、可折叠设置、原生GET筛选分页、跨批次控制和缓存目录；复用Bootstrap与后台主题。 |
| transfer/frontend/native/native.js | request、api、refreshTasks、setBusy | 请求超时、未知写结果提示、只读定时刷新与焦点/勾选/草稿保护。 |
| transfer/frontend/native/native.js | runBatch、任务事件处理 | 显式确认范围，串行消费签名游标，首错停止，刷新已确认结果。 |
| transfer/frontend/native/native.js | loadUsage、设置/发送事件处理 | 当前身份额度、版本保存、1MiB续传及前缀摘要验证；终止或到期任务可重新创建。 |
| transfer/frontend/native/native.js | cacheRow、scanCache、deleteCache | 文本安全呈现目录，分批扫描、选择及版本预检删除，显示进度和待重试入口。 |


## 论文编辑页面分区与就近操作

| 文件/函数 | 功能与用途 |
| --- | --- |
| frontend/admin/templates/native-edit.html | 仅论文页重排已有分区，调整短字段行数，挂载独立样式，提供标题右侧的更新/提取按钮。其他表单继续使用原注册表。 |
| frontend/admin/templates/native-publication-citations.html | 复用control宏，将每种引文与对应高亮成组；高亮的自动操作按钮由页面脚本放在标签同行。 |
| frontend/admin/static/css/native-publication-editor.css | 仅匹配论文表单的字段密度、格式分组、原值区、同行按钮和响应式列数。 |
| native-publications.js：setDraft、generate、changeSource | 显式更新五种引用、来源变化时只更新未保护项、快照原值；提交捕获阶段刷新自动引用，避免模块载入顺序影响保存。 |
| native-publications.js：highlightText、教师/高亮事件 | 复用已有教师DTO和引用方法，筛选实际引文内出现的姓名文本，单格式更新及缺失保留。 |
| native-draft-review.js：values、show、applyValues | 字段白名单与非空检查；候选选择后直接回填，原始引用解析仍显示选择面板。 |
| native-draft-review.js：remember、drawEntry、undo | 每字段原值、来源、关联说明与撤销；后续手改禁用直接撤销；源值完整恢复时处理未保护派生引文。 |
| native-metadata-query.js：show | 带data-inline-metadata标记的论文页必须显式选候选；独立只读查询与其他调用维持既有行为。 |


## 论文辅助恢复与实时姓名

| 文件/函数 | 功能与用途 |
| --- | --- |
| backend/app/native/editor.py：citation_profile、citation_profile_names | 查询首位公开精选教师；复用有效英文覆盖规则，返回姓名及来源，兼容已有姓名列表调用。 |
| backend/app/native/web.py：publication_profile | 会话、CSRF、论文新增/编辑和固定导航校验后的只读实时提取；不保存论文或调用翻译。 |
| backend/app/native/web.py：headers、editor | 明确本地JS/MJS响应类型及缓存重验证；组织PDF上传能力及权限说明。 |
| frontend/admin/static/js/native.js：initialize、failed、holdControls | 并行、独立加载适用辅助模块，失败就近提示；就绪前暂时禁用相关按钮，保留手工表单提交及其他模块。 |
| native-publications.js：cancelProfile、教师提取事件 | 可取消、限时获取当前中英文姓名，区分人工/缓存来源，失败保留高亮草稿。 |
| native-fields.html、native-media-fields.js：PDF控件、choose | 页面明确展示PDF上传与选择入口，按授权启用，复用当前媒体选择及回填流程。 |
| native-media-picker.js：chooseMedia、search | 支持直接打开上传页；获取实际权限后核验上传能力，回退时保留选择。 |
| tests/test_publication_recovery.py | 错误系统MIME映射、英文译文版本、实时接口权限/导航及PDF入口回归。 |
| tests/browser/publication_recovery_check.py | 临时本地服务上的回填、撤销、教师姓名、真实PDF上传保存、故障隔离与响应式验证。 |


## 媒体预览状态与恢复

| 文件/函数 | 功能与用途 |
| --- | --- |
| native-media.js：watchMediaPreview、loaded、failed | 共用图片/视频加载状态，成功清除旧错误；维护就近反馈及列表标题中的失败入口。 |
| native-media.js：diagnose、privateURL | 仅对同源媒体授权接口做有界HEAD检查，区分状态及MIME；不探测外部地址。 |
| native-media.js：reload、openDetails、refreshDialog | 显式重试、紧凑状态窗口和同步反馈；保护外链签名，不更改业务草稿。 |
| native-media.js：clearMediaPreviews、setupMediaPreviews | 列表初次及片段更新绑定；替换DOM时释放事件、超时和诊断，忽略迟到结果。 |
| native-media-links.js：showLinkPreview | 字段与链接预览接入同一控制器，失败不删除图片节点。 |
| native-media-picker.js：drawRows、search、finish | 卡片重试独立于选中，查询/关闭取消旧预览检查。 |
| native-media-fields.js、native-list.js | 字段更新与列表替换调用预览释放，不变更原保存及列表数据契约。 |
| native-media-preview.css、native-media-parts.html | 窄屏与桌面失败入口、原因窗口和内联反馈，保留完整等比图片。 |
| tests/test_media_preview_recovery.py | 合成图片实际字节、单Range、HEAD、64KiB上限、权限及伪装文件验证。 |
| tests/browser/media_preview_recovery_check.py | 大图上传、失败恢复、迟到诊断、懒加载、真实缺失恢复、草稿/选择保护和三宽布局。 |


## 独立表头与来源定位

| 文件/函数 | 功能与用途 |
| --- | --- |
| native-table-headers.js：mountTableHeaders、paint、commit | 普通列表、会话、快传任务/缓存共用的筛选弹窗、独立排序、键盘与状态标记，调用各自查询适配器。 |
| native-list.js：mountList | 表头查询保留条件及一次性横向滚动/焦点，列表替换释放表头和来源窗口。 |
| source_links.py：field_link、translation_context | 按权限生成字段/只读记录链接，核对原文快照与当前来源，生成安全可读原文和可读名称。 |
| media_references.py：summaries(include_links)、locations | 已有分组查询同时批量取得单一来源链接；多来源按权限分页，统一字段定位与可读标签。 |
| web.py：media_locations | 媒体来源窗口的授权只读入口，复用详情模板与分组分页服务。 |
| native-media-locations.js：setupMediaLocations、load | 来源窗口、新标签定位、分页、失败重试和迟到响应隔离。 |
| native-source-focus.js：locate | 根据已有字段/记录锚点定位与短暂突出目标，保留输入内容。 |
| native-translation-comparison.html、native-translation-source.html | 原文快照/译文对照、原始文本和授权来源卡片。 |
| native-media-locations.html、native-source-navigation.css | 共用分组来源面板及响应式对照、表头、定位样式。 |
| native-sessions.js：bindHeaders | 会话筛选与排序只刷新原片段，保留账号草稿。 |
| transfer/backend/management.py：TASK_SORTS、listing | 任务白名单排序后分页，保留管理员/所有者范围与原有批量语义。 |
| transfer/frontend/native/native.js：bindTaskHeaders、drawCache | 任务适配服务端查询；缓存适配有界的当前批次过滤/排序，选择仍指向原缓存项。 |
| transfer/backend/native.py：protect | 静态JS/MJS/CSS明确类型，确保共享模块加载；保留nosniff和原权限策略。 |
| tests/test_source_navigation.py、tests/browser/source_navigation_checks.py | 授权来源、HTML安全、查询有界性、排序分页、新标签草稿、响应式和真实保存验证。 |


## 角色进入权限与统一拒绝提示

| 文件/函数 | 职责 |
| --- | --- |
| native/permissions.py：groups、validate、lock_references | 从20模块注册表组织4组界面，验证操作依赖入口，锁定无权关联字段而不阻断当前模块编辑。 |
| native/auth.py：principal、require、guard | 请求读取当前角色，动作同时要求can_view，事务重新校验进入权限与版本。 |
| native/web.py：context、domain_error | 标准导航输出锁状态，保留自定义导航范围限制；401/403返回明确代码或工作区错误页。 |
| native-accounts.js：refresh、batch、depend | 分类搜索、权限依赖、变更摘要、修订感知撤销；只改表单草稿，保存失败保持状态。 |
| native-access.js：showAccessNotice、adminFetch | 原生dialog焦点与减少动画支持；同源后台401/403统一说明；不重写全局fetch，不重试写请求。 |
| native-http.js及已有fetch辅助入口 | 显式复用adminFetch，原业务超时、取消和失败处理继续生效。 |
| native-permissions.html、native-permissions.css、native-access-error.html | 分组权限配置、入口强调、受限导航和直接访问错误展示。 |

## 翻译分组与统一复用

| 文件或函数 | 职责 |
| --- | --- |
| native/translation_index.py：format_sql、stored_format、identity | 从原生来源数组确定格式，以完整文本/语言/格式和摘要建立相同原文条件；旧可变格式正文独立处理。 |
| native/translation_index.py：source_match、source_scope | 使用字段白名单构造原生来源关联、可见范围及实时公开有效性条件，在SQL分页或供稿选择前过滤。 |
| native/translation_groups.py：predicate、cte、listing、categories | 组合固定条件、局部筛选、多分类和来源权限；数据库先分组再分页，仅读取有界预览。 |
| native/translation_groups.py：sources、anchor、members、url | 批量取得可读来源名称、校验组标识仍在范围内、分页查看全部来源/历史版本并保留筛选链接。 |
| native/translation_groups.py：choose、export | 只向明确选定的待译来源填入已核对版本；按相同权限/筛选导出全部或所选组，限制条数和字节。 |
| native/translation_reuse.py：candidates、donor、try_reuse、apply | 新建、单条和批次共用精确复用；人工版本优先及冲突拒绝；事务检查两端来源/译文/媒体、权限及批次状态。 |
| native/assistance.py：reuse_queued、queue、translate | 新队列记录格式并尝试无网络复用；联网租约内再次核对，当前成功结果不重复调用；晚到人工版本阻止自动提交。 |
| native/translation_batch.py：donor、activate、reconcile、run | 调用统一复用，扫描格式变化并保留历史，沿用既有领取、暂停、重试及完成计数。 |
| native/translation_group_admin.py：install、detail、choose | 提供来源核对页面/分页片段与明确选用POST，复核会话、CSRF、固定导航及版本。 |
| admin/native-translation-cell.html、native-translation-group*.html | 来源摘要、格式/状态/人工差异与逐记录原文/译文核对界面；文字转义，不执行正文HTML。 |
| admin/static/js/native-translation-groups.js：setupTranslationGroups、read、paint | 导出所选组、分页保留已选译文、丢弃晚到分页、明确提交与错误反馈；写操作不自动重试。 |
| admin/static/css/native-translation-groups.css | 分组摘要、来源分类、原文对照及手机版本核对布局。 |

## 多原文合批翻译

| 文件与函数 | 职责 |
| --- | --- |
| translation_packets.envelope / fits / pack / build / unpack | 生成随机编号边界；按通道字节/字符/条数/请求体限制装箱；原生数组与单文本请求封装；完整响应数量与边界校验。 |
| translation_multi.execute_many / deliver / complete | 语言与格式分组、共享片段去重、串行HTTP、失败包二分、完整文档回调；请求次数和总时限有界，超时显式待确认。 |
| translation_service.TranslationService.execute_many | 共享多文档入口，保留既有单条执行协议。 |
| translation_service.TranslationDocument | 安全文本节点分段与重建；单条和合批分别限制片段数。 |
| translation_packed_batch.statistics | 在原生缓存SQL中统计当前任务来源、独立原文、送译原文，完整文本与语言/格式一起分组。 |
| translation_packed_batch.PackedBatch.current / valid / eligible | 核对领取及缓存/来源快照，排除已变更、无权、停用和人工英文。 |
| PackedBatch.before / after | HTTP前记录有限请求意图、版本和尝试数，响应后保存已确认/待确认请求计数。 |
| PackedBatch.finish / recover / run | 完整来源结果和任务计数原子提交；恢复未知请求而不自动重发；先复用再收集最多12来源并分发去重结果。 |
| assistance.Assistance.result_statements | 抽取单条及合批共用的译文提交语句，复用来源、媒体、人工版本、权限、任务和网络租约保护。 |
| translation_batch.TranslationBatch | 原生v1任务兼容读，新任务增加有界合批元数据；扫描、明确重试和恢复共用原有动作接口。 |
| native-translation-batch.js / native-translation-batch.html | 展示原文/请求指标、旧任务说明和恢复状态；维持串行页面推进、暂停、刷新和移动端布局。 |
