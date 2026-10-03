# v0.15.137：完成第四步调整——媒体删除不跨站传播

## 最终规则

- 来源没有、目标站存在的媒体不生成删除差异；不参与勾选、依赖闭包、推送提案和后台定时删除。目标站保留其数据库登记和磁盘/R2文件。
- 新增/更新内容的媒体仍先下载、分组流式合并及校验，再提交内容引用。例如a替换成b：先准备b，再更新教师/新闻引用，目标站a保留。
- 来源媒体登记存在而文件缺失/长度不符仍视为异常：保存失败阶段，暂停相关同步；恢复来源文件后可重试，版本或业务内容变化则重新预览。
- 教师、学生、新闻等非媒体业务条目的删除仍按选中项及必要依赖执行。
- 本站管理员在媒体库手动彻底删除时，仍实际删除数据库登记和磁盘文件/R2对象，并保留原引用检查。media_audit.py和media_references.py与v136一致。
- 取消同步可以清理本任务创建、尚未登记且版本未变化的暂存文件；这不是跨站传播业务媒体删除。

因此删除了同步执行器中的永久删除阶段及专用队列、游标、前端删除计数；不再需要v136待批准的“永久删除扫描分批化”方案。第四步按用户更新后的范围完成，无需新增墓碑表、迁移或重置数据库。

## 与分批执行的关系

保留v136逐条准备/关联校验、64KiB下载、每次最多4个流合并、每批最多4个暂存对象清理及断点保存。版本元数据每批20条。

最终业务提交仍是一笔原子事务，最后的对端版本和目标媒体检查仍集中执行；本地最终文件复制/摘要为流式但不是跨请求切片。因此单次CPU成本并非完全固定，也不承诺消除所有1102。真实Worker/Pyodide资源消耗仍需部署验收；本轮未访问生产站点。

## 更新

**两端配套更新至v0.15.137**：协议从6升为7，防止旧站使用媒体删除规则；本地任务格式从7升为8。更新前完成或取消旧执行任务，更新后重新预览，不直接继续旧任务。数据库表结构不变。源码完整性校验继续按v132策略跳过。

没有删除墓碑：若以后反转同步方向，仍保留媒体的一端成为来源，它的媒体可能被当作新增重新同步。可以不勾选该媒体；这是“不传播删除”的预期结果。

第五步仍为继续/重新开始/取消等交互以及有上限的重试与退避策略，本版未提前实现。

## 修改路径（相对项目根目录，相对v136）

业务代码：
- backend/app/native/site_sync.py：共用差异计算忽略目标独有媒体；同步/异步预览复用。
- backend/app/native/site_sync_analysis.py：删除不再适用的媒体删除阻止状态。
- backend/app/native/site_sync_apply.py：移除永久删除执行器，提交后进入暂存清理。
- backend/app/native/site_sync_execute_plan.py：移除媒体删除计划，拒绝旧的媒体删除选择项。
- backend/app/native/site_sync_work.py：协议7、任务格式8。
- backend/app/native/site_sync_admin.py、site_sync_tasks.py：版本提示。
- frontend/admin/static/js/native-site-sync.js：删除过时阶段与计数。
- frontend/admin/templates/native-site-sync.html：说明媒体保留规则及升级脚本版本。
- pyproject.toml、README.md：版本和教程。

测试更新：
- tests/test_site_sync_v120.py
- tests/test_site_sync_v121.py
- tests/test_site_sync_v123.py
- tests/test_sync_analysis_v135.py
- tests/test_sync_execution_v130.py
- tests/test_sync_handshake_v128.py
- tests/test_sync_platform_v131.py

新增：tests/test_sync_media_retention_v137.py、本说明及site-sync-v137-tests.json。

测试覆盖目标独有媒体、引用替换、双向预览、非媒体删除、后台调度、推送审批、协议拒绝、缺失文件恢复、原有手动彻底删除、界面提示。D1/R2使用实际适配器配模拟绑定，不等同于线上验收。结果见随包JSON。
