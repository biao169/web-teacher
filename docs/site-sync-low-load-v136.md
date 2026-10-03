# v0.15.136：统一低负载同步第四步（阶段交付）

## 已实现

| 处理 | 每次推进及保存位置 |
| --- | --- |
| 确认选择 | 1条选择项或1个媒体候选；复用预览引用图，保存 begin_plan 游标 |
| 本站版本清单 | 最多20条UID/更新时间，保存到现有 sync_task_items |
| 写入准备 | 每次规范化1条所选记录；复用 data_restore.normalize_record |
| 关联校验 | 每次1条，精确查找关联目标；保存模块与记录游标 |
| 媒体下载 | 沿用64KiB分片、签名和版本检查 |
| 媒体合并 | 每次最多4个输入流，分层合并；确定性对象键支持重试 |
| 摘要和发布 | 独立推进；R2用原生DigestStream，文件正文不进入Python整块内存 |
| 暂存清理 | 每次最多4个原分片或合并对象，持久化清理游标 |

本地文件以64KiB缓冲流式复制及摘要计算；R2采用FixedLengthStream连接原生对象流，条件写入避免覆盖既有对象。合并后的文件仍是单个媒体对象。合并层级增大会增加存储读写及短期暂存占用，请求次数也增加。单媒体20MiB、单任务100个/24MiB限制保留。

规范化结果保存在 `@write:<table>` 临时任务行，版本清单在 `@expected:<table>`，关联查找在 `@planned:<table>:<field>`；不增加业务表。最终事务直接从任务行读取准备好的数据，避免Python重新装载全部正文。审批、角色权限、前置数据变化检查、媒体版本检查和事务回滚仍生效。事务中发现本站内容变化返回409，提示重新预览。

## 尚未完成的边界

这不是第四步全部完成或线上1102已解决的声明：

1. 最终内容提交仍是一个原子事务，提交前的对端完整版本核对和媒体HEAD检查仍集中执行，以保留现有外键和唯一约束一致性。
2. 永久删除仍使用原有引用扫描和删除方法。自动审批拒绝了将这一路径改为分页证明的改写，原因是该实现涉及引用校验及不可逆删除，当前测试证据不足。本版已恢复原有 media_audit.py 和 media_references.py，不降低其保护。
3. 原生R2流经模拟绑定验证，尚未在真实Worker/Pyodide部署验收；不能据此保证实际CPU耗时、流取消行为和所有平台限制。
4. 本地流式摘要及最终复制仍在单次请求完成，内存受控但总工作量随文件大小增长。Python任务状态仍包含精简差异和选择项，不代表所有操作均为恒定CPU成本。

## 待批准的永久删除改造方案

目标仅为分批化现有引用检查，不放宽“仍被引用不能删除”。拟复用现有引用解析规则、任务行和租约：

- 内容事务完成时原子更新本任务预期UID/更新时间清单。
- 删除前逐页扫描现存引用，保存模块、记录和候选媒体；存在引用或解析失败即停止。
- 真正删除前在同一数据库事务检查扫描期间业务版本未变化，并复用现有删除意图、文件版本和恢复路径；证明过期必须重扫，不能直接沿用。
- 保留每次删除仅1个媒体，不扩大删除范围。
- 必须补足并发新增引用、扫描中断、证明过期、数据库提交失败、磁盘删除后响应丢失及Worker绑定回归后，才能替换原路径。

该方案本版未实施，需就自动审批拦截的具体改造获得批准后继续。

## 更新使用

版本0.15.136；两端建议配套更新。读取协议仍为6，本地任务格式升级为7。**先完成或取消旧版实际同步任务，再更新代码并重新生成预览**。不要通过重置数据库解决任务格式问题。表结构不变，无需初始化或迁移。

继续任务会使用已保存阶段；重新开始/自动退避等第五步界面增强不在本次范围。部署脚本仍保留v132跳过源码完整性校验行为。

## 验证

测试结果见随包 `docs/site-sync-v136-tests.json`。覆盖真实隔离SQLite/本地文件、D1/R2适配器模拟绑定、丢失响应重试、错误摘要不发布、目标文件不覆盖、事务冲突回滚、审批及后台调度、DOM提示。未访问生产站点或修改线上数据。

## 相对项目根目录的改动路径

新增：
- backend/app/native/site_sync_execute_plan.py
- backend/app/native/site_sync_stream.py
- tests/sync_stream_bindings.py
- tests/test_sync_execution_v136.py
- docs/site-sync-low-load-v136.md
- docs/site-sync-v136-tests.json

修改：
- backend/app/native/data_restore.py
- backend/app/native/site_sync_apply.py
- backend/app/native/site_sync_media.py
- backend/app/native/site_sync_work.py
- backend/app/native/site_sync_admin.py
- backend/app/native/site_sync_tasks.py
- frontend/admin/static/js/native-site-sync.js
- frontend/admin/templates/native-site-sync.html
- tests/test_site_sync_v121.py
- tests/test_sync_execution_v130.py
- tests/test_sync_handshake_v128.py
- tests/test_sync_platform_v131.py
- pyproject.toml
- README.md

打包工具还会重新生成发行清单等派生元数据；不修改安装时跳过校验的策略。
