# Cloudflare Worker部署

本文描述本项目构建脚本的配置与使用。主站使用D1数据库和R2对象存储，文件互传由Durable Object协调；正常运行无需独立VPS快传端口。

## 网页构建配置

| 项目 | 值 |
| --- | --- |
| Production branch | web-py（改分支时同步修改TEACHER_BUILD_BRANCH） |
| Root directory | deploy/cloudflare |
| Build command | python build.py check |
| Deploy command | python build.py deploy |
| SKIP_DEPENDENCY_INSTALL | 1，设置在构建变量中 |
| PYTHON_VERSION | 3.13.15，项目构建使用值 |
| NODE_VERSION | 22 |

SKIP_DEPENDENCY_INSTALL是构建变量，不是运行时变量；用于避免平台先对根目录项目执行默认pip安装。构建过程由本项目脚本准备锁定依赖及临时源码。

## 构建变量

| 变量 | 用途 |
| --- | --- |
| TEACHER_WORKER_NAME | 目标Worker实际名称 |
| TEACHER_ORIGIN | 单个实际HTTPS主地址；仍用于SEO |
| TEACHER_ALLOWED_ORIGINS | 逗号分隔完整HTTPS来源，主来源自动包含；会写入运行时vars |
| TEACHER_CUSTOM_DOMAINS | 可选逗号分隔自定义域名，不带协议；由部署显式管理的域名需列全，自动加入来源白名单 |
| TEACHER_WORKERS_SUBDOMAIN | 未设主地址/自定义域名时，用于生成workers.dev地址 |
| TEACHER_CUSTOM_DOMAIN | 可选自定义域名，不含协议/路径 |
| TEACHER_WORKERS_DEV | 是否保留默认域名，默认true |
| TEACHER_D1_ID / TEACHER_D1_NAME | 已创建D1数据库的UUID和名称 |
| TEACHER_D1_INIT | auto：空库初始化、已有库检查；check：只检查 |
| TEACHER_MEDIA_BUCKET | 已创建的R2媒体桶 |
| TEACHER_CACHE_BUCKET | 可选独立缓存桶；不填则共用桶但使用不同前缀 |
| TEACHER_BUILD_BRANCH | 期望构建分支，默认web-py |

生成配置包括DB、MEDIA、CACHE/ASSETS以及TRANSFER_COORDINATOR等绑定；所需资源必须存在且构建账号具有对应权限。密钥使用运行时Secrets，不提交仓库。具体配置验证入口为 `prepare.py`、`integration_package.py` 与 `domains.py`。

## 命令

在本目录执行：

```bash
python build.py check
python build.py prepare
python build.py bundle
python build.py deploy
```

check是预检；prepare准备应用依赖；bundle执行打包/dry-run；deploy完成准备、核对、打包和发布。bundle成功不代表线上业务验证完成。

部署会检查D1结构：空库在auto模式导入 `database/schema.sql`，已有库不重建、不自动迁移。结构不匹配时停止，先核对目标数据库。R2检查创建小型随机探针、读回比对并删除，仅删除本次探针，不清空已有对象。失败后根据日志检查残留的确切探针键。

## 首次管理员

发布后添加运行时Secret `TEACHER_SETUP_TOKEN`（32～256字符的独立随机密钥），重新部署。从任一已配置的允许域名访问 `/setup`，输入密钥并创建管理员；随后访问 `/auth/login`。完成后移除初始化Secret。已有用户或初始化完成标记时setup不可再次使用。不要通过重置数据库解决普通登录或域名错误。

## 路由与域名

配置将 `/setup`、`/admin/*`、`/api/*`、`/transfer` 与 `/transfer/*` 等动态请求优先送入Worker。`global_fetch_strictly_public`是项目兼容配置的一部分，不应在打包合并时遗漏。更换域名应修改构建变量、配置域名绑定并重新部署；旧域名Cookie不跨域继承，需要重新登录。

## 运行与诊断

`runtime/entrypoint.py`区分主站请求、快传协调和Cron；应用实例延迟构建并复用，构建失败不保留半成品。Cron处理有界维护和同步工作，不等于一次完成所有任务。

发生1101/1102时结合平台日志、CF-Ray、入口阶段和后台任务最近保存时间判断；步骤墙钟耗时不是CPU用量。同步参数虽针对Worker降低批量，仍不能保证所有冷启动、查询或合并操作不触发资源限制。避免高频重发或两站互相定时拉取。

当前设计见 [异地同步](../../docs/reference/site-sync.md)、[文件互传](../../docs/reference/file-transfer.md) 与 [日志缓存](../../docs/reference/log-cache.md)。部署测试保留在本目录tests，不依赖历史验收文档。

## 已有多个域名与路由

设置单个 `TEACHER_ORIGIN`，再设置例如 `TEACHER_ALLOWED_ORIGINS=https://lab.your-domain.edu,https://team.your-domain.edu`。各域名须连接同一 Worker、D1、R2 与协调器。构建环境会把白名单写入运行时 vars；直接在控制台修改运行时变量也可生效，但后续构建应保留相同构建变量，避免覆盖。

若路由由控制台管理，不要为了白名单额外设置 `TEACHER_CUSTOM_DOMAIN(S)`；仅白名单不会生成 routes。需要由代码管理自定义域名时用 `TEACHER_CUSTOM_DOMAINS` 列出全部域名，部署配置会保留输入 config 中已有路由并去重追加；不会查询或自动合并未出现在配置中的控制台路由。DNS/证书仍由 Cloudflare 的实际域名绑定决定。

`TEACHER_WORKERS_DEV=true` 只开启默认入口，不会自动允许所有 workers.dev 域名；需将实际默认来源列入白名单。关闭 workers.dev 时不得将其作为主来源或允许来源。
