# Cloudflare 网页部署

一个主站构建项目自动发布主站和辅助 Worker，无需 GitHub Actions。源码 v0.16.012；API 流程已通过模拟测试和实际上传包校验，尚未在真实 Cloudflare 账号完成发布验收。

## 1. 准备

把完整源码上传至 GitHub 的 web-py 分支，仓库根目录应直接包含 backend、frontend、site_sync、database、deploy。创建或使用已有 D1 数据库和 R2 桶，记录账号 ID、数据库 UUID 和资源名称。不要重复手工导入 SQL；脚本检查并初始化空库。

只为主站关联 Git 构建。辅助 Worker 由脚本创建，无需手动创建或关联仓库。

## 2. 主站 Settings → Build

| 项目 | 内容 |
|---|---|
| Production branch | web-py |
| Root directory | deploy/cloudflare |
| Build command | python build.py check |
| Deploy command | python build.py deploy |

主站控制台名称必须与 TEACHER_WORKER_NAME 一致。不要添加辅助发布命令，不要修改平台注入的 WRANGLER_CI_OVERRIDE_NAME / WRANGLER_CI_MATCH_TAG。

## 3. Build Variables and Secrets

以下全部配置在**构建设置**，不是 Worker 运行时设置。

| Variable | 示例或说明 |
|---|---|
| SKIP_DEPENDENCY_INSTALL | 1 |
| PYTHON_VERSION | 3.13.15 |
| NODE_VERSION | 22.23.3 |
| TEACHER_WORKER_NAME | web-teacher-biao |
| CLOUDFLARE_ACCOUNT_ID | 当前账号的32位十六进制 Account ID |
| TEACHER_ORIGIN | 主站完整 HTTPS 根地址，如控制台显示的 workers.dev 地址 |
| TEACHER_D1_ID | 数据库 UUID，不是账号 ID |
| TEACHER_D1_NAME | web-teacher-sql-biao |
| TEACHER_MEDIA_BUCKET | web-teacher-media-biao |
| TEACHER_SYNC_EXECUTOR_MODE | inline 或 separate；默认 inline |

| 构建 Secret | 内容 |
|---|---|
| TEACHER_AUX_API_TOKEN | 授权本账号 Workers Scripts 编辑的 API Token，用于辅助发布 |
| TEACHER_SYNC_KEY | 64位随机十六进制密钥；同步两端使用同一份 |

在 My Profile → API Tokens 创建令牌，将账号资源范围限定到部署账号。辅助令牌用于读取/上传 Worker、设置私有入口及 Cron；绑定的 D1/R2 必须属于该账号。若平台拒绝绑定资源，按 API 错误核对令牌资源权限。

Build 页面选用的主站发布令牌还必须具备 Workers Scripts 编辑、D1 编辑、Workers R2 Storage 编辑；由脚本管理自定义域名时需要相关域的 Workers Routes 编辑权限。两个令牌角色独立：TEACHER_AUX_API_TOKEN 不替代主站发布凭据，不传给部署子进程或运行中的网站。

可选构建变量：

| Variable | 内容 |
|---|---|
| TEACHER_ALLOWED_ORIGINS | 多个完整 HTTPS 根地址，逗号分隔 |
| TEACHER_CUSTOM_DOMAINS | 需自动绑定的自定义域名，逗号分隔，不带协议 |
| TEACHER_CACHE_BUCKET | 独立缓存桶；不填共用媒体桶 |
| TEACHER_D1_INIT | auto（默认）；check 仅检查，空库停止 |
| TEACHER_BUILD_BRANCH | 非 web-py 时填写，并同步修改 Production branch |

## 4. 选择模式并部署

| 模式 | 自动管理的 Worker |
|---|---|
| inline | web-teacher-biao、web-teacher-biao-sync-native |
| separate | 上述两个，加 web-teacher-biao-sync-executor |

主站是唯一公开网站。辅助模块共用主站 D1/R2，脚本关闭其 workers.dev 与预览 URL，不要另行为辅助模块添加公开域名或路由。

点击部署后自动检查名称与已有归属、构建产物、检查 D1/R2，再发布辅助模块。同步密钥随代码一并上传；辅助检查通过后发布主站；最后 separate 模式启用执行器每分钟 Cron。inline 模式下原生模块无 Cron，主站负责推进同步。

辅助 Worker 的 TEACHER_AUX_OWNER / TEACHER_AUX_ROLE 是归属标记。已存在同名对象但缺少/不匹配标记时停止，不自动覆盖旧版或其他程序。不要为了消除 10064 删除主站 TransferCoordinator 或其迁移。

切换模式：修改构建变量 TEACHER_SYNC_EXECUTOR_MODE 后重新部署。切回 inline 会关闭已有且归属匹配的独立执行器 Cron，保留该 Worker，不删除数据库或文件。

## 5. 发布结果与首次管理员

日志顺序：AUX-PREFLIGHT → 打包及 D1/R2 检查 → AUX-UPLOAD 或 AUX-REUSE → AUX-READY → DEPLOY → AUX-ACTIVE → PUBLISHED。

AUX-PREFLIGHT 检查可读性及现有归属，不能提前保证全部写入权限。辅助打包 dry-run 仍可能显示 CI 名称覆盖提示，但辅助上传使用明确的 API URL；实际目标以 AUX-UPLOAD 的 worker 字段为准。

首次安装在主站 Settings → Variables and Secrets 添加**运行时 Secret** TEACHER_SETUP_TOKEN（32–256字符随机值），保存部署后访问主域名 /setup 创建管理员，再删除此临时密钥。已有管理员无需重复初始化。

访问首页、后台、文件快传，随后在 /admin/site-sync 创建小范围拉取任务，观察进度、日志及后台自动推进。

## 6. 失败与重试

- HTTP 401/403：检查辅助令牌权限和账号范围；接口不会把权限失败当作对象不存在。
- 同名归属冲突：在控制台核对对象用途，程序不会自动接管。
- HTTP 429/5xx/网络中断：API 最多尝试3次，随后停止；修复后重新运行构建。
- 多 Worker 发布不是原子事务；失败时可能已有辅助组件更新，或独立 Cron 已暂停。主站 DEPLOY 成功后仍可能在 Cron 激活阶段失败。重新部署将重新检查并完成设置；不自动回滚代码或删除组件。
- PUBLISHED 只表示平台发布及配置检查完成；不表示已验证线上业务和 CPU 限额。

非发布验证仍可使用 python build.py verify-companions；本地追加 --report /tmp/companions.json 保存产物检查报告。完整上传包不会包含辅助 API Token。

域名详情见 [DOMAINS.md](DOMAINS.md)，运行资源诊断见 [CPU-DIAGNOSTICS.md](CPU-DIAGNOSTICS.md)。

## 7. 网页联调与恢复验收

首次部署仍使用第2节命令。发布后，可将主站的 Deploy command 临时改为 `python build.py cloud-check`，点击重试构建；检查完成后恢复为 `python build.py deploy`。此诊断只读取云端配置，不更新代码、数据库或 Cron；成功日志应为 CLOUD-CHECK passed=true。它检查两种模式的资源绑定、同步密钥是否存在、辅助私有入口、Cron 和主站 Durable Object 绑定；不会读取密钥值，也不代表实际业务运行成功。

实际业务验收：打开首页、后台和媒体；创建一个小型同步任务，关闭后台页面后再次查看进度；分别验证手动拉取、对端批准后的推送与定时拉取。在测试站点观察临时传输失败后的自动续传，确认任务最终完成、数据及媒体一致。切换 separate 后重复验证，并在 Worker Observability 检查是否发生 1101/1102。不要在生产账号人为删除资源制造故障。

发布中断后，修复权限或网络问题，再点击重试构建。脚本读取 TEACHER_AUX_REVISION 指纹：相同代码、配置及密钥可跳过辅助代码上传，仍检查归属并补齐私有入口和 Cron；代码或密钥变化会重新上传。该机制依赖程序管理的标记，请勿手工修改标记、辅助代码或密钥。构建不会自行无限重启；API 单次调用的有限自动重试与网站同步任务的后台恢复是两套机制。

只验证原生模块时，可临时将 Deploy command 改为 `python build.py verify-native`。此命令不发布，跳过 Python 依赖和整站静态资源整理，仅安装锁定的 Node 工具并校验 JavaScript 上传包。inline 模式的 verify-companions 同样使用此轻量路径；separate 模式仍须打包 Python 执行器。完整主站发布依然需要 Python 构建。
