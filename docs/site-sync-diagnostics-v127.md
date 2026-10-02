# v0.15.127：同步优化第一步——准确诊断

本版只完成第一步，不改变同步协议、数据库结构、分页大小、审批规则或媒体删除顺序。连接测试仍读取业务版本；轻量连接测试与减少重复扫描留待后续步骤。本版不能单凭新增诊断就宣称线上数据库故障已经消除。

## 用户可见变化

- 复用后台顶部通知和原页面状态区，不新增弹窗或另一套日志界面。
- HTTP 失败统一显示本站接口状态和操作阶段（例如 test、start、advance）。兼容 error 字符串、error.message、detail、detail.message、title 和 message，保留对端错误及诊断编号。
- Cloudflare 的错误码和 Ray ID 可显示；非 JSON 响应明确提示检查本站服务或代理。验证错误数组不展示可能含用户输入的 input 内容。
- 对端异常里的 Ray ID、本站响应的 Ray ID 与服务端诊断编号分别标记，避免混淆。

## 服务端诊断

复用 `site_sync_diagnostics.operation`，增加小型异步装饰器和请求上下文。连接测试、任务开始、版本读取、分页读取、快照写入和差异生成使用同一诊断入口。嵌套阶段只生成一次异常日志及编号。

分类覆盖缺表/字段、查询数量、参数数量、配额、字段/语句大小、超时、过载、锁定、参数类型及 SQL 兼容性；未识别的问题保持通用类别，不误报为确定的性能超限。Pyodide 保存在 JS cause 中的错误用于分类，不原样输出。

D1 适配器只在同步操作失败时附加 SQL SHA-256 短标识、参数数量和批次语句数，不输出 SQL 正文、绑定参数、异常原文或密钥。没有新增数据库探测/查询，没有改变事务批次上限。原有约束冲突的 409 语义保留。

## 更新后如何排查

两站更新代码；浏览器刷新同步页面，脚本版本号已更新以避免使用旧缓存。先各点击一次测试连接，再提供新提示。

- 接收端有“服务端诊断编号”时，在对应 Worker 日志搜索该编号，查看 operation、code、exception、frames、database。
- Ubuntu 查看 `sudo tail -n 100 /opt/teacher-site/data/logs/service.log`；必要时 `sudo journalctl -u teacher-site.service -n 100 --no-pager`。
- SQL 标识用于对照代码中的语句；它不是数据库记录编号，也不包含参数值。
- 没有进入应用的 Cloudflare 拦截或代理错误，只能依靠 HTTP 状态、Ray ID 和平台日志，应用无法为它生成服务端诊断编号。

不要为了这一版重置数据库或清空媒体。本版不调整 Cloudflare 统计脚本的 CSP。

## 修改文件

| 路径 | 用途 |
|---|---|
| `frontend/admin/static/js/native-site-sync.js` | 完整解析 HTTP 错误，复用原通知 |
| `frontend/admin/templates/native-site-sync.html` | 更新脚本缓存版本 |
| `backend/app/native/site_sync_diagnostics.py` | 共用分类、阶段、上下文与有界诊断 |
| `backend/app/native/site_sync_transport.py` | 对端嵌套 message 与平台 instance/Ray ID 兼容 |
| `backend/app/adapters/d1/sql.py` | 失败查询/批次标识，保留事务行为 |
| `backend/app/native/site_sync.py` | 版本与分页读取阶段标识 |
| `backend/app/native/site_sync_tasks.py` | 连接、任务及快照写入阶段标识 |
| `tests/test_sync_diagnostics_v127.py`（新增） | 分类、无敏感数据、单次日志及事务回归 |
| `tests/site-sync-dom.test.cjs` | HTTP、平台、JSON、嵌套错误显示回归 |
| `pyproject.toml`、`README.md`、`release-manifest.json` | 版本、说明及发布完整性 |
| `docs/site-sync-diagnostics-v127.md`（新增） | 本文 |

下一步：把连接测试与业务版本读取分开；同步预览仍保留严格数据检查，两站需配套更新。

验证：86 项后端回归及 Worker 启动检查、11 项 DOM 界面检查通过。使用隔离数据库和模拟网络；未操作生产站点。
