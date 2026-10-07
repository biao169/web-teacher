# 第二步：数据库、适配器和部署入口

本步只基于第一步的新设计实现，没有使用旧版网站源码。

## 文件

- database/schema.sql：唯一初始化 SQL，7 个同步表和到期任务索引。
- site_sync/adapters/sqlite.py：有界事务、查询及真实本地备份。
- site_sync/adapters/d1.py：D1 prepared statement/batch，按需进行 Python/JS 数组转换。
- site_sync/adapters/staging.py：分片插入、累计字节和进度原子更新。
- site_sync/deploy/schema.py：从唯一 SQL 编译结构、核对、原子初始化和明确迁移。
- site_sync/deploy/database.py：SQLite CLI、D1 部署计划生成及内部 provisioning 函数。
- site_sync/tests/test_database.py：数据库与 D1 接口替身验证。
- site_sync/tests/verify.py：累计测试与真实 CLI 冒烟验证。

## 支持和限制

这是独立模块的 schema revision 1。自动初始化和重复部署可直接运行。
明确版本迁移框架已通过合成版本验证；当前没有声明任何旧网站格式为已知前身。
遇到未知 sync_* 表会保留并停止，不会读取旧源码推测、重置数据库或覆盖业务内容。
与网站的一键部署、后台授权、调度和正式业务表集成仍分别在后续步骤完成。

SQLite 测试是真实数据库。D1 测试通过 SQLite 支撑的 binding 替身执行同一组 SQL，
验证事务意图、响应丢失和调用形状，不模拟 D1 服务、Pyodide FFI、云端 CPU/内存或计费。
D1 正式行为和资源限制仍需在独立测试数据库实测；本步未部署任何云端资源。

所有迁移须能在一个有界批次内完成。无界大表转换不属于本步已实现范围。
正式部署先暂停同步写入，迁移完成核对后再切换；普通网页请求不运行 DDL。

测试覆盖：初始化/检查/重复部署、保留业务表和备份、未知结构拒绝、DDL 失败回滚、
合成版本升级、响应丢失、同片幂等重试、冲突/缺口、缩片/多字段、租约/授权/来源守卫、
200000 字节记录边界、外键、旧运行时拒绝新 schema。累计结果见 step2-results.json。

官方接口依据（2026-10-05）：
- https://developers.cloudflare.com/d1/worker-api/d1-database/ （batch 原子执行与失败回滚）
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/
- https://developers.cloudflare.com/workers/languages/python/ffi/

下一步：实现单任务执行器和租约领取，将正文暂存、真实授权检查、持久化进度与恢复策略接通。
