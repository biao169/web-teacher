## v0.16.077：返回恢复与请求取消

部署脚本自动为Public和Admin加入enable_request_signal、request_signal_passthrough，移除相反标志；保持现有compatibility_date。Sync Executor/Native不继承本轮标志。Public通过SITE_ADMIN原样转发Request，不重建请求或读取正文，以保留平台取消信号。

只有请求signal.aborted已确认且异常为AbortError（含Pyodide包装）或asyncio.CancelledError才归为客户端取消。仅包含“abort/cancel”文字的普通异常不算取消。已取消GET/HEAD可在调用Admin/ASGI前结束；正常写请求不会因导航保护被主动取消或重放。

HTTP-CANCELLED/INVOCATION-CANCELLED与application_outcome=cancelled用于诊断。可返回响应时使用499、CLIENT_CANCELLED、no-store；客户端已离开时可能收不到任何响应。异步任务取消继续向运行时传播。真正的Service Binding错误仍记录并返回503、Retry-After:1；Admin真实异常保留原错误链，不吞错。平台强制终止仍可能无法被应用捕获。

共享Public页面BFCache恢复只校验公开revision，私有组件重新鉴权；检查失败保留公开HTML，暂停分片并提供“重新检查内容版本”。自定义导航及Linux身份恢复逻辑保持原规则。导航中断使过期恢复结果失效。

本轮验证是离线回归及Wrangler上传元数据检查，不能保证客户端取消立即停止已开始的Python/D1操作。真实Service Binding跨Worker取消效果、浏览器BFCache和PoP指标仍需部署后验收。

## v0.16.075：30分钟公开缓存与Worker模式

Cloudflare网页操作：打开主站 Worker → Settings → Builds → Variables and secrets，在构建变量中设置下表；保存后执行新的部署。构建脚本会生成主站和Admin缓存配置，辅助Worker无需手动修改。只改运行时变量不能切换已发布版本的边缘缓存配置。

| 构建变量 | 推荐值 | 说明 |
|---|---|---|
| TEACHER_WORKER_CACHE_MODE | simple | 推荐生产模式 |
| TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS | 1800 | 默认30分钟；允许0～3600；显式已有值不会自动覆盖 |
| TEACHER_PUBLIC_CACHE_TTL_SECONDS | 1800 | 数据/fragment TTL，独立于整页TTL |

| 模式 | Workers边缘缓存 | Worker SQL/Page Cache API | 预取 / stream并发 |
|---|---|---|---|
| simple | 开启（整页TTL>0） | 关闭 | 0 / 1 |
| full | 关闭，便于对比 | 保留原内部缓存策略 | 按原配置 |
| off | 关闭 | 关闭，Public两项TTL强制0 | 0 / 1 |

Admin固定 cache.enabled=false、缓存模式off，不继承Public预取和缓存配置。后台HTML、同步监控、CSRF及写操作no-store。身份/项目私有接口保留private浏览器策略，但Cloudflare-CDN-Cache-Control:no-store，组件主动请求no-store。主站仅允许判定为共享的公开页面/fragment进入边缘缓存；表单、身份敏感导航、错误、Set-Cookie响应不进入。Sync Executor/Native不继承主站cache块，也不修改其协议和调度。

默认公开HTML为public,max-age=1800，继续ETag/304。边缘命中可在Python运行前返回；不增加Python Cache API调用。cross_version_cache=false，版本缓存隔离。数据库revision变化不会主动清除仍新鲜的浏览器/边缘缓存，内容及公开性修改可能延后最多TTL才可见。需紧急停止复用时切换off并重新部署，必要时清除缓存/强制刷新；不要设置全站“Cache Everything”覆盖私有响应。未增加stale-while-revalidate。

验收：部署后检查实际主站cache设置与Admin禁用状态；分别以匿名/登录访问同一标准页面，比较ETag、Vary、Age/缓存状态（若平台提供）及Worker调用指标；不要把X-Public-Page-Cache当作平台边缘命中标记，它仅代表内部Page Cache API。身份接口必须始终不可共享。部署验证不等于已测得线上HIT、CPU或1101/1102改善。

Ubuntu/Debian仅把未显式配置时的公开整页TTL默认值从300调整为1800；原LRU、认证、预取、并发和服务结构不变。Worker专属模式对Linux无效。媒体仍public,max-age=3600或private,max-age=900。

参考：[Cloudflare Workers Cache配置](https://developers.cloudflare.com/workers/cache/configuration/)。当前锁定Wrangler4.143支持cache配置；本轮使用该版本dry-run核对上传metadata.cache_options。

以下历史说明如与本节冲突，以本节为准。

## v0.16.071 · Public 浏览器标题国际化

新增 public_modules(lang)，英文 Public 使用 Faculty/Students/Research/Projects/Publications/Patents/Courses/News；中文和后台 MODULES 保持不变。完整页和 fragment 使用同一映射，native.html 原有隐藏 h1 自动获得对应语言，无需重复修改模板。

浏览器站点标题单独使用 site_name_en（英文）或 site_name（中文），英文缺省 Academic Website，不回退中文站名；页头 site.title 规则保持不变。详情继续复用原有条目英文名称及有效翻译覆盖，无译文不制造翻译。首页保留有效译文 SEO 或英文 SEO；未翻译的中文 SEO 不再成为英文页标签的回退值。导航与按钮、后台中文菜单保持原逻辑。

Public ETag 表示版本更新为 0.16.071，避免重新验证时匹配旧标题；浏览器已新鲜的旧页面仍可能保留到原缓存 TTL，可刷新验证。不修改缓存 TTL、同步、数据库及部署策略。

## v0.16.070 · 统一辅助上传确认

Native、Executor、Admin 上传后的配置和产物版本核对统一复用有限确认重试：最多 6 次读取，等待间隔 0/1/2/4/8/15 秒（合计 30 秒，不含 API 请求及网络重试时间）。同时检查变量类型/值、D1/R2/服务/DO 绑定和产物版本；所有权错误、API 异常不被当作配置延迟吞掉。原有回调与 Cron 确认保留。

AUX-CONFIG-CHECK / ADMIN-CONFIG-CHECK 输出 release.expected、release.actual、revision_match、differences 与 attempt。只有格式正确的数字发布版本允许显示具体值；其他配置仅显示字段和匹配状态，密钥和产物版本哈希均不输出。actual=null 可能表示变量缺失、错误类型或不可安全展示的值，结合 present/type 判断。持续不匹配仍停止发布，不跳过校验。

AUX-PREPARE-INCOMPLETE / ADMIN-PREPARE-INCOMPLETE 表示本轮主站尚未部署、Executor Cron 尚未执行恢复；不代表上一版主站被回滚或任务被删除。重新部署可完成确认与收尾。原网页构建/部署命令、环境变量保持不变，无需手动修改 TEACHER_RELEASE，无需删除 Worker 或数据库。

本修复增强确认和诊断，并未证明此前平台返回旧配置就是唯一根因。未执行真实 Cloudflare 发布；同步运行代码、数据库、Linux/VPS 与前端不修改。

## v0.16.069 · 辅助发布收尾恢复

修复主站已部署、Native 回调检查未确认而 Executor Cron 未恢复的发布路径。无需新增环境变量，保持原 Cloudflare 网页构建/部署命令与 separate 模式，更新源码后重新部署即可自动尝试完成收尾。不要删除数据库、任务、Durable Objects 或 Worker。

- Native 上传时保留已确认正确的 SYNC_RUNNER（separate 指向独立 Executor，inline 指向主站）；首次部署或模式切换仍在主站发布后配置回调。
- 写入回调后最多读取 6 次，间隔 0/1/2/4/8/15 秒，额外等待合计最多 30 秒（不含网络请求/API 层重试耗时）。核对绑定名称、service 类型和目标，不把任意同名变量视为有效绑定。所有权不匹配或 API 错误仍明确失败。
- 回调与私有访问确认后，自动写入 Executor 的每分钟 Cron，并用同样有限读取确认。未确认时不会输出 AUX-ACTIVE/PUBLISHED；保留错误并可重新部署恢复。
- AUX-ACTIVATE/AUX-CALLBACK-CHECK 输出预期目标及实际白名单字段，不输出密钥或整个 settings。AUX-CRON-CHECK 显示确认的 Cron；AUX-ACTIVATION-INCOMPLETE 明确失败阶段、回调是否确认、Cron 为 not_confirmed 或 written_unconfirmed。后者表示已提交写入但未确认，并不宣称实际不存在。

成功应看到 AUX-CALLBACK-READY、AUX-CRON-CHECK confirmed=true、AUX-ACTIVE 和 PUBLISHED。如果仍失败，保留这些日志重新排查；不因猜测传播延迟而忽略校验。此前真实失败根因尚未取得 API 返回证据，本修复解决单次读取脆弱性与恢复诊断。

不修改 Linux、同步协议、checkpoint、Executor/Native 运行代码或数据库；保留 v0.16.068 缓存和媒体优化。构建失败不会自动回滚已成功部署的主站；辅助收尾未完成时 Cron 可能尚未恢复。

## v0.16.068 · Worker 媒体查询与图片重试

Worker/R2 将直接媒体引用的逐字段查询合并为一条返回布尔值的 EXISTS 查询；命中时公开性检查只调用一次数据库（含此前媒体记录查询，共两次）。沿用原可见范围、PDF/课程资料公开策略。未命中仍使用原有分页正文与有效译文解析，不能承诺所有正文媒体检查只有 1～2 次查询；不以字符串匹配替代真实引用判断。Linux 仍沿用原查询路径，无新增全局引用缓存或数据库结构变更。

前台 Logo、媒体占位图及正文图片首次失败后等待约 1000ms，按原 URL 仅重试一次；再次失败显示原占位或隐藏。重复绑定/错误不会增加重试；成功加载清除定时器，pagehide 取消待执行重试，脱离 DOM 或更换 src 的图片不会被旧回调覆盖。没有给 URL 添加随机参数。图片脚本版本与页面 ETag 表示版本已更新；三端 HTTP 媒体缓存保持 v0.16.067 策略。

不修改同步协议、checkpoint、Executor/Native、媒体引用规则或 Linux 页面 LRU、预取、并发。未进行真实 Cloudflare 部署、CPU/内存测量；减少调用次数不等于保证消除 1101/1102。下一步为双平台回归与真实指标验收。

## 媒体 HTTP 缓存（v0.16.067）

Worker、Ubuntu、Debian 共用媒体响应策略：公开媒体 `public, max-age=3600`；已授权后台/私有媒体 `private, max-age=900`。公开性由现有引用规则判断，与是否登录无关。响应保留 `Vary: Cookie, Authorization`，GET/HEAD 支持 ETag 与 If-None-Match / 304，并保留 Range 下载。

ETag 复用本地文件版本或 R2 对象版本，不读取完整文件计算哈希。私有媒体先鉴权再判断 304；错误响应及外部媒体跳转仍为 no-store，其他后台页面和接口仍为 no-store。浏览器在缓存有效期内可能直接复用媒体；权限或公开引用变更将在下一次服务器请求时检查，已有浏览器副本不会被远程清除。

Linux 页面 LRU、Data LRU、认证、预取及 stream 并发不变；同步协议、checkpoint、Executor/Native 不变。本步未加入 Worker 媒体公开性 SQL 合并与图片失败重试，这些属于下一步。

# Cloudflare 网页部署 · v0.16.066

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

后台转发失败会记录 ADMIN-FORWARD / ADMIN_UNAVAILABLE、请求 ID；成功转发可通过响应头 x-upstream-request-id 关联 Admin 日志。Service Binding 分离代码和应用状态，但不承诺额外 CPU 配额，也不能消除共享 D1 压力。详细实现及验证边界见 [交付记录](../../docs/releases/v0.16.061.md)。

官方参考：[Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/)、[运行时 Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 公共页面缓存与导航预取

下表是full模式的参数默认值；simple/off会强制覆盖并发及预取，off还会覆盖两种TTL。四项参数仅属于本机部署配置，不写入数据库，不随两站同步迁移。缺失使用默认值；显式空值、非整数或越界会报配置错误。

| 变量 | 默认 | 范围 | 功能与关闭方式 |
| --- | --- | --- | --- |
| `TEACHER_PUBLIC_CACHE_TTL_SECONDS` | 1800 | 0～86400 秒 | 公共数据缓存及当前 revision 分片缓存；0 关闭数据缓存 |
| `TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS` | 1800 | 0～3600 秒 | 匿名安全整页浏览器 HTML 新鲜期（仅full同时启用Worker Render Cache）；0 关闭整页缓存 |
| `TEACHER_PUBLIC_STREAM_CONCURRENCY` | 2 | 1～4 | 页面内容分片加载并发；不是服务进程数 |
| `TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY` | 1 | 0～2 | 导航意图预取并发；0 完全关闭预取 |

两种 TTL 独立。整页 TTL=0、数据 TTL>0 时，完整 HTML 使用 `private, no-cache` 和 ETag 条件验证；两种 TTL 都为0时完整 HTML 使用 `no-store`。匿名安全整页默认 `public, max-age=1800`；已登录安全整页使用身份相关 ETag 和 `private, no-cache`。详情、表单、后台、同步接口和错误响应不进入匿名整页缓存。

修改内容会更新 revision，但浏览器已经缓存且仍新鲜的 HTML 可能保持到 TTL 到期。需要每次导航验证时将整页 TTL 设为0。不要让反向代理覆盖 `Cache-Control` 或忽略 `Vary: Cookie, Authorization, X-Public-Fragment`。

Linux 使用有界内存预算，Worker只有full模式使用 Cache API；缓存可能被驱逐、跨 PoP 不保证命中。预取仅针对同源导航意图，不批量预取所有页面；离线、省流量及后台标签页不启动新预取。

### Cloudflare 网页设置与发布

1. 选择原站点 Public Worker，在 Settings → Build/Builds → Variables and Secrets 添加上表四项普通文本构建变量。值只填数字，不加单位；也可全部省略使用默认值。
2. 保持根目录 `deploy/cloudflare`、构建命令 `python build.py check`、部署命令 `python build.py deploy`，重新触发构建部署。
3. 本项目部署脚本将已校验的构建变量写入 Public 的运行时 vars。部署成功后在 Public 的 Settings → Variables and Secrets 核对四项值。
4. Admin、Sync Executor、Sync Native 不需要填写这四项；项目自动创建/更新辅助 Worker 并排除这些 Public 专用变量。无需手动更新辅助 Worker。

Cloudflare 构建变量本身不会自动成为运行变量；这里由项目脚本明确转换。只改运行变量可临时生效，但下一次项目构建会用构建变量或默认值覆盖，所以长期配置应保存到 Builds。官方说明：[Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)。

部署后用未登录浏览器访问首页，检查 `Cache-Control`、`ETag`、`X-Public-Page-Cache`；携带相同 ETag 的条件请求可返回304（内容、身份及版本须不变）。禁用浏览器缓存会影响测试结果。再核对登录、后台和同步路径不被公开缓存。缓存异常会回源，不新增数据库或存储绑定；线上 CPU、内存和预取导航复用需在真实环境验收。

需要暂时关闭优化时设置两种 TTL 为0、预取并发为0并重新部署；已有浏览器新鲜缓存仍可能保留至原 TTL 到期。部署过程不要求删除数据库、任务或媒体。

## Worker缓存模式（v0.16.064）

在原站点 Public Worker 的 **Settings → Build/Builds → Variables and Secrets** 设置普通文本变量：

```text
TEACHER_WORKER_CACHE_MODE=simple
```

省略时默认simple；仅接受simple、full、off，空值或拼写错误会停止构建。保存后重新运行既有 `python build.py deploy`，程序自动更新Public及Admin/同步辅助Worker，无需新增Gateway Worker。

| 模式 | 导航预取 | 首页stream并发 | Worker SQL/Page Cache API | 浏览器缓存与ETag |
| --- | --- | --- | --- | --- |
| simple（推荐生产） | 强制0 | 强制1 | 均关闭 | 保留；TTL沿用配置，默认1800/300秒 |
| full（完整缓存实验/对比） | 配置值，默认1 | 配置值，默认2 | 保留原实现 | 保留 |
| off（紧急稳定模式） | 强制0 | 强制1 | 均关闭 | 两种Public TTL强制0，动态公共HTML no-store，无该HTML的ETag |

simple/off强制 `TEACHER_WORKER_REQUEST_CACHE=0`，即使误填1也不会开启SQL缓存。full默认开启原SQL缓存；显式设置REQUEST_CACHE=0仍可单独禁用。模式只控制动态Public缓存，静态资源/媒体自身的缓存协议不变。

Admin固定mode=off、REQUEST_CACHE=0，且移除四项Public参数；后台HTML、同步状态、任务列表与CSRF不增加共享缓存。Ubuntu/Debian不读取此模式，其部署文件、LRU、默认TTL、并发和预取均不变。

建议始终通过构建变量切换，再重新部署，以完整恢复full默认值。只临时修改运行时mode时，之前simple生成的并发1、预取0、REQUEST_CACHE=0仍是显式变量；要回到完整full需同时恢复这些值，off生成的TTL=0也需恢复。下一次构建以Builds中的值为准；不需要重建数据库或清理同步任务。

检查simple首页HTML中的 `data-public-nav-prefetch-concurrency="0"`、`data-public-stream-concurrency="1"`；未登录安全整页仍有浏览器缓存头和ETag，相同条件请求可返回304，但不应显示内部整页缓存HIT。off验证动态整页no-store。原来浏览器已缓存的新鲜HTML可能到原TTL结束才更新，切换后验收请先强制刷新。

此策略减少缓存桥接和预取突发，不能保证消除所有1101/1102。Cache API异常隔离不能捕获平台强制终止；仍需结合对应版本、request ID、Ray ID和平台outcome定位真实异常。

## Worker Public轻量认证（v0.16.065）

无需新增变量。Worker前台GET/HEAD页面及Public只读接口每次查询仍核验会话有效性、用户状态、角色状态和可见范围；通过EXISTS取得后台入口和项目查看权限摘要，不读取完整auth_permissions结果。session的last_seen/idle续期最多约120秒更新一次，条件UPDATE避免并发重复更新。没有isolate身份缓存。

Public不构建后台模块菜单或查询admin-sidebar。完整认证继续用于Admin/Auth、媒体、联系表单与写操作，Ubuntu/Debian仍保持完整认证。v0.16.065阶段登录Public为private,no-cache；v0.16.066起使用下节的60/120秒private短缓存。保留上一版simple/full/off策略；不更改同步和数据库。

## Worker登录Public短缓存（v0.16.066）

无需新增变量。simple/full模式下，允许缓存的登录Public完整页面使用普通登录 `private, max-age=120`、系统管理员 `private, max-age=60`，并保留ETag及Vary: Cookie, Authorization, X-Public-Fragment。仅当前浏览器可缓存，不写入匿名Page Cache，也不启用共享登录页面缓存。匿名页面仍按整页TTL配置，默认300秒。

off模式继续动态整页no-store；整页TTL=0时登录页面退回private,no-cache。强制改密账号不启用短新鲜期。详情、联系表单、Admin/Auth、写操作、带Authorization请求、登录分片和错误响应不增加缓存。Ubuntu/Debian仍使用原页面策略。

浏览器命中新鲜缓存时不会请求服务器，因此会话撤销、权限变化和内容变化可能最多延迟60/120秒显示；回源时仍执行实时轻量认证并更新身份相关ETag。旧身份ETag不得验证为新身份的304。需要每次访问验证时把TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS设为0并重新部署；已存在的新鲜缓存仍需过期或强制刷新。

验收使用浏览器普通导航且关闭“Disable cache”；验证private缓存复用。另用带If-None-Match的请求验证304、空正文与相同private策略。不能仅凭本地响应头测试宣称已降低真实Worker CPU。
