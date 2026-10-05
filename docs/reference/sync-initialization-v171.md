# v0.15.171 同步初始化链路：梳理与阶段记录

本版完成“简化业务初始化”的第一步：确认实际调用关系并增加可持久化诊断。尚未部署到真实 Worker；以下依赖关系来自源码检查，不是线上 CPU、内存或阶段耗时的实测结论。

## 已确认的调用关系

| 顺序 / 阶段 | 源码位置 | 实际工作与边界 |
| --- | --- | --- |
| 部署快照预加载 | `deploy/cloudflare/runtime/snapshot.py` | 预加载 Web、渲染器、学术与翻译、快传及部分同步定义。部分后续导入已命中模块缓存，不能把整个静态依赖图视为每轮重复初始化成本。 |
| Cron 入口 | `deploy/cloudflare/runtime/entrypoint.py` | 加载环境桥接、维护调度及 D1 适配器，再取得绑定并创建数据库适配器。D1 适配器本身引用字段注册与已有同步诊断；这不是完全脱离业务定义的原始 SQL 入口。 |
| 维护任务选择 | `deploy/cloudflare/runtime/maintenance.py` | 按事件分钟对10取余：0处理快传、1清理历史、2–9推进同步。并非每次 Cron 都会进入同步调度。 |
| 资格筛选 / 轻量核对 | `backend/app/native/site_sync_dispatch.py`、`site_sync_recovery.py` | 保存调度到达、选择任务、检查等待条件；逾期 running 步骤先通过 SQL 条件更新核对回执，不需要创建完整资源。未进入 running 核对的任务继续初始化业务。 |
| 通用资源模块加载 | `deploy/cloudflare/runtime/sync_schedule.py` → 生成的 `worker_runtime/resources.py` | `deploy/cloudflare/resource_module.py` 复制 `backend/entrypoints/worker.py`，只移除末尾创建 HTTP app 的两行。其余导入和模块级 `Renderer.bundled(TEMPLATES)` 仍执行，包含模板环境创建。 |
| 同步业务模块加载 | 同一调度入口 → `backend/app/native/site_sync_schedule.py` | 导入 Auth、同步核心、任务与应用执行模块等。已有快照可能已加载部分或全部定义，本版记录导入前是否存在于模块缓存。 |
| 资源对象创建 | `backend/entrypoints/worker.py::resource_factory` | 构造 Settings、认证配置、密码组件、D1 与媒体/缓存 R2 对象、Crossref 与翻译适配器、翻译配置和快传配置等；随后后台用已有 SQL 对象替换新建的 SQL 对象。创建适配器对象不等于发起学术或翻译网络请求。 |
| 调度选择 | `site_sync_schedule.py::tick` | 选择手动/定时任务、复核策略和冷却；本地循环还可能清理历史。Worker 历史清理已有单独时隙。 |
| 授权与同步上下文 | `site_sync_schedule.py::context` | 读取管理员及角色版本、权限，创建 BackgroundAuth、Content、Media 上下文，核实各同步模块权限。定时任务随后还核实对端版本。 |
| 执行锁与任务绑定 | `site_sync_manual.py::tick`、`site_sync_schedule.py::tick` | 获取调度执行锁并复核任务绑定/状态，维持现有并发及权限边界。 |
| 业务步骤 | 上述 tick → step | 读取一批候选、执行传输或推进已确认写入等；业务内部原有检查点、任务锁与验证继续执行。 |
| 调度结果保存 | 同上 | 保存手动授权进度或定时调度状态，最后提交本轮调度回执。 |

## 记录方式

- 任务调度记录继续使用 `service_meta` 的 `site-sync:scheduler-attempt:<任务ID>`，尚未创建任务时使用 `...:scheduled`。无需新增表或执行数据库迁移。
- `initialization.stages` 最多12项；正常完整 Worker 路径9项。本轮结束后保留本轮记录，下轮只额外保留上一轮最后阶段和最慢已结束阶段的摘要，不累计无界日志。
- 每项包括阶段名称、开始记录时间、状态，以及在有返回时的结束时间与耗时。模块加载阶段还记录 `module_cached`，表示导入前该模块是否已存在于当前 Python 实例的模块缓存；不表示整个依赖图都没有成本。
- 在进入下一阶段前，先通过原调度回执的条件更新持久化下一阶段标记，同时保存上一阶段结果。若 Worker 突然终止，数据库仍保留最后一次成功保存的阶段标记；没有结束记录时不生成耗时数值。
- 捕获到普通异常时记录异常类型，不复制异常原文、URL、凭据、SQL、任务正文或局部变量。仍沿用原任务 ID、调度轮次 token、重试规则及授权状态。
- 本地后台已有常驻资源，因此通常从“选择调度任务”开始，不虚构资源模块加载或工厂创建阶段。普通前台 HTTP 调用未绑定后台记录器，不额外写这些诊断记录。
- 监控读取仍使用现有有界查询，不增加每阶段轮询或读取完整业务数据。所有展示时间复用后台统一时区格式。

## 耗时与诊断开销

阶段耗时使用单调时钟，表示墙钟时间，包含该阶段自身的数据库、网络等待，**不等于 CPU 时间，也不测量内存峰值**。

正常阶段在其开始标记确认写入后计时，因此已完成的阶段标记写入不计入该阶段耗时；这些写入单独累计为 `record_write_ms`。本轮合计包括诊断开销和阶段之间的间隙，不能把阶段耗时之和直接当成本轮合计。开始时间是阶段标记时间，与真正开始执行之间可能存在这次持久化等待。标记写入本身失败时，失败阶段用于定位诊断存储问题，不能用于估计原业务阶段的执行成本。

相较 v170，正常完整 Worker 业务轮次增加8次短元数据条件更新；本地正常业务轮次增加5次；只做轻量回执核对的轮次不增加阶段切换写入。每阶段结束结果合并到下一个阶段的开始更新或原有最终回执，不为开始和结束各写一次。最多12个阶段构成记录上限，避免诊断本身形成无界循环。`record_write_ms`只统计阶段切换写入，不包括原有的初始/最终调度回执写入。

诊断写入失败会中止本轮并进入原独立调度退避，保留任务检查点及手动授权；调度回执所有权已变化时放弃旧轮次，避免诊断冲突被误判为永久业务失败。

## 如何判断新的停滞

| 最新证据 | 可判断内容 | 尚不能判断的内容 |
| --- | --- | --- |
| 没有同步调度到达记录 | 同步调度没有成功写入到达记录 | 不能直接断定 Cron 未配置；也可能入口或数据库阶段先失败 |
| 平台日志最后是 `CRON-MODULES` / `CRON-DATABASE` 开始 | 失败发生在持久化同步调度记录之前 | 无数据库连接时无法保证把这些阶段写回数据库 |
| 最后阶段为“加载通用资源模块”且无完成记录 | 该模块入口已被尝试，未成功保存下一阶段记录 | 不能区分模块内部哪一个导入或模板构造超限，也可能结束记录保存失败 |
| 模块加载已完成，资源对象创建未完成 | 可把检查范围缩小到资源工厂或后续阶段记录写入 | 不能据此断言对象占用内存具体多少 |
| 授权阶段返回失败 | 可结合异常类型、原任务/授权错误检查权限和对端变化 | 不应放宽授权来绕过该错误 |
| 业务阶段未完成或耗时明显大 | 后续优化应检查对应任务阶段中的查询、解析、传输或写入 | 仅靠精简初始化不一定能解决业务步骤本身的超限 |

“未收到阶段完成记录”不意味着该进程仍活着；可能已终止，也可能仍在执行。继续依赖既有租约、恢复时间和后台退避判断何时允许恢复。

## 下一步：最新候选读取专用路径

优先针对用户停滞的“读取最新候选”建立只需要数据库、签名传输、必要校验、任务锁与分页检查点的专用资源路径。候选裁剪对象包括模板环境、Web 依赖、学术/翻译配置及适配器、未使用的媒体/缓存资源，以及重复创建后立即替换的 SQL 对象。是否能独立延后加载，要逐项核对实际调用依赖。

本版没有执行这一步，也没有取消授权、数据校验、租约、审批和断点保存；171部署后的阶段记录可用于确认应优先裁剪哪一处。

## 验证与修改清单

选定回归共56项 Python 测试、54项前端测试通过。覆盖模块导入异常/强制终止、阶段标记先于执行、权限撤销、诊断写入失败不关闭授权、调度记录条件更新冲突、上下文隔离、记录数量上限、计时排除已确认标记写入，以及旧任务恢复与页面安全展示。测试使用本地/适配器替身，不是线上 Worker 配额实测。

相对 v170 新增或修改16个文件（含打包时重新生成的发布清单）：

```text
backend/app/native/site_sync_dispatch.py
backend/app/native/site_sync_initialization.py       新增
backend/app/native/site_sync_manual.py
backend/app/native/site_sync_schedule.py
deploy/cloudflare/runtime/entrypoint.py
deploy/cloudflare/runtime/sync_schedule.py
deploy/cloudflare/tests/test_split_loading.py
deploy/cloudflare/tests/test_sync_initialization.py  新增
docs/reference/site-sync.md
docs/reference/sync-initialization-v171.md            新增
frontend/admin/static/js/native-site-sync.js
frontend/admin/templates/native-site-sync.html
pyproject.toml
tests/site-sync-dom.test.cjs
tests/test_sync_initialization_v171.py               新增
release-manifest.json
```
