# 部署、数据与维护

适用 v0.16.127；与 [功能手册](README.md)、[源码索引](SOURCE.md) 配套。本轮不执行部署、数据库恢复、缓存清理或生产测试。以下为当前程序入口和操作方法，具体配置以现有站点和源码校验结果为准。

## 1. 平台和目录

| 平台 | 程序入口 | 数据/媒体 | 服务形态 |
| --- | --- | --- | --- |
| Windows 本地 | deploy/windows/start.cmd、deploy/windows/start-existing.cmd；deploy/shared/launcher.py | SQLite 与配置的本地目录 | 主站和 /transfer/ 单服务，共用登录与主数据库 |
| Ubuntu/Debian | install.sh、start.sh；deploy/linux/tweb.py | SQLite、本地媒体、快传存储；安装配置在受管目录 | systemd 单服务，内部监听 127.0.0.1；反向代理提供 HTTPS |
| Cloudflare | deploy/cloudflare/build.py；runtime/entrypoint.py、admin_entrypoint.py | D1、R2 与既有私有绑定 | Default 路由 + PublicPage/PublicData 可缓存 entrypoint；Admin、Native、可选 Sync Executor 为现有辅助组件 |

backend/app/config.py 的 Settings.from_env 统一加载配置；显式环境覆盖 TOML。默认开发数据根为 data；媒体、数据库和可清理缓存不能相互覆盖。transfer_database_path 保存旧独立工具配置/迁移来源，当前本地集成快传实际使用主站数据库；不要据此启动第二个独立服务。

| 目录 | 职责 | 更新时处理 |
| --- | --- | --- |
| backend/ | 主站入口、原生业务、权限、存储适配、维护 | 源码 |
| frontend/public、admin、shared | 公共页/后台/共用模板、JS、CSS、内置第三方资源 | 源码；不要为了删文档删除 PDF 字库或许可证 |
| database/schema.sql、native/ | 原生 DDL、字段及编辑契约 | 使用现有升级器，不手改现有数据库 |
| site_sync/ | 两站同步引擎、后台、协议及平台适配 | 源码；任务/密钥/断点存于各自运行存储 |
| transfer/ | 文件快传适配和界面 | 源码；临时文件为独立运行数据 |
| deploy/ 与根 shell | 平台部署、启动、打包、管理 | 源码 |
| tests/ 等测试目录 | 自动化回归程序及合成夹具 | 本轮保留 |
| docs/ | 三份当前文档与原样 reference | 本轮合并历史说明，不改变运行逻辑 |
| data/、transfer-data/及外部配置路径 | 数据库、媒体、快传文件、缓存、日志 | 不随普通源码更新删除，不打包用户运行数据 |

## 2. Windows 启动

需要 Python 3.12+，初次准备依赖需要联网。项目根目录解压后调用：

```bat
deploy\windows\start-existing.cmd
```

保留当前开发数据。deploy/windows/start.cmd 按新站重建专用开发数据库，不能用于保留生产数据。复制 deploy/windows/local.example.cmd 为 local.cmd，按模板设置 TEACHER_PYTHON、TEACHER_VENV、TEACHER_DEV_ROOT、TEACHER_PORT（默认8003）等；私有 local.cmd 不进入发布包。开发密码只用于测试账号，启动日志不输出密码。

常见入口：基础示例 add-demo-data.cmd（位于 deploy/windows），成套示例后台显式添加；测试入口见本手册验证章节。共享 launcher 的 configure/initialize/serve/main 分别解析配置、初始化空库、启动唯一服务和派发模式；fresh/rebuild/reset 都是明确重建动作，不当作普通启动。

## 3. Ubuntu/Debian 安装和维护

运行 systemd、Python 3.12+ 和 venv。将 teacher-site 目录内容放到仓库根，保留 install.sh、pyproject.toml、backend、deploy、release-manifest.json 等，再从已审核来源安装。例如在本机解压目录：

```bash
sudo bash install.sh --domain teacher.example.org --port 8003 --python /usr/bin/python3.12
```

解释器必须可被服务账号访问；--repo/--branch 选择来源，--pip-source tuna|pypi 选择依赖源。内部端口不需要对公网开放，HTTPS 由现有 nginx/Caddy 提供。安装器准备环境、数据库、服务账号和管理员；遇到冲突不杀死其他服务。仅前台运行用 bash start.sh --port 8003；start-transfer.sh 复用同一主站。

安装后 tweb 进入双语菜单；命令行可使用以下入口，实际路径先用 tweb paths 查询。

| 命令 | 用法和边界 | 对应实现 |
| --- | --- | --- |
| tweb status / start / stop / restart | 查询/控制本站 systemd 服务，不碰其他实例 | Manager.active/start/restart；perform |
| tweb logs / doctor / paths / proxy | 日志、只读诊断、实际路径、代理示例 | Manager.doctor/paths/proxy；perform |
| tweb port 9103 | 检查端口并更新本站服务与代理示例；实际代理需自己校验/reload | Manager.configure；check_port、port_available |
| tweb update --scope all | 更新源码、锁定依赖与数据库结构；默认保留记录 | Manager.update |
| tweb update --scope source | 依赖和结构兼容时只替换源码，否则拒绝并提示整站更新 | Manager.update_source |
| tweb update --scope frontend | 只更新模板/CSS/JS；后台/数据库/协议必须兼容 | Manager.update_source |
| tweb update --scope dependencies | 按已安装源码更新依赖，不下载仓库 | Manager.dependencies |
| tweb update --scope database | 现有结构核验/已有升级器，不重建数据 | Manager.database |
| tweb update --scope config | 刷新本站受管服务/代理示例，保留配置与数据路径 | Manager.configure |
| tweb permissions --repair | 检查后显式修复本站受管路径权限 | Manager.permissions |
| tweb domains --allowed-origins https://alias.example.org | 同步本站允许来源；真实代理、DNS、TLS 仍需核对 | site_origins、site_domains、Manager.configure |
| tweb pip-source pypi | 修改本站后续依赖安装来源 | Manager.pip_source |
| tweb db-init / db-update | 初始化空库或升级/核验已识别结构 | Manager.database |
| tweb db-reset | 明确确认 RESET 后重建所有数据库记录；不当备份 | Manager.database |

所有 Manager 函数位于 deploy/linux/tweb.py。更新范围不能替代数据备份；前端局部更新前必须保证后端契约兼容。修复权限、切换端口等失败时以提示和实际状态为准。

多实例使用 install-multi.sh，为每个实例选择独立目录、服务名、命令名和数据路径；通过该实例命令的 paths 核对 /etc、/var/lib、源码和服务路径后操作。不要把单实例默认路径直接应用于其他实例。外部 Nginx/Caddy 示例不会自动覆盖系统其他站点/证书。

删除命令 remove --scope cache|logs|media|transfer|database|source|all 及 uninstall 都要求对应确认词。cache/logs 删除不等于数据库日志或媒体删除；media/transfer 物理删除不自动重写业务引用；database 删除保持停服；source 删除保留数据/管理入口；all 删除全部本站受管对象。先读路径与影响，再执行，不把批量删除作为普通更新步骤。

## 4. 手动配置与 CLI

TEACHER_CONFIG 指向 TOML，例如：

```toml
[storage]
data_dir = "/var/lib/teacher-site"
database_path = "/var/lib/teacher-site/database/site.sqlite3"
media_dir = "/var/lib/teacher-site/media"
cache_dir = "/var/lib/teacher-site/cache"
transfer_media_dir = "/var/lib/teacher-site/transfer-files"
transfer_cache_dir = "/var/lib/teacher-site/transfer-cache"
```

相对路径以配置文件父目录解释；无配置时使用 Settings 默认值。环境变量 TEACHER_DATA_DIR、TEACHER_DATABASE_PATH、TEACHER_MEDIA_DIR、TEACHER_CACHE_DIR、TRANSFER_MEDIA_DIR、TRANSFER_CACHE_DIR 覆盖对应存储项。Worker 绑定/前缀项同样由 Settings 处理，完整字段见源码索引与 Settings.from_env。

| CLI（项目根运行） | 功能 |
| --- | --- |
| python -m backend.cli init | 初始化缺失结构，保留已有记录 |
| python -m backend.cli init-admin --username admin | 交互输入密码创建管理员；不从命令行回显密码 |
| python -m backend.cli doctor | 读取配置并核对当前数据库/路径 |
| python -m backend.cli migrate | 仅现有升级器支持的旧结构升级 |
| python -m backend.cli seed-demo / seed-examples | 显式基础/成套样例；后者需要授权 |
| python -m backend.cli cleanup-preview | 预览维护候选 |
| python -m backend.cli cleanup-run --batches 1 | 有界执行一个或指定数量批次 |
| python -m backend.cli cleanup-status | 查看上次维护状态 |
| python -m backend.cli reset-data | 明确重建配置数据库，媒体物理文件不会随之清空 |

CLI main 是 async 函数，维护脚本需 asyncio.run；不能把 Python 内部接口示例当无权限的外部 RPC。生产环境按服务账号与实际 TEACHER_CONFIG 使用同一配置，不要在错误目录初始化另一份空数据库。

## 5. Cloudflare 构建、发布和诊断

现有 Workers Builds：Root directory deploy/cloudflare；Build command python build.py check；Deploy command python build.py deploy。check 不发布；deploy 会真实发布。Python 版本、Cloudflare Python Worker SDK和依赖按当前项目、锁文件核对；WORKERS_CI 构建需要 SKIP_DEPENDENCY_INSTALL=1，分支需与 TEACHER_BUILD_BRANCH 匹配，不能让平台自动 pip install . 覆盖当前专用构建流程。

| 配置 | 用途 |
| --- | --- |
| CLOUDFLARE_ACCOUNT_ID、TEACHER_WORKER_NAME | 目标账户和站点脚本名 |
| TEACHER_ORIGIN | 主 HTTPS 根地址 |
| TEACHER_D1_ID、TEACHER_D1_NAME | 已有 D1 数据库 |
| TEACHER_MEDIA_BUCKET、TEACHER_CACHE_BUCKET（按现有配置） | 已有媒体/缓存对象存储 |
| TEACHER_ALLOWED_ORIGINS、TEACHER_CUSTOM_DOMAINS | 应用同源允许列表及真实域名绑定，二者含义不同 |
| TEACHER_AUX_API_TOKEN | 构建 Secret，发布现有辅助组件；不要写源码或网页 |
| TEACHER_SYNC_EXECUTOR_MODE=inline 或 separate | 同步推进在主站或已有独立执行器；不是新缓存 Worker |
| TEACHER_SETUP_TOKEN | 首次建立管理员用临时运行时 Secret，不是同步密钥 |

具体必填、名称格式及首次部署阶段依 deploy_config.py、pipeline.settings、build.preflight 为准。旧包中的“固定两个/三个 Worker”描述已经失效：当前包含 Admin/Native 等辅助服务；PublicPage/PublicData 是主 Worker 的 entrypoint，不是两个新增 Worker。实际拓扑由 site_workers、辅助构建和执行器模式生成。

| 命令（deploy/cloudflare 目录） | 是否发布 | 用途 |
| --- | --- | --- |
| python build.py check | 否 | 版本、锁文件、源码和构建环境检查；--deployment-config 加配置校验 |
| python build.py prepare | 否 | 临时环境安装锁定应用依赖并核验导入 |
| python build.py bundle | 否 | 当前管线打包预演，不是上线 |
| python build.py verify-companions / verify-native | 否 | 核对辅助产物与绑定 |
| python build.py cloud-check | 否 | 带实际授权只读核对线上版本、绑定、调度；可能有未验证项目 |
| python build.py deploy | 是 | 发布站点和既有辅助组件 |

D1 新站初始化、管理员创建和 Secrets 跟随当前 Cloudflare README 与构建配置；已有数据先保存平台备份，不复制本地 SQLite 文件替代 D1 恢复。重发部署命令不是授权删除 D1/R2/DO。构建通过不能证明 CPU、内存、跨 PoP 缓存传播或1101/1102恢复一定通过；本轮没有真实云端测试。

## 6. 当前 Public Cache：只说明，不更改

统一策略入口 backend/app/public_performance.py；HTTP 成功边界 backend/app/native/public_http_cache.py 与 public_read_api.py；Worker 路由 runtime/routing.py、public_page.py、public_data.py 和 entrypoint.py；部署入口 cache_policy.py、site_workers.py、pipeline.py。

| 内容 | 浏览器 | 边缘响应策略 | 边界 |
| --- | --- | --- | --- |
| 标准匿名公开 HTML | max-age=1800 | max-age=1800, stale-while-revalidate=300, stale-if-error=86400 | 标准列表/首页与确认允许的详情，按 page_request 白名单 |
| 固定导航无 query 基础页 | max-age=60 | max-age=120, stale-while-revalidate=30, stale-if-error=300 | url_name 格式合法、配置为公开有效固定范围，渲染时 verified_navigation 复核 |
| PublicData | max-age=300 | 与标准 HTML 边缘策略相同 | 八模块×zh/en，共16个固定 URL，无访客 query |
| Admin/Auth/session-summary/CSRF/私有接口/写请求 | no-store | no-store，共享缓存关闭 | 真正实时鉴权 |
| 4xx/5xx、未标记成功200、Set-Cookie等 | no-store | no-store | 不产生新的成功共享对象 |

Default Router 缓存关闭，只将确认白名单 GET/HEAD 交给 PublicPage/PublicData。Python 不操作 Cache API、不缓存零散 SQL、自由 query 或无限组合，不新增恢复页、预热或缓存 Cron 巡检。浏览器 fresh 内容可能不访问 Worker；边缘 HIT 可跳过 Python/D1，MISS 仍使用原生成路径。

HTML 新成功对象需200、明确 Render-OK、HTML类型、无 Set-Cookie且安全匿名；数据需200、Data-OK及 JSON 成功结构。合法304验证已有成功表示，不缓存新的错误主体。fixed /n/nav?direction=...&s=... 等含 query 请求不共享缓存，不把它混同无 query 基础页。详情 from 只有白名单标准回链例外，不能概括为所有详情 query 都可缓存。新闻详情含身份相关表单，未进入普通可缓存详情白名单。

Read Model 默认上限500条、512KiB JSON，查询预算40；超限返回明确不可生成状态，浏览器退回服务器路径，不导出截断索引。公开模型只供显示/筛选，禁止principal、session、CSRF、后台字段与项目私有principal/amount/members。HTML MISS 不强制串联多个 Read Model lookup。

### 标签与正常提交

public_cache_tags.py 的 page_tags/data_tags/module_tag/navigation_tag 生成布局、模块、记录、媒体、翻译与固定导航依赖标签；导航 tag 对 url_name 哈希，不由管理员直接提交任意 tag。

公开数据修改在数据库提交之后生成 Plan，由 runtime/public_invalidation.py 的 relay 调用拥有缓存的 PublicPage/PublicData.update_public_cache。普通公开更新 invalidate，保留旧成功对象的过期回退能力；删除/撤回公开、公开媒体/私有字段可见性收紧等按现有 change_plan 安全规则 purge。通知失败不把已提交写入改为需要重写，不扩大全站清理；结果可能显示 accepted/pending。

### 手动模块维护

系统管理员从运行维护区选择“清除异常缓存”；POST /api/admin/public-cache/reset 只接受 module 白名单 home/profiles/students/projects/publications/patents/courses/news/research_interests，并校验服务端权限、同源与 CSRF。系统内部映射 tag，main 根据私有 SITE_ADMIN 响应标记调用既有 Page/Data RPC。首页没有独立 PublicData，data_cache 为 not_applicable；本地 Page/Data 均 not_applicable，不伪称已清 Cloudflare。

实际结果为 accepted/failed/unknown，附 request_id；accepted 只代表平台接受，不承诺所有节点已删除。部分失败/超时记录日志并返回失败，不循环重试、不自动预热。purge 不能删除浏览器已 fresh 副本，也不能修复真实页面生成错误。purge 后仍500先查生成异常，停止反复 purge。

### 故障与 stale 的实际边界

已有成功边缘对象使用现有平台 stale 策略，后续刷新失败时目标是保留并复用旧成功内容；Python 无法在平台1101/1102硬终止后继续执行。没有成功对象、对象被淘汰、TTL/stale窗口已过、不同节点未持有对象或故障发生在平台不能回退的链路上时，不能保证旧页可用。不要承诺 Cache 无限容量或全部1101/1102可被应用捕获。故障期间不主动清空成功缓存，不用巡检制造新请求。

## 7. 身份交接与会话心跳

登录成功携带五字段 authenticated/username/display_name/can_enter_admin/checked_at 的显示身份。TeacherIdentityCache.acceptLogin 验证后更新UI，sessionStorage保存快照；跨标签只用变更标记通知，不存真实权限或会话。目标页的短时一次性交接可跳过紧随登录的重复查询；随后各新公开页进入后后台确认Cookie，失败保留成功显示。

正常快照显示期限约300秒；活动、可见页面按当前public-session调度核验/心跳，隐藏或闲置暂停。服务端会话心跳写入有约120秒节流，过期/撤销会话不能续活。明确authenticated=false纠正UI；错误/超时/abort不能误判退出。服务端对后台、私有项目字段和所有修改操作仍实时鉴权，客户端显示快照不是授权缓存。

## 8. 数据备份与业务恢复

### JSON/CSV/ACMS

后台 /admin/data_tools 选择15类业务表：媒体、教师、站点/全局设置、导航、研究方向、论文、项目、专利、学生/分类、新闻、课程、留言、翻译。JSON用于业务交换并去除相应秘密，CSV只导出一张表供阅读；ACMS用浏览器WebCrypto加密，允许敏感业务配置及可选已登记本地/R2媒体。账号/角色/权限、会话、日志、部署环境与快传临时任务不是该业务备份范围。

JSON格式 academic-cms-python-data-v1；ACMS外层 academic-cms-python-acms-v1，AES-256-GCM/PBKDF2-SHA256，口令15–128字符，不发往服务器或持久化。需要安全上下文；旧非本格式备份不能假定兼容。

恢复：选择文件及表/合并或替换 → 预检错误与计划 → 媒体逐个暂存 → 明确确认 → 服务器复核授权、UID/更新时间及清单 → 原生事务执行。替换模式删除所选表文件中没有的条目，输入“替换所选表”；未选表保留。票据绑定会话/文件/版本且限时，数据变化或权限撤销后需重新预检；不能用过期票据重复执行。恢复不永久清除旧媒体对象。

| 边界 | 当前代码上限 |
| --- | --- |
| 导出 | 20000条，字段4MiB，编码8MiB |
| 在线恢复 | 共500条，记录/媒体清单4MiB，每表900KiB |
| 浏览器备份 | 文件48MiB，解密文档32MiB |
| 随包媒体 | 100对象，原始总24MiB，单文件20MiB |

限制由 data_tools.py、data_restore.py 与 native-data-tools/native-data-crypto 定义；上限不是云平台配额保证。大导出不一定能一次在线恢复；超限缩小范围或用适当数据库维护路径，不自动丢弃尾部记录。

### 本地完整数据库

```bash
python -m backend.maintenance.backup backup --file /safe-backups/site.sqlite3
```

目标必须项目源码外且不存在；使用 SQLite online backup，包含数据库账号/密钥等敏感内容，媒体与快传物理数据另行保存。

恢复需先停止本站服务并确认真实配置数据库在源码目录外：

```bash
python -m backend.maintenance.backup restore --file /safe-backups/site.sqlite3
```

restore(source,target) 验证原生结构后替换配置目标，不迁移未知旧结构，不能拿它恢复运行中的 D1。配置、媒体、快传文件和对象存储也需独立备份；仅复制正在写入的 SQLite 文件不是本工具提供的一致快照。

## 9. 两站同步完整流程

1. 两端部署当前程序，系统管理员进入 /admin/site-sync，生成同一64位十六进制密钥，复制到另一端并分别保存。数据库密钥优先于 TEACHER_SYNC_KEY 环境后备；后台保存下次请求生效，不需要重启，生成/复制本身不保存。
2. 分别填对端完整HTTPS根地址，保存连接与当前授权，再执行连通性测试。权限/模块变化后刷新授权；不要用辅助Worker地址代替网站地址。
3. 手动拉取在目标站选择模块；推送在来源发提案，目标默认审核；接收端明确设置自动确认范围才可自动接收，发送方无权替目标开启。
4. 接收站可保存定时拉取计划；关闭页面后由现有后台机制推进。两端不要同时开启互相覆盖的主从计划，切换主站先停旧接收计划。
5. 监控任务ID、状态、正文/媒体进度、最近/下次时间和有界日志，使用暂停/继续/取消；失败按现有重试和 checkpoint 续行，不重复创建无数任务。

| 选择 | 覆盖/依赖规则 |
| --- | --- |
| 部分业务模块 | 同UID更新/新增；删除以任务和范围明确许可为准，不无条件清空所有未选表 |
| 新闻 | 自动补论文/项目/学生及媒体依赖 |
| 网站设置 | 自动补教师与媒体依赖 |
| 有媒体引用的模块 | 按当前规则补媒体；不是仅复制当前页面的图片 |
| 账号/角色/权限任一 | 三者一起选中并受限整体切换；完成撤销目标旧会话，用来源账号密码登录 |
| 全部恢复内容 | 恢复选定业务及许可删除；不是部署环境或数据库逐字节镜像 |

实际选择表由 site_sync/core/selection.py 的 normalize/selected_tables 定义，当前20项。密码传现有哈希，不传明文。账号恢复要求来源可用系统管理员；授权/数量/版本检查不能跳过。

本站域名、运行环境、同步密钥、连接、任务checkpoint、租约、登录会话、临时分享和物理额外文件不作为同一业务镜像覆盖。媒体需登记且可读取；目标旧物理对象不随应用直接清除。全部暂存后再分批应用；应用期间后台普通写入受门禁409限制，暂停可保留锁，取消解除但不回滚已经应用内容。轻量清单摘要不是跨所有表/媒体的事务快照，来源持续修改会导致重新确认/重新建任务。

### Worker与本地推进

Cloudflare：保持已有 SyncCoordinator DO、SYNC_RUNNER 私有绑定及当前 Cron兜底；separate 模式的执行器共用本站D1/R2；独立 Native处理原生同步能力。后台快速重试默认10秒、范围10–300秒，配合任务连续失败退避；调度目标不是精确实时承诺。创建/继续等动作请求原有唤醒，唤醒失败任务仍保存由既有计划推进。本站已有 TransferCoordinator 属快传，不要删掉或当同步调度器替代。

Ubuntu/Debian：site_sync/integration/host.py 的 install_local/loop 使用单服务后台推进，不需要DO或另开端口。执行参数优先用后台现有预算设置；1102失败减小已支持切片/批次预算，小范围验证，不新增高频循环、缓存预热或巡检。

应急暂停使用后台既有控制或实际执行环境的 TEACHER_SYNC_PAUSED=1；环境改变需重启/部署对应服务，恢复改回0。更换密钥先停任务/计划，生成一份并两端分别保存，测试后继续；不要两端各生成不同密钥。

## 10. 媒体、日志和维护

运行维护区可按当前策略查看内存/目录/会话/运行任务、预览并分批清理到期会话、报告、临时上传和历史记录；维护程序保留活动租约、运行任务、受引用媒体及不可确认文件。策略入口 backend/maintenance/policy.py 的 load/validate，执行 Maintenance.tick，平台调度为部署runtime与本地lifespan。清理报告表示实际尝试结果，失败不能记成已删除。

媒体目录核对是管理员显式 start/step/预检/提交，数据库登记、物理对象和业务引用都核验；不使用浏览器任意路径直接删除。媒体HTTP公开/私有读取由 Media和media_response按当前规则执行，不把登录用户私有媒体当公开模型数据。

查看故障时记录请求路径、时间/时区、状态码、request_id/Ray ID、任务ID和阶段；密钥/密码/Cookie不写报告。普通未处理500如果异常处理器运行可返回X-Request-ID和REQUEST_FAILED，结合服务器日志定位模板、D1、权限或配置。平台1101/1102硬终止可能没有应用日志/关联头，需平台日志核对。身份查询失败应静默，不能用登录文字变化判断真实会话撤销。

## 11. 验证与重新打包

本轮文档整理应验证：reference 字节/文件名完全相同；其余 docs 正好三份；当前说明的路径、函数和链接存在；外部 README 的活动链接不再指向删除文档；非文档源码/数据库/锁文件/静态资源保持字节不变；release-manifest SHA及文件集合按新包刷新。reference 中旧规格的历史链接不改写，阅读时结合当前三份说明。

既有功能验证入口（准备好相应依赖，项目根执行）：

```bash
python -m pytest -q tests site_sync/tests site_sync/tests_website deploy/cloudflare/tests
node tests/run_dom_tests.cjs
python tests/run_acceptance.py --dom --report /tmp/teacher-acceptance.json
```

DOM需要tests/package.json的Node依赖；Windows入口deploy/windows/test.cmd；--browser需要真实Playwright/Chromium。tests/public-content-regression-v125.cjs现覆盖中英文/手机卡片等场景，文件名沿用旧名称，不能根据文件名判断覆盖版本。测试使用临时合成数据，不连接生产；真实Windows/systemd/Cloudflare验证需在对应环境执行，本地通过不代替线上限额、缓存失效或1101/1102验证。

部署预演沿用 tests/stage_release_v016001.py 与 --separate-sync；输出到源码外，Wrangler --dry-run不发布。源码打包使用 deploy/shared/package_release.py 的 archive/main 和 deploy/vps/release.py 的 inventory/write_manifest/verify，输出必须源码外，不包含实际数据库、凭据、local.cmd、缓存或运行对象。完整性manifest更新是文件列表变化的必要元数据操作，不改应用策略。

文档-only包保留应用版本v0.16.127，单独用文件名标识docs整理；没有提升运行代码版本，没有部署或自动清理任何存储。后续记录当前功能更新到三份手册，不再把历次测试产物放回docs。
