# 第五步：独立运行、调度和部署

本包继续从新模块第四步开发，没有读取或移植 v0.15.181 网站代码。
已提供运行入口与接线，不代表已替换用户线上网站或通过真实 Cloudflare 验收。

## 本步新增文件

| 路径 | 用途 |
| --- | --- |
| runtime/service.py | 统一宿主接线，每次只处理一个有界动作 |
| runtime/local.py | Ubuntu/Debian 后台循环、信号退出、启动结构检查、日志轮转 |
| runtime/worker.py | Cron 与私有 tick RPC，HTTP 仅健康检查 |
| runtime/bridge.py、worker/native_service.mjs、native_dispatch.mjs | Python 与原生 JS 的服务绑定桥接；媒体不跨 Python |
| runtime/schedules.py | 接收端定时拉取，当前授权、去重和防重叠 |
| runtime/mapping.py | 显式配置的普通业务表适配器，不猜测教师网站字段 |
| runtime/peer_server.py、peer_worker.py | 独立的签名只读源站入口 |
| deploy/d1_remote.py、cloudflare.py、recovery.py | 部署宿主 D1 检查/迁移、恢复书签、发布前校验 |
| deploy/wrangler.*.jsonc、*.service | Worker 和 systemd 配置模板 |
| 根目录 start-sync.sh、start-sync-peer.sh、deploy-sync.sh | Linux 启动与部署入口 |

上表除最后两项外，路径相对 site_sync/。

## 数据库与调度

唯一初始化文件仍为 database/schema.sql，结构版本升至 4。
新增 sync_schedules 和任务 discovery_cursor；保留 schema 1/2/3 → 4 的明确迁移。
旧结构指纹 JSON 不是另一套初始化 SQL。SQLite 启动前自动检查、必要时备份迁移；
D1 在部署主机上完成同样流程。普通网页请求、Cron 和 tick 不执行 DDL。

Schedules.put 是可信后台调用接口，调用前网站应验证操作者管理权限；grant_id 不是身份。
周期为 60 秒至 30 天，只有接收站配置自动拉取。授权撤销时禁用计划并保留任务记录。
每个计划运行使用幂等操作 ID；创建任务后丢失回执不会重复创建。活动、暂停或等待中的
同对端任务阻止新的自动任务；INSERT 中再次检查，防并发检查后同时创建。
暂停旧任务不会被定时器偷偷恢复。周期从本次调度时间推进，不补跑积压的几百次周期。

Worker 每分钟一次 Cron；一轮只处理一次有界操作，不 self-fetch、不递归 waitUntil。
保留周期性调度机会，避免长传输饿死其他对端计划。任务仍按数据库租约和公平顺序推进。
硬终止后的恢复沿用第三步机制，有进度不累计连续失败，没有任务总时限。

## 前台与资源

- 前台页面不触发 Engine.tick，不进行同步重试或迁移。
- Worker 引擎和原生媒体服务都默认 workers_dev=false、无公开路由。
- 原生服务 fetch 永远 404；read/step/discard 仅经 Service Binding RPC。
- 引擎 HTTP 仅 GET /health；POST /tick 不开放。后台需要唤醒时由已鉴权网站宿主调用私有 RPC。
- 私有服务绑定不是额外 CPU 配额；不能声称拆成两个 Worker 就消除了资源限制。
- 本地后台进程以 nice/CPUQuota/MemoryMax 限额运行，网络 I/O 在线程中执行。
- 本地出站服务仅绑定 127.0.0.1，并发最多 2，请反向代理提供 HTTPS。
- sync 运行日志最多 1 MiB × 4 个文件，仅写动作、任务 ID、错误类型，不打印正文、密钥或 URL。
- systemd stderr 配有速率限制；它仍进入系统 journal，机器级 journal 留存需由运维配置。
- Worker 默认关闭普通日志采集；平台错误与实际配额须在真实环境观察。

这些措施隔离执行路径，但共享 SQLite/D1 仍有数据库竞争，因此没有声称前台延迟影响为零。
真实网页响应延迟和 Worker CPU 峰值在第七步测量。

## 业务映射与边界

MappedWebsite 支持配置 1..16 个模块，每模块 1..30 个普通标量字段。标识符严格白名单，
正文通过 SQL substr(CAST(json_quote(field) AS BLOB)) 读取，避免在 Python 整条读取大正文。
接收时在数据库中拼接 JSON 标量，保留字符串、数字、null 类型。目标版本条件防止覆盖预览后
修改的本地记录。来源必须在任意内容变更时更新版本。

候选按 updated 降序、module/id 升序稳定游标逐条获取，所选模块合计最多最新 500 项。
不是每模块 500 项。每个模块只向外层排序提交一条候选；大表必须有 `(updated DESC,id)` 索引，
id 应为稳定的 TEXT 键，不能混用数字与字符串排序。索引应并入网站唯一 canonical schema。持续变化的源站不是跨请求快照；移到游标之前的新内容由下一轮覆盖，
已选版本变化则暂停，不把不同版本正文混拼。deleted 标志提供显式删除证据；500 项窗口之外
的缺失绝不推断为删除。源站需保留删除记录/墓碑，否则不能用普通映射传播硬删除。

这个映射适合标量表接入验证，**不是已经完成教师、论文、新闻、媒体等所有关系表的映射**。
现有网站复杂关系、翻译依赖、媒体引用与删除逻辑应实现可信业务适配器的 discover/apply/check；
必要依赖须单独有界补齐，不能把它们挤进主候选 500 项中。映射不支持的媒体发布明确暂停，
不会假装成功。第四步的本地/R2 接收适配器已接到宿主；真实网站的来源媒体授权与版本化路径
仍需按实际模型接线。本地自定义源适配器可实现 source_media 返回版本固定的打开句柄。
可选 peer_worker 当前仅提供标量记录读取；原生媒体源站服务必须由网站适配器实现。

本轮没有可用于核实这些关系的完整当前网站源码，也没有云端凭据。因此业务示例配置是空映射，
必须填入实际表信息才通过健康检查；不会自动创建一个与网站脱离的新业务库。

## 验证

报告 step5-results.json 包含：
- 两个独立 SQLite 数据库，经真实本地 HTTP 完成候选、分片、写入、显式删除和清理。
- 相同映射通过 D1 绑定替身运行。
- 最新 500 项总上限、目标并发修改保护、定时去重/暂停/授权撤销、日志轮转。
- Worker disabled、Cron 单次推进、公开 POST 拒绝、健康检查失败隐藏详情。
- 原生 RPC 控制大小和 published 文件删除拒绝。
- D1 部署单批请求形状、书签持久化、前置检查失败不调用云端。

未安装 Wrangler，也未执行 pywrangler 构建、systemd 启动或真实云部署。
这些入口需在部署环境完成 SDK/FFI、D1 REST 批次事务和 R2 的验收；测试替身不是实机结论。

下一步第六步：共享后台中的任务/计划管理、重试和切片设置、任务 ID、统一时区、状态刷新与留存清理。
实际网站接入时仍需当前源码和明确业务映射，不能用本包覆盖整站。
