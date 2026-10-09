# Cloudflare 网页部署 · v0.16.054

只为原站点关联 Git 构建；程序自动发布 Public、Admin 和同步辅助 Worker，无需 GitHub Actions。Ubuntu/Debian 不受此部署拆分影响。

## 1. 网页构建配置

Workers & Pages → 选择原站点 Worker → Settings → Builds。仓库完整源码放在 web-py 分支，保留原 Worker 名称、D1 和 R2。

| 设置 | 填写内容 |
| --- | --- |
| Production branch | web-py |
| Root directory | deploy/cloudflare |
| Build command | python build.py check |
| Deploy command | python build.py deploy |

## 2. Builds → Variables and Secrets

下面是**构建变量**，不是只填在运行时 Variables and Secrets。

| 变量 | 内容 |
| --- | --- |
| SKIP_DEPENDENCY_INSTALL | 1 |
| PYTHON_VERSION | 3.13.15 |
| NODE_VERSION | 22.23.3 |
| TEACHER_WORKER_NAME | 原站点 Worker 名，例如 web-teacher-biao；必须与关联项目相同 |
| CLOUDFLARE_ACCOUNT_ID | 当前账号的 32 位 Account ID |
| TEACHER_ORIGIN | 网站 HTTPS 根地址，例如 https://biao.nebastars.com |
| TEACHER_D1_ID | 现有 D1 的 UUID |
| TEACHER_D1_NAME | 现有 D1 名称 |
| TEACHER_MEDIA_BUCKET | 现有 R2 媒体桶名称 |
| TEACHER_SYNC_EXECUTOR_MODE | 推荐 separate；仍支持 inline |
| TEACHER_ALLOWED_ORIGINS（可选） | 多个允许访问的完整 HTTPS 根地址，逗号分隔 |
| TEACHER_CUSTOM_DOMAINS（可选） | 由程序绑定的域名，逗号分隔，不带 https:// |
| TEACHER_CACHE_BUCKET（可选） | 独立缓存桶；不填共用媒体桶 |
| TEACHER_D1_INIT（可选） | auto（默认）；check 仅检查、空库停止 |
| TEACHER_METADATA_EMAIL（可选） | 后台论文查询联系邮箱 |
| TEACHER_TRANSLATION_HOSTS（可选） | 自定义翻译服务主机名白名单，逗号分隔 |

| 构建 Secret | 内容 |
| --- | --- |
| TEACHER_AUX_API_TOKEN | 本账号 Workers Scripts 编辑令牌，用于自动创建/更新 Admin、Native、Executor |
| TEACHER_SYNC_KEY（可选） | 64 位十六进制；建议部署后在网站同步后台设置，共用数据库保存 |
| TEACHER_SETUP_TOKEN（仅新站可选） | 32–256 字符随机值，自动写入 Admin；创建管理员后删除构建值及 Admin 运行时 Secret |

后台外部服务密钥如需使用环境配置，也放在构建 Secrets：TEACHER_OPENALEX_API_KEY、TEACHER_SEMANTIC_SCHOLAR_API_KEY、TEACHER_PUBMED_API_KEY、TEACHER_GOOGLE_TRANSLATE_KEY、TEACHER_DEEPL_API_KEY、TEACHER_MICROSOFT_TRANSLATOR_KEY、TEACHER_LIBRETRANSLATE_API_KEY。它们只写入 Admin。密钥未在本轮构建提供时，保留 Admin 已有 Secret；仅删除构建值不会删除已经部署的 Secret。

主站 Builds 使用的发布令牌需要 Workers Scripts 编辑、D1 编辑、R2 Storage 编辑；自动绑定自定义域名还需要相应域的 Workers Routes 权限。辅助令牌限定当前账号；cloud-check 如需检查数据库密钥状态，再授予 D1 Read。不要把 TEACHER_AUX_API_TOKEN 填入运行时或网页表单。

## 3. 自动生成的 Worker

以 web-teacher-biao 为例：

| Worker | 用途 | Cron |
| --- | --- | --- |
| web-teacher-biao | Public、路径分发、原快传 DO、站点维护 | 保留原维护 Cron；inline 时还推进同步 |
| web-teacher-biao-admin | 私有后台、登录、初始化、媒体上传与同步控制界面 | 无 |
| web-teacher-biao-sync-native | 原生流式传输 | 无；保留原 DO alarm |
| web-teacher-biao-sync-executor | separate 模式的同步执行 | 每分钟一次 |

inline 共 3 个 Worker；separate 共 4 个。只给 Public 保留网站域名。Admin 通过 SITE_ADMIN Service Binding 接收同域后台请求；无需手动添加 /admin/* Zone 路由。原 workers.dev 入口也使用同样的分发。不要给辅助 Worker 关联仓库或开放公开 URL。

部署顺序：归属检查 → 全部产物检查 → D1/R2 检查 → Native/Executor → ADMIN-READY → Public DEPLOY → 激活同步调度。后台/辅助发布失败时，停止更新 Public；修复后在原构建项目重试。多 Worker 发布不是原子事务，中断可能留下不同版本或暂停的 Cron；重试会检查并补齐，不删除任务、媒体或数据库。

## 4. 初始化与升级

新站访问主域名 /setup，使用上述临时密钥创建管理员，然后访问 /auth/login。也可以部署后到 **Admin Worker** → Settings → Variables and Secrets 添加运行时 Secret TEACHER_SETUP_TOKEN；不再填在 Public Worker。

从 v0.16.052 升级无需清库、重新初始化账号或手动创建 Admin。后台曾依赖仅存于 Public 运行时的外部服务密钥时，需要将其重新填到构建 Secrets 或 Admin 运行时；Cloudflare API 不能读出旧 Secret 明文。账号、会话和数据库中的同步密钥由两端共享，不需要复制。

不要删除原 Public 的 TransferCoordinator，也不要添加删除/改名迁移。它的类名、归属和持久状态保留。

## 5. 发布后验收

- 首页 /en、/zh 和 /media/... 正常。
- /auth/login 登录后，前台显示同一账号；/admin 和 /admin/site-sync 可用。
- 上传小图片、预览并检查失败日志；测试 /transfer/ 和 /admin/transfer。
- Public Settings → Bindings 出现 SITE_ADMIN、SYNC_NATIVE，以及 separate 时的 SYNC_EXECUTOR。
- Admin 使用相同 D1/R2、TEACHER_ORIGIN、TEACHER_ALLOWED_ORIGINS，且无 Cron、无公开 URL。
- 同步 executor 保持独立；小范围同步任务能继续推进。

可将构建部署命令临时改为 `python build.py cloud-check` 做只读配置检查（需构建令牌），检查各 Worker 版本、绑定、私有入口和 Cron；检查后改回 `python build.py deploy`。它不代替实际业务验收。`verify-native` 仍仅构建 JS 原生辅助；`verify-companions` 现在也检查 Python Admin。

后台转发失败会记录 ADMIN-FORWARD / ADMIN_UNAVAILABLE、请求 ID；成功转发可通过响应头 x-upstream-request-id 关联 Admin 日志。Service Binding 分离代码和应用状态，但不承诺额外 CPU 配额，也不能消除共享 D1 压力。详细实现及验证边界见 [交付记录](../../docs/releases/v0.16.054.md)。

官方参考：[Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)、[运行时 Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。
