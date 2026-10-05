# v0.15.172 最新候选读取专用初始化

本版完成简化业务初始化的第二步，针对“对端 → 本站 · 最新500项 · 读取最新候选”。没有改变对端协议或数据库结构，已有169–171任务无需重建游标。

## 本次实际减少的工作

旧 Worker 路径在轻量回执核对之后，加载通用资源模块与完整调度模块，再调用 `resource_factory`。新路径先读取任务的少量标志及已有授权，仅在确认符合条件后加载候选读取运行模块，并复用当前 SQL 对象。

专用资源上下文只有 `sql`、`kind`、空的 `passwords`占位、当前后台身份 `p` 和 `auth`。不创建或使用渲染器、Content/Media服务、媒体与缓存R2对象、学术查询和翻译适配器、网站来源配置或快传配置；密码登录/哈希不参与此后台任务。后台权限与事务写保护提取为共享模块，由完整路径和专用路径共同使用，避免维护两套不同授权规则。

专用运行模块的冷导入测试确认不加载 FastAPI、Jinja、Web、Content、Media、storage、完整调度或执行应用模块。核对对端条目存在性仍复用既有记录头读取实现；这一内部模块及部署快照中已预加载的定义没有在本步全部拆分或卸载。因此本版不声称整个 Worker 内存占用减少到某个值，也不保证所有1102都由此消失。

## 路由与兼容边界

| 情况 | 本版路径 |
| --- | --- |
| 现有任务为 reading / latest，latest_only和lightweight均开启，pull方向 | 可进入专用读取路径 |
| 手动只读授权有效，mode=read | 使用独立任务授权，不要求开启定时拉取 |
| 定时拉取策略有效，preview_uid指向该任务 | 使用定时策略；推进同一预览游标 |
| 回执仍为running且已逾期 | 仍先由170的SQL轻量核对处理，本轮不重放业务 |
| 新建任务、普通预览、准备子任务、媒体传输、执行、审批 | 使用原完整初始化路径 |
| 读取完成变为ready / complete | 本轮保存读取结果，下一轮回到完整路径处理选择、确认或后续阶段 |
| 路由判断之后任务阶段/授权已变化 | 放弃本轮，下一轮重新选择；不以最小上下文跨阶段执行 |

读取算法仍是原 `site_sync_latest.advance`：每轮读取一页摘要、挑选候选或核对一条对应记录。不根据截断列表推断删除，不重置已经读过的条目，不扩大最新500项范围。`advance_latest`复用原`advance`操作名的工作回执、租约、进度证据、资源降速与恢复规则，保持旧检查点兼容。

## 权限与并发

1. 路由SQL仅判断是否可选，并不授予权限。
2. 通过共享后台上下文核实管理员、角色、所有同步模块权限；执行锁继续使用原锁表与有效期。
3. 获取调度锁后再次核对任务、授权和路由条件。
4. 对专用路径中的工作回执、任务游标和候选表写入，在同一数据库事务加入当前授权/角色版本、模块权限、对端版本、任务范围及适用阶段的检查。定时任务额外检查调度状态未被替换，并防止接管已经登记手动授权的任务。
5. 包装后的数据库批次剥离新增保护语句的返回值，保持调用方原有返回索引与错误语义。没有移除原有任务租约或游标条件更新。
6. 读取期间发生暂停、权限撤销、对端配置变化或范围变化时，事务拒绝提交候选与游标；不覆盖后来保存的授权。

## 恢复与观测

保存游标后发生1101/1102，仍以持久化游标变化判定进展；有进展时不消耗连续无进展额度。强制终止留下running回执，下次符合条件的Cron先核对，再按冷却时间继续同一个任务。后台未到达、数据库不可用或后续业务步骤自身持续超限，仍需要结合阶段记录定位。

监控时间线中的专用路径通常为：核对步骤回执、检查候选读取专用路径、加载候选读取组件、创建候选读取最小上下文、授权、执行锁、业务步骤、保存结果。完整路径则保留通用资源模块及资源工厂阶段。耗时仍是包含I/O等待的墙钟耗时，不是CPU测量。

## 验证范围

分批回归覆盖98项不同的Python测试、2项相关前端测试，全部通过。

- 三种适配器组合的签名两站读取测试：本地/Worker、Worker/本地、Worker/Worker；每种都验证手动和定时授权。新旧路径候选内容完全相同，读取阶段没有写入业务表，通用资源工厂未调用，完成后可回到完整路径。
- 授权、模块权限、对端版本、暂停与任务范围在读取中变化时，事务不提交过期候选或游标。
- 保存进度后的1101/1102、强制终止→回执核对→同一游标继续、有效执行锁及阶段变化保护。
- 冷导入依赖、最小上下文对象、原恢复机制、后台授权、完整定时路径及阶段显示回归。

这些是代码与适配器测试，不是线上Cloudflare免费套餐的CPU/内存配额实测。本版尚未部署到线上站点。

## 修改清单

相对171新增或修改18个文件（含重新生成的发布清单）：

```text
backend/app/native/site_sync_background.py            新增：共享后台授权
backend/app/native/site_sync_initialization.py
backend/app/native/site_sync_latest.py
backend/app/native/site_sync_latest_gate.py           新增：轻量路由判断
backend/app/native/site_sync_latest_runtime.py        新增：专用读取运行路径
backend/app/native/site_sync_schedule.py
backend/app/native/site_sync_tasks.py
deploy/cloudflare/runtime/sync_schedule.py
deploy/cloudflare/tests/test_sync_initialization.py
docs/reference/site-sync.md
docs/reference/sync-latest-runtime-v172.md             新增：说明与清单
frontend/admin/static/js/native-site-sync.js
frontend/admin/templates/native-site-sync.html
pyproject.toml
tests/site-sync-dom.test.cjs
tests/test_site_sync_v123.py
tests/test_sync_latest_runtime_v172.py                 新增：专项测试
release-manifest.json
```

下一步继续按阶段拆分媒体传输与内容写入的资源初始化；尚未优化的阶段不使用本版只读资源上下文。
