# Cloudflare 网页部署与验收教程

基于网站 v0.15.119，部署补丁 `cloudflare-startup-step4`。只修改 deploy 内文件；根目录版本、业务源码及数据库结构不变。

## 2026-09-30 构建 SQLite 修复（第一步）

针对 Cloudflare 构建机 Python 缺少 `_sqlite3` 的报错，正常 `build.py bundle/deploy` 不再导入 SQLite 相关模块：直接复制唯一的 `database/schema.sql`，默认不生成旧版 `migration-plan.json`。构建变量和构建/部署命令保持不变，不需要安装 sqlite3 或更换 Python 来绕过此错误。

旧迁移计划作为可选开发功能保留：手动执行 `deploy/cloudflare/prepare.py` 时添加 `--migration-plan`，并使用带 SQLite 的 Python；不支持 SQLite 时给出明确提示且不会创建输出目录。共享 helper 的原默认行为保留，原调用方也可传 `--no-migration-plan`；网页部署入口默认关闭它。

第一步仅处理打包依赖；第二步现已加入以下 D1 初始化检查。第三步现已加入 R2 读写探针；第四步已补齐默认地址生成和自定义域名切换，见 [DOMAINS.md](DOMAINS.md)。

## 2026-09-30 D1 自动初始化（第二步）

`build.py deploy` 在打包成功、正式发布前，使用锁定的 Wrangler 检查远程 D1。默认 `TEACHER_D1_INIT=auto`：没有业务表时导入唯一的 `database/schema.sql`，随后复查；已有表时只核对结构，不重复导入、不更新记录、不重建管理员。可选 `TEACHER_D1_INIT=check` 只检查，空库也会停止。两种模式均不自动修复、清空或迁移已有库。

预期结构由 Wrangler 的本地 D1 在可清理的临时目录中执行同一份 SQL 得到，不依赖 Python `sqlite3`。检查所有应用表、显式索引及其 SQL 定义（含字段、约束、默认值）；忽略 SQLite/Cloudflare 内部对象和 `d1_migrations`。检查采用保守比较，格式空白和注释不影响比较，但不同的等价 DDL 写法仍可能报差异，需人工核对。额外业务表也会停止，避免误用其他项目的数据库。

日志依次包含 `D1-REFERENCE`、`D1-CHECK`、首次空库的 `D1-INIT`、`D1-READY`。初始化或检查失败时不发布；数据库不存在或无权限时不会被当成空库。构建令牌需要目标账号的 **D1 Edit（编辑）权限**，请在 Cloudflare 构建令牌权限中补齐，不把令牌写入代码。并发首次部署应避免；失败后先检查实际库状态再重试，不自动删除半成品表。

## 2026-09-30 R2 读写检查（第三步）

无需新增构建变量。`deploy` 在发布及远程 D1 初始化之前，读取生成配置中的真实 MEDIA/CACHE 绑定、桶名、对象前缀，分别进行小型二进制对象写入、读取比对和删除。共用桶默认分别测试 `media/` 和 `cache/`，独立缓存桶也会单独测试；同桶两个前缀禁止重叠。`bundle` 只访问临时本地 R2，不连接远程桶。所有本地检查目录随构建结束清理。

日志为 `R2-CHECK` → 每个前缀的 `R2-TARGET`、`R2-PUT`、`R2-GET`、`R2-DELETE`、`R2-OK` → `R2-READY`。测试对象形如 `media/.deploy-probe/<随机ID>.bin` 或 `cache/.deploy-probe/<随机ID>.bin`，约 300 字节。只删除本次的完整随机对象键，不扫描、批量删除或修改已有媒体。读写失败也尝试删除；删除失败会阻止发布并输出 `R2-CLEANUP-FAILED` 和确切路径，需在控制台检查该对象。构建被强制终止时无法保证清理，应按先前 `R2-TARGET` 日志检查；不设置桶级清理规则。

Cloudflare 构建令牌需有目标账号/资源适用的 **Workers R2 Storage 编辑权限**，以使用 Wrangler 管理对象；运行时的桶绑定与构建令牌权限是两回事。不要把访问令牌或 S3 密钥写入源码。检查验证的是构建凭据对指定桶的读写及删除能力，不能替代部署后通过网站上传/预览的业务验收。参考：[Cloudflare Wrangler R2 命令](https://developers.cloudflare.com/workers/wrangler/commands/r2/)。

R2 使用对象键前缀，不需要 `mkdir` 或 `chmod`，也无需开放桶的公开访问。测试不创建新桶、不修改 CORS/公开访问/生命周期设置、不新增业务路由。

## 当前完成范围

已提供锁定打包、发布入口、D1/R2 的 Python/JavaScript 边界适配，以及一次性管理员初始化页面。运行包装层复用原主站 app、模板、认证和存储方法。**代码与针对性测试已完成，尚未完成整站 Workers 运行验收。** 已接入同站快传、房间协调与定时清理；第五步补齐发布前完整性检查、部署后 GET 检查脚本和验收记录。

建议现在使用独立测试 Worker。真实发布需你自己的 Cloudflare 账号权限，交付过程没有推送 GitHub、发布 Worker 或执行远程 SQL。

## Cloudflare 网页填写

先将完整项目源码上传到 GitHub 的 web-py 分支，保留根目录 backend、frontend、database、deploy 等目录。不要只上传 deploy，也不要仅上传 ZIP。

进入 Workers & Pages，连接 `biao169/web-teacher` 仓库，设置：

| 项目 | 值 |
| --- | --- |
| Production branch | web-py |
| Root directory | deploy/cloudflare |
| Build command | python build.py check |
| Deploy command | python build.py deploy |
| Preview builds | 初期关闭 |
| Build variable: SKIP_DEPENDENCY_INSTALL | 1 |
| Build variable: PYTHON_VERSION | 3.13.15 |
| Build variable: NODE_VERSION | 22 |

**SKIP_DEPENDENCY_INSTALL 必须在 Settings → Build / Builds → Build Variables and Secrets 中设置。** 否则平台仍可能在运行本脚本之前自动执行 pip install .，出现 Multiple top-level packages 错误。运行时变量无法代替此构建变量。

上述 Build command 只做基础预检。Deploy command 在同一次进程中准备依赖、生成临时源码、执行 dry-run，成功后发布并清理；不依赖两个命令之间保留临时文件。

继续添加以下**构建变量**：

| 名称 | 填写说明 |
| --- | --- |
| TEACHER_WORKER_NAME | 控制台目标 Worker 的实际名称，如 teacher-site；必须与实际项目一致 |
| TEACHER_ORIGIN | 可选的实际 HTTPS 主地址；设置时优先使用。留空则从下面自定义域名或账号子域名生成 |
| TEACHER_WORKERS_SUBDOMAIN | 未设主地址/自定义域名时填写账号的 workers.dev 子域名，自动组合 Worker 默认地址 |
| TEACHER_CUSTOM_DOMAIN | 可选，仅域名；生成 Custom Domain 绑定；主地址留空时自动使用该域名 |
| TEACHER_WORKERS_DEV | 可选，默认 true；自定义域名上线后可设 false 关闭默认入口 |
| TEACHER_D1_ID | 已创建 D1 数据库的 UUID |
| TEACHER_D1_NAME | 该 D1 数据库的名称 |
| TEACHER_D1_INIT | 可选，默认 auto；空库初始化，已有库只检查。check 表示只检查 |
| TEACHER_MEDIA_BUCKET | 已创建 R2 媒体桶的名称 |
| TEACHER_CACHE_BUCKET | 可选。单独缓存桶的名称；留空时与媒体共用桶，使用不同对象前缀 |
| TEACHER_BUILD_BRANCH | 可选，默认 web-py。更换分支时同时修改网页 Production branch |

构建脚本把域名与资源选择转换成实际 Wrangler 配置；生成 DB、MEDIA、可选 CACHE、ASSETS 绑定。并自动配置 TRANSFER_COORDINATOR（Durable Object）及每分钟 Cron。配置不包含管理员密码、API 密钥。第三方 API 密钥等在目标 Worker 的运行时 Secrets 配置，不提交仓库。Cloudflare Builds 的发布凭据使用其平台授权方式，不在文件中硬编码。

域名具体填写、切换与回退步骤见 [DOMAINS.md](DOMAINS.md)。更改域名或资源应修改以上构建变量并重新部署，不要只修改某个临时文件。仓库分支由网页选择，脚本会核对 WORKERS_CI_BRANCH 并记录提交 SHA，不执行 git checkout。

## 命令用途

从 deploy/cloudflare 目录运行（项目根目录则在命令前补 deploy/cloudflare/）：

```bash
python build.py check
python build.py prepare
python build.py bundle
python build.py deploy
```

| 命令 | 行为 |
| --- | --- |
| check | 检查源码、Python、应用依赖声明和 CI 分支，不下载、不发布 |
| prepare | 保留第一步的应用依赖与导入检查，不生成部署产物；它不是完整的锁定发布流程 |
| bundle | 完整锁定工具链和 WebAssembly 依赖，生成临时产物，执行 Wrangler deploy --dry-run；不发布、不执行远程 SQL |
| deploy | 打包后先检查远程 R2，再检查 D1，默认初始化空库；结构通过后发布，需要账号及 D1 权限 |

需要只做云端打包检查时，可将 Deploy command 临时填为 `python build.py bundle`，但其成功仅代表打包成功，不代表上线。要实际发布必须改回 deploy。

脚本不会创建 D1 资源或清空数据库；请先在控制台创建 D1。默认部署会初始化空库，后续部署仅检查结构，不重复导入 SQL、不重建管理员。

## 首次安装：D1 与管理员（网页操作）

1. 在 Cloudflare 创建 D1 数据库和 R2 桶，把真实名称、ID 填入上面的构建变量。
2. 确保构建令牌有 D1 Edit 权限，保留默认 `TEACHER_D1_INIT=auto`（无需新增此变量）。执行部署时会自动初始化空 D1，无需在 Console 手动粘贴 SQL。已有完整数据库只做结构检查。
3. 完成 Worker 发布。在 Worker 的 Settings → Variables and Secrets 中新增 **Secret** `TEACHER_SETUP_TOKEN`，保存并部署。使用密码管理器生成独立随机密钥，建议 64 位随机十六进制字符；接受长度 32–256。它是临时初始化凭据，不是管理员密码，不要放入仓库、普通变量、链接或日志。
4. 访问 `https://你的域名/setup`，输入此密钥、管理员账号及两次密码。访问域名必须与构建变量 `TEACHER_ORIGIN` 一致。
5. 成功后访问 `/auth/login` 登录，并在 Cloudflare 删除 `TEACHER_SETUP_TOKEN`、保存部署。已有用户或初始化完成标记时，`/setup` 自动返回 404，不允许重复初始化。

未配置有效密钥时入口关闭；缺少数据库表时显示 503 和导入提示；来源域名不匹配或密钥错误时返回 403。失败页面不回显密钥和密码。创建过程调用现有 `Auth.bootstrap`，账号、角色、权限、初始设置及完成标记在原有事务中写入，保留原密码哈希格式。

R2 不需要手动创建目录。媒体仍通过现有上传与读取方法访问绑定桶，修正空对象返回值以及 D1 参数、批量数组和嵌套空字段的跨语言转换；不会复制数据库或媒体到 Worker 本地磁盘。

## 同站文件快传（第四步）

部署后使用同一域名下的 `/transfer/` 和 `/admin/transfer`，不再单独部署 transfer Worker、数据库、端口或登录桥。主站登录会话和当前角色权限直接生效，旧 `ft_session` 不赋予权限。首次访问只补齐缺失的原快传设置，不覆盖已有设置或表。

| 资源 | 用途与范围 |
| --- | --- |
| 原 DB / D1 | 共用原表：任务、检查点、配额、六位接收码、清理状态 |
| 原 MEDIA / R2 | `transfer/media/` 保存离线分块；与主站 `media/` 隔离 |
| CACHE（未独立配置时使用 MEDIA） | `transfer/cache/` 保存快传辅助缓存，与主站 `cache/` 隔离 |
| TRANSFER_COORDINATOR | 一个固定命名的 Durable Object，协调所有在线房间及码查询 |
| Cron | 每分钟触发；按后台自动清理开关和间隔决定是否工作 |

构建命令自动生成 Durable Object 绑定、固定 `teacher-transfer-v1` 注册标记和 Cron 配置。它不是业务数据库迁移，不改现有 D1 表。保留此标记与协调器名称，后续普通更新不要随意改名或删除。首次部署需账号允许创建对应资源。

1. 进入教师后台“文件快传”，按需开启临时分享、局域网直连和在线中转，并设置身份规则、单文件限制、日/周/月额度、缓存容量与保存小时数。
2. 同时在线：局域网模式仍由浏览器 WebRTC 直接传文件，Worker 只协调；广域网在线模式使用原 1 MiB 分块及接收确认协议，中转数据不会写入 R2。
3. 不同时在线：使用临时分享，分块存入 R2，D1 保存上传及接收检查点。复用前两位字母、后四位数字的接收码，以及文件夹清单和浏览器目录保存功能。
4. 后台“存储状态”显示 R2 缓存预留量和清理结果；R2 没有本机磁盘空闲量，原“磁盘安全余量”不参与 R2 容量判断。后台的缓存总容量与账号配额继续由数据库事务检查。
5. Cron 每轮只推进一个任务、最多 8 个已登记分块，并最多扫描删除 8 个该任务前缀下的遗留对象；有剩余工作下一分钟继续。失败保留检查点并在 Cron 中报告失败，不提前标记删除完成。关闭自动清理后，人工清理仍可使用。

清理使用现有 service_meta 中的跨实例租约，并清除有界数量的过期接收码、重放记录及批处理游标。不自动清空历史任务和用量账本，也不清理主站媒体目录；后台人工缓存清理入口保持原样。

### 传输边界

- 原在线房间依赖进程内存，现统一路由到同一 Durable Object，防止两端命中不同实例。此版本采用单协调器以复用既有协议，适合教师站规模，并非无限横向扩容。
- 在线中转默认最多 4 个房间，每个只保留一个不超过 1 MiB 的待确认分块；批量文件 I/O 同时最多 2 路。目录元数据仍有原 8 MiB 总预算。这些是数据缓冲限制，不是整个 Python 运行时的总内存上限。
- 在线房间不做持久化；部署、实例回收或超时后需要重新配对。六位码检查实例标记，旧在线码会失败，不会错误连接到其他房间。离线任务仍由 D1/R2 保存。
- 不承诺任何平台上的“无限文件大小”：仍受后台规则、浏览器、Cloudflare 请求/CPU/内存/配额和账单限制；协议不会一次把整个文件读入内存。
- 局域网直连无法由服务器核实文件字节，启用硬流量配额时沿用现有策略拒绝直连，避免绕过配额。匿名权限同样沿用原规则，未主动放开匿名缓存上传。
- 不要将包含快传私有分块的 R2 桶通过公开域名或 r2.dev 直接公开，否则可能绕过应用下载控制。

### Cloudflare 网页验收

完成主站初始化后，在实际测试域名确认：

1. `/transfer/` 中英文、主站登录和 `/admin/transfer` 嵌入管理界面正常。
2. 两个独立浏览器通过六位码进行在线中转，校验接收文件一致；测试局域网直连及文件夹保存。
3. 上传离线缓存后关闭发送端，另一浏览器通过接收码下载；重启/部署后仍可访问有效缓存。
4. 修改角色权限、缓存容量和流量限额，核对越权及超额请求被拒绝。
5. Worker 的 Cron 执行记录中查看成功/失败；等待测试任务过期，确认仅快传对象被删除。关闭自动清理后确认不自动删除。

完整 Python Workers、真实 Durable Object 双端请求及云端 R2/D1 联调仍需上述验收；本地 HTTP 模拟不能替代它。

## 为什么临时使用 src

实际测试发现，入口放在临时项目根目录时，Wrangler 默认收集规则会把 .venv、.venv-workers、node_modules 下的部分文件也打进 Worker。测试包压缩上传量约 12.2 MiB。

本版只在系统临时目录中创建 src，把原 backend 代码、main.py 和 generated_resources.py 放入其中；Wrangler 入口指向 src/main.py。额外将 deploy/cloudflare/runtime 放入临时 src/worker_runtime，并让生成的 main.py 指向包装入口；原业务包名与导入保持原样，业务 Python 文件逐字节校验。工具、静态 assets、数据库初始化 SQL 均在 src 外。第二步测试压缩上传量约 2.77 MiB，338 个静态资源独立处理；第三步增加少量运行适配文件。

运行结束（包括异常和普通中断）会删除临时源码、虚拟环境和产物；强制杀死进程由构建环境回收。工具的下载缓存可由构建环境管理。项目目录不生成 src、.worker、node_modules 或虚拟环境，不维护第二套业务代码。

## 锁定与兼容性

- 构建工具：uv 0.12.18、workers-py 1.17.4、workers-runtime-sdk 1.9.1、Wrangler 4.143.0。
- uv.lock：锁定普通 Python 构建环境的完整依赖。
- pylock.toml：锁定 Workers/Pyodide 运行依赖的版本、下载来源及哈希。
- package-lock.json：锁定 Wrangler 及 Node 工具依赖。
- pyproject.toml 声明应用模式，不构建项目 wheel；不执行根目录 pip install .。
- 沿用兼容日期 2026-09-14。该工具链会选择 Workers Python 3.14/Pyodide 3.14.2；构建机 Python 3.13.15 与 Worker 运行版本不是一回事。
- 运行依赖同步完成后核对 pylock 包信息，发生变化则阻止发布。后续升级工具链时应重新验证所有锁文件，不能自动忽略检查。

应用依赖由现有清单维护，本版未改变根项目或 VPS 的依赖。锁定依赖下载保持 TLS 校验；本轮不改变 Windows/VPS 的 pip 源策略。

## 第五步新增：部署后快速检查

部署前脚本会额外核对 Python 入口导出、Durable Object 注册、Cron、动态路由优先级、快传源码与静态文件完整性；发现缺失或将脚本/数据库混入静态资源时停止发布。

浏览器操作仍是主流程，可选在有 Python 的电脑上执行：

```bash
python deploy/cloudflare/smoke.py --origin https://你的实际域名
```

该脚本仅发送 GET，不接收账号密码，不执行 Cloudflare 管理 API；网站首次访问快传时可能按原逻辑补齐默认设置。检查首页中英文、登录入口、快传入口、CSS/JS、robots、站点地图和未登录媒体访问边界，输出每项状态及耗时；全部通过退出码为 0，失败为 1，参数错误为 2。不输出响应正文或 Cookie。遇到跨域重定向直接判失败，请先核对域名配置。

返回成功只代表这些公开访问检查通过；管理员写入、真实文件往返、目录保存、浏览器 WebRTC 与 Cron 删除必须按验收表另测。

### 更新与故障排查顺序

- 更新同一分支：提交完整源码中的变动文件，由 Builds 重新执行；保留既有 D1/R2 和初始化 Secret 以外的业务 Secrets，不重导初始化 SQL、不重建管理员。
- 切换域名：修改 TEACHER_ORIGIN 构建变量，配置对应域名后重新部署；原域名 Cookie 不跨域继承，重新登录。
- `pip install .` 失败：检查构建根目录和构建变量 SKIP_DEPENDENCY_INSTALL=1；这发生在运行本脚本之前。
- 页面缺表错误：仅在空数据库初始化 `database/schema.sql`。不要通过重置已有数据库来掩盖资源绑定填错的问题。
- `/setup` 404：先核对是否已存在管理员；只有新站才需要临时开启初始化 Secret。
- `/transfer/` 或码配对失败：检查 TRANSFER_COORDINATOR 绑定、注册记录及部署版本；部署前创建的在线房间需重新配对。
- 缓存未自动删除：检查 Cron 调用记录、后台自动清理开关/间隔、任务到期时间、清理状态和 R2 权限。
- Python workerd 无法解析下载域名：这是运行组件尚未加载，不代表应用 HTTP 验收通过；检查测试网络 DNS/TLS 后再运行，不能关闭证书校验规避。

## 保留的手动准备方式

现有调用保持兼容。新增 --output 可指定一个尚不存在、位于源码目录之外的目录：

```bash
python deploy/cloudflare/prepare.py --output /tmp/teacher-worker-manual --database-id YOUR-D1-UUID --database-name teacher-site --origin https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev --bucket teacher-media
```

这仅生成资源，不同步完整工具链，不发布，不执行 SQL。已有目标目录会被拒绝，避免覆盖文件。未提供 --output 的历史调用仍生成项目内 .worker；新网页部署入口始终使用外部临时目录，不走历史默认输出方式。

## 验证与排错

在项目根目录、已安装应用依赖与 pytest 的环境执行 `python -B -m pytest deploy/cloudflare/tests -q`。FFI 检查使用 `tests/ffi_probe.py`，需从含 src 的临时产物目录用 Pyodide Python 执行，普通 CPython 无法代替。

- 仍出现 pip install .：检查 SKIP_DEPENDENCY_INSTALL 是否放在构建变量、是否保存、日志是否来自新构建。
- Branch mismatch：核对网页生产分支和 TEACHER_BUILD_BRANCH。
- Missing build variable：按上表补齐；不要把示例值当作实际资源。
- Python/Node 版本不符：设置网页构建版本，重新构建。
- Runtime lock drift：停止发布并重新核查依赖，不能直接删除锁文件规避。
- 发布成功后页面报错：先检查 D1 表是否导入、资源绑定和实际域名，再看 Worker 运行日志；不能由 dry-run 结果推断页面正常。

验证范围（详细证据和限制见 [ACCEPTANCE.md](ACCEPTANCE.md)）：

- 本轮完整 bundle 的依赖同步、锁核对、Wrangler dry-run 和临时目录清理通过；原业务 Python 文件逐字节一致。

- 71 项部署、初始化、主站、媒体与快传 HTTP/路由测试通过，覆盖管理员创建、登录、管理页面、中英文公开页面、重复初始化阻止、事务回滚和错误提示。新增快传测试覆盖码配对、在线块确认、文件夹、实时权限、清理租约和失败检查点。HTTP 测试使用可丢弃的本地 SQLite 和存储替身。
- 实际 Pyodide FFI 检查通过：D1 参数空值/布尔值/数组/嵌套结果，以及 R2 缺失对象、二进制往返、大小限制和删除。同时验证 SDK 绑定包装解包及 R2 按任务前缀分批清理、正式媒体隔离。绑定服务使用 JavaScript 测试替身，不代表云端 D1/R2 已验收。
- 本地 JavaScript workerd 的真实 D1/R2 绑定验收通过：原始 127 条 SQL、事务回滚、JSON/空值、R2 范围读取及前缀隔离；此结果不能代替 Python Worker 整站运行。
- 实际 Pyodide 验证原有 600000 次 PBKDF2 的结果；独立 JavaScript Workerd 探针也确认该 Web Crypto 参数可执行。
- 本地 Python Workers 启动因当前测试环境无法解析 `pyodide-capnp-bin.edgeworker.net` 而受阻。未完成完整 Python Workerd 请求链、真实线上 D1/R2 业务或 Windows 实机验收；没有发布至用户账号。

第五步的代码、教程和本地可执行验收已完成。真实云端验收未完成：请按 [ACCEPTANCE.md](ACCEPTANCE.md) 在独立测试 Worker 验证，确认后再用于生产。全部文件改动见 [CHANGES.md](CHANGES.md)。

官方参考：
- https://developers.cloudflare.com/workers/ci-cd/builds/build-image/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- https://developers.cloudflare.com/workers/languages/python/packages/

- https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/
- https://developers.cloudflare.com/durable-objects/get-started/

## D1 导入返回结果兼容修复

如果在 D1-INIT 后提示 Invalid D1 JSON response，原脚本没有展示原始输出，不能据此断定 SQL 失败。新补丁对 --file 导入使用进程退出码判断命令结果，退出码非零仍停止；随后必须重新查询远程 sqlite_schema 并完整核对预期结构，只有通过才发布。--command 查询仍严格验证 JSON 和 success，权限错误或无效响应不会被当作空库。

无需清空数据库。重试时若已有完整结构，仅检查后继续；如果缺少部分对象则停止并列出差异，不自动重置。构建变量和部署命令不变。

## Worker 启动随机数修复（第一步）

入口模块不再在顶层安装快传应用。首次 HTTP 请求才创建完整应用，使用原有安全随机数；成功后缓存，同一协调器实例复用独立应用，初始化失败则不发布半成品引用。构造过程不 await，避免同一事件循环中交错安装路由。Cron 在事件内导入自身依赖，不创建 HTTP 应用。

此次仅修改 deploy 包装入口及测试/说明，业务源码、数据库、D1/R2/域名变量不变。首次请求承担应用创建成本；完整 Workers 云端启动和双端联调仍需发布验证。本次不代表已完成其他启动副作用的全量排查。

## 实例复用与失败重试（第二步）

沿用第一步已实现的同步构建、完整成功后缓存和协调器实例隔离，不再叠加初始化锁或重复安装逻辑。新增真实 FastAPI/快传路由测试，通过延迟入口连续执行 LAN/relay 六位码签发、重复签发、解析、撤销，以及中继分块确认流程；实际安装完路由后注入失败，再次构建时验证使用新应用且只含一个快传 Mount。

本地验收使用 SQLite、文件存储和 Workers SDK 替身，真实业务服务与路由保持原实现。此结果不代表云端已发布或真实多客户端网络已验收。仅更新 deploy 的补丁标识、测试和说明文件；部署配置不变，D1/R2 不需重置。

## 启动路径副作用排查（第三步）

构建预检新增 STARTUP-CHECK：在独立 Python 子进程中导入实际 runtime/entrypoint.py 和其项目启动依赖。当前启动图仅含轻量入口、routing 和标准库；backend、transfer、模板资源和数据库模块都延迟到事件中。检查拒绝启动时提前导入这些业务模块，并阻止常见安全随机数、时间读取、文件写入、socket 连接/绑定、子进程及 SQLite 操作。命中时提前停止构建。

检查脚本仅运行在构建机，不被复制到 Worker runtime，不替换生产环境的随机数/时间函数，不影响正常请求和 Cron。SDK 使用最小替身，不模拟 Cloudflare 快照或完整第三方 SDK；这是项目导入路径回归检查，并非对任意动态代码的通用安全沙箱。真正的云端启动验证仍必须执行。构建命令和变量不变。

## 启动修复第四步：最终验收

新增 [STARTUP-ACCEPTANCE.md](STARTUP-ACCEPTANCE.md)，记录当前公开站点 Hello world 响应、活动部署核对及双端验收步骤。smoke.py 新增 --repeat-startup 重复访问模式，并提示默认 Hello world 响应。新增首次 HTTP 请求到真实登录表单的本地端到端测试。公开 GET 检查和本地测试不替代云端发布或真实双端验收。
