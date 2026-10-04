# v0.15.148：第二步，Worker 定时入口减负

## 生效内容

- 复用 `site_sync_gate.py` 的策略读取和活动任务查询。在构造同步资源前检查启用状态、重试等待、活动任务及自动拉取到期时间。
- Worker 每次 Cron 只运行一个类别：每小时分钟个位为 0 时处理快传清理、为 1 时处理同步历史，其余分钟推进同步。使用事件 scheduledTime，不依赖内存计数。请保留部署配置的 `* * * * *`，自定义稀疏 Cron 可能错过某一类别。
- 历史自动清理每次最多删除一个明细行，沿用超过10条/7天及活动任务、待批准、准备依赖保护规则。积压清空更慢；管理页面手动删除仍使用原批量。
- 清理失败不会在同一调用继续同步；后续其他分钟独立运行。同步异常使用现有阶段日志记录并向 Cron 报错，业务任务继续使用已有检查点。
- 正在执行的已确认任务可以在自动拉取关闭或尚未到期时继续推进；整个后台推进关闭或处于重试等待时跳过。
- 本地 Ubuntu/Debian 调度节奏保持原样。数据库结构、签名、审批、媒体传输协议不变。

## 更新

本补丁基于 v147。按压缩包内相对路径覆盖项目文件，然后重新部署 Worker；Ubuntu/Debian 更新源码并重启服务。不需要初始化或重置数据库。增量包不会覆盖独立 v146 多实例部署脚本或教师页面模板。

本次只完成第二步，并不保证消除所有1101/1102。资源工厂、单次SQL和单条大记录的成本仍需后续优化。第三步实现每轮仅取最新500项，并保证未选中的旧条目不被视为删除；目前超500停止逻辑仍在。媒体仍使用64 KiB分片。

## 文件清单

- backend/app/native/site_sync_gate.py（新增，轻量门控）
- backend/app/native/site_sync_apply.py（复用活动任务查询）
- backend/app/native/site_sync_schedule.py（复用策略读取，允许独立历史维护）
- backend/app/native/site_sync_history.py（可配置有界清理数量）
- deploy/cloudflare/runtime/maintenance.py（新增，单类别轮转）
- deploy/cloudflare/runtime/entrypoint.py（接入轮转）
- deploy/cloudflare/runtime/sync_schedule.py（先门控，再构造资源）
- deploy/cloudflare/tests/test_sync_schedule.py（门控和轮转测试）
- tests/test_sync_gate_v148.py（新增，轻量导入和单明细清理测试）
- pyproject.toml、README.md、本说明

## 验证

覆盖禁用、未到期、退避、已确认任务、预览继续、独立清理、异常不串行追加、历史保护与恢复、资源生成。仅本地临时数据库和模拟 Worker 环境验证，未进行 Cloudflare 线上资源基准测试。
