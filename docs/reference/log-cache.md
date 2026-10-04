# 日志与缓存管理设计

## 对象分离

| 对象 | 本地位置/实现 | 处理方式 |
| --- | --- | --- |
| 服务运行日志 | data_dir/logs/service.log及编号归档；deploy/shared/service.py | 轮转、重复日志抑制、脱敏与到期归档清理 |
| 业务审计日志 | operation_logs表；native/operation_logs.py | 记录操作者与动作，依照业务保留期清理 |
| 匿名公开读取缓存 | 进程内PublicReadCache | 修订号失效、TTL、LRU与自适应内存预算 |
| 主站磁盘缓存 | 配置cache_dir；storage.py | 保存允许的元数据/审计报告等，按明确命名及到期规则处理 |
| 维护状态 | data_dir/maintenance | 保存游标、结果和互斥状态，避免每次全量扫描 |
| 快传离线文件与历史 | transfer_media_dir及快传任务表 | 独立的到期/配额/分批清理，不属于可任意删除的普通缓存 |
| Worker对象 | D1/R2绑定与平台日志 | 由Worker定时维护和存储适配处理；本地目录规则不能直接套用 |

所有路径取自运行配置，不能假设服务的当前工作目录就是数据目录。普通媒体库文件、当前数据库、活跃快传文件不属于可直接清空的日志缓存。

## 日志写入

`deploy/shared/service.py::main()`配置运行日志处理器、标准输出/错误与服务启动。`RuntimeLog`控制单文件大小、归档数量/期限，并抑制重复日志；写入日志本身失败时不递归记录失败，避免无限增长。

`backend/app/native/log_privacy.py`提供脱敏辅助；同步异常使用 `site_sync_diagnostics.py` 的阶段/诊断记录。日志中不应保存密码、共享密钥、会话令牌或整个请求正文。操作审计和运行异常分别记录，不用异常日志代替业务审计。

本地日志默认10MiB、5份编号归档、14天，读取已保存维护策略后可改变。这不等于整个数据目录只有固定大小；媒体、数据库和快传暂存有独立增长来源。

## 匿名读取缓存

`PublicSQL.query()`只包装已解析为匿名GET的公开读取，不缓存完整HTTP响应或登录会话，不缓存写入语句和认证表查询。缓存键包含SQL及参数，命中值反序列化返回，避免调用方修改共享对象。

`PublicReadCache`使用数据修订号使旧缓存失效；TTL到期/LRU驱逐。普通查询TTL30秒，含数据库时间表达式的查询TTL1秒。最多2048条缓存记录；每次写入拒绝过大的行集或正文，预算不足时不缓存。

`CacheBudget.limits()`每15秒重新探测内存，结合总量、可用量、WEB_CONCURRENCY和TEACHER_PUBLIC_CACHE_MB计算预算。后者默认32MiB、上限64MiB，设0可禁用；可用内存不足64MiB时读缓存预算归零。预算是每进程缓存上限，不是整个应用RSS上限，也不保证所有Worker冷启动开销消失。

## 清理策略与一致性

策略存于 `service_meta` 的 `runtime:maintenance-policy`，由 `backend/maintenance/policy.py::validate()`验证字段/范围，`load()`读取带版本的配置。

| 默认参数 | 值 |
| --- | --- |
| 自动维护间隔 | 15分钟 |
| 过期会话历史保留 | 30天；仅清理符合失效条件的记录 |
| 审计报告宽限 / 临时文件年龄 | 各24小时 |
| 操作日志 / 快传历史 | 180天 / 90天 |
| 日志文件大小 / 归档数 / 天数 | 10MiB / 5 / 14天 |

`backend/maintenance/runtime.py::Maintenance.tick(apply=False, batches=1)`默认仅预览。执行需显式 `apply=True`。数据库删除每类按最多200条批次处理，文件扫描使用游标和精确对象规则；执行前重新检查期限、锁、版本与引用条件。预览不是将来删除的无条件许可。

`History.tick()`处理日志/终结快传历史，保留活动任务和相关必要记录。媒体审计报告清理先删分页/计划，最后删状态；持久化游标允许后续继续。遇到未知对象、受保护任务或文件冲突，跳过或停止相应处理，不扩大删除范围。

本地调度由主站生命周期启动并在关闭时停止；快传到期清理由独立Maintenance处理。Worker Cron由 `deploy/cloudflare/runtime/entrypoint.py`、`maintenance.py`、`cleanup.py` 等适配，按分钟槽轮换快传清理、同步历史清理和同步推进；该Cron不等于本地Maintenance的全部会话/业务日志清理。运行时日志需同时查平台日志。

## 管理入口和关键函数

| 源码 | 入口 | 用法 |
| --- | --- | --- |
| deploy/shared/service.py | RuntimeLog、LogStream、main(argv=None) | 本地服务日志与启动，不直接在请求里反复安装日志处理器 |
| backend/app/native/operation_logs.py | Logs | 后台操作日志查询 |
| backend/app/native/public_cache.py | PublicReadCache.get/put/invalidate、PublicSQL.query | 仅在正确的匿名读取边界使用 |
| backend/app/resource_budget.py | CacheBudget.limits() | 返回缓存/模板预算，不能当作硬性系统内存限额 |
| backend/maintenance/policy.py | load(sql)、validate(value) | 读取和验证维护配置 |
| backend/maintenance/runtime.py | Maintenance.tick(apply=False, batches=1) | 预览或执行有限批次 |
| backend/maintenance/history.py | History.tick(apply=False, after='') | 带游标处理历史记录 |
| backend/maintenance/monitor.py | Monitor.snapshot(sql) | 提供运行监测快照 |
| backend/app/native/maintenance_admin.py | install(app, resources, csrf, render) | 安装受权限与CSRF保护的维护路由 |

VPS操作：`tweb paths`定位目录，`tweb logs`查看运行日志，`tweb cleanup-preview`预览，核对后使用`cleanup-run`，最后以`cleanup-status`查看结果。多实例使用该实例命令。不要通过手工递归删除data目录“清缓存”。
