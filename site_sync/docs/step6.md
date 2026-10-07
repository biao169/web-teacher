# 第六步：共享后台管理模块

本步在第五步独立模块上继续开发，没有参考 v0.15.181 或其他旧网站代码。
提供可嵌入现有后台的页面片段、样式、交互和 ASGI 接口；不是另一套账号系统。
当前没有完整教师网站源码，因此尚未将片段实际挂载到线上后台。

## 新增与修改

| 路径（相对 site_sync） | 内容 |
| --- | --- |
| admin/service.py | 登录账号对应授权、任务分页/详情、手动创建、批准、暂停/继续/取消、参数修改、计划编辑 |
| admin/asgi.py | 可挂载 ASGI 接口，宿主提供登录鉴权和 CSRF 校验 |
| admin/templates/panel.html | 现有后台 content 区域的 HTML 片段 |
| admin/static/panel.css、panel.mjs、model.mjs | 局部样式、交互、状态和时间格式化 |
| admin/retention.py | 有界历史清理，逐条处理，不删除业务和外部媒体 |
| adapters/tasks.py | 管理命令与当前授权在同一事务中再次校验 |
| runtime/service.py、local.py、worker.py | 执行器空闲时自动清理到期元数据，保留天数可由部署配置设置 |
| tests/test_admin.py、admin/static/model.test.mjs | SQLite/D1 替身权限、并发、分页、保留和显示测试 |
| tests/browser_admin.cjs、ui_fixture.py | 浏览器交互测试及仅回环的测试夹具 |

## 管理功能

- 所有列表和详情显示完整任务 ID；计划显示最近关联任务 ID。
- 活动任务与历史任务分开；每页 50 项，游标分页，不读取正文 BLOB。
- 区分执行中、待调度、人工批准、慢速重试、暂停、取消清理、完成。
- 运行任务租约已到期时显示“执行中断，等待恢复”，不误报仍在执行。
- 同时显示连续无进度失败次数、累计错误次数、持久化推进次数及媒体已确认字节。
- 手动拉取先预览，再勾选条目批准；候选按页加载，跨页保留选择。
- 暂停/继续/取消调用现有执行器命令，不在后台 GET 中推进任务。
- 重试次数 0..1000、正文切片 256..65536 字节、慢重试间隔 60..86400 秒。
- 参数保存须无活动租约，且校验修订号；并发变化返回冲突，不覆盖新设置。
- 参数只修改当前任务，不改变进度、累计错误或下一轮计划默认参数。新任务仍采用平台默认值。
- 定时计划可新增、修改周期/范围及启停；修订号避免并发编辑覆盖。
- 停用计划只影响未来调度，不暗中取消已有任务。
- 浏览器新建任务与新建计划发送稳定 request_id；同一请求重试不会重复创建。

## 身份与接口

Actor 仅由服务器从现有登录会话构造，包含 principal_id、grant_id 和管理权限。
接口不接受浏览器自报 grant_id、principal_id 或权限。授权归属在数据库中核对。
已撤销授权的原所有者，在宿主仍允许查看同步后台的前提下，可以查看自己的历史；不能继续修改。
读写均限制到当前授权下的任务/计划，不额外创建跨账号超级管理员旁路。

AdminASGI 构造必须传入两个 async 回调：

```python
admin = Admin(Tasks(db, platform=platform), clock, retention_days=90)
app = AdminASGI(admin, authenticate_from_existing_session, verify_existing_csrf)
```

- authenticate_from_existing_session(scope) 返回服务器构造的 Actor；无权限时拒绝。
- verify_existing_csrf(scope, actor) 使用现有后台 CSRF token 和同源校验，返回 bool。
- 不能用请求 JSON、自报 HTTP 身份头、配对密钥替代网站用户会话。
- 默认路径前缀 `/admin/site-sync/api`；若宿主挂载后剥离前缀，可设置 prefix=""。
- 所有响应 no-store；所有写操作 POST + JSON + CSRF；不开放跨域管理接口。
- 请求体上限 64 KiB，分页有上限，失败响应不输出异常栈、SQL、路径或密钥。
- 服务层可被非 ASGI 网站的已鉴权控制器直接调用；CSRF/会话仍由该宿主负责。

GET：options、tasks、tasks/{id}、tasks/{id}/items、schedules。
POST：tasks、tasks/{id}/{confirm|pause|resume|cancel|settings}、schedules、retention。
具体参数与返回字段以 admin/service.py 和 asgi.py 为准；没有公开的迁移或 SQL 执行入口。

## 嵌入现有后台

1. 在原后台路由层完成登录/角色判断，再挂载 API；保持现有导航、登录和权限体系。
2. 将 admin/templates/panel.html 加入原模板 loader，include 到现有后台 base 的内容区。
3. 将 admin/static/ 映射到同源只读静态路径，例如 `/static/site-sync/`。
4. 原后台页面加载 panel.css 与 `type="module"` 的 panel.mjs；后者相对导入 model.mjs。
5. 原页面提供 `<meta name="csrf-token" content="经模板自动转义的当前会话 token">`。
6. 若 API 路径不同，修改片段的 data-api；JS 拒绝跨源 API。

不覆盖现有 base.html，不创建第二套登录页，不自动修改网站其他后台路由。
真实网站的模板块、静态资源路由、账号到授权的映射，须依据当前源码连接后验收。

## 时间与刷新

所有数据库时间继续保存 UTC epoch 秒。列表、详情和计划统一使用 Asia/Shanghai，
不依赖操作者电脑时区；页面明确标注 UTC+08:00。
默认 15 秒刷新第一页任务及已打开任务摘要；失败逐步退避至最多 120 秒。
隐藏标签页停止轮询，恢复可见后刷新；不堆叠轮询请求。
加载了更多任务页时暂停列表自动替换，避免分页阅读跳动；详情摘要仍可刷新。
候选选择和参数编辑不被轮询重置。参数修订号保持读取时快照，并发变化要求重新打开详情。
自动刷新目前只更新任务列表与详情摘要；计划列表通过手动刷新/计划操作更新。

## 留存与边界

默认保留已结束任务 90 天；本地配置 history_days、Worker 变量 SYNC_HISTORY_DAYS 可设置 7..3650 天。
后台 Admin.retention_days 必须使用相同配置。页面显示保留期限，不能自行指定任意删除日期。
自动清理只在执行器没有可推进任务/到期计划时进行；后台也可请求清理一条到期元数据。
每次最多删除一个子记录，或最后删除一个空任务及解除计划的历史引用，不大批级联清库。
运行、等待、暂停、尚未安全清理媒体的任务不会删除；有效任务进度不是清理对象。
空闲不足时历史回收会滞后，这不是数据库大小的绝对硬上限。

只删 sync_* 历史元数据，绝不删除已同步业务记录、对象存储文件或本地媒体。
已发布媒体的真实引用由网站业务表负责；将来做孤儿扫描时，不能因历史任务被删除就认定媒体无主。
历史删除后，对应 operation_id 的幂等保留窗口也结束；不要将它当永久去重账本。
本地运行日志仍沿用第五步的轮转上限。数据库 schema 保持 4，唯一初始化 SQL 未增加。

## 验证与未完成的整站接线

step6-results.json 记录完整自动验证。覆盖 SQLite 与 D1 绑定替身、越权/CSRF、参数边界、
修订冲突、授权撤销竞态、请求幂等、分页、保留清理、统一时间和慢重试显示。

浏览器测试启动时发现 Chromium 可执行文件缺失，尚未完成真实浏览器交互/视觉验收。
测试脚本已保留；在装好 Playwright/Chromium 的开发环境可运行：

```sh
node site_sync/tests/browser_admin.cjs
```

测试夹具只有固定测试账号，只能作为测试使用，不能部署替代网站鉴权。
没有真实 Cloudflare、整站账号/角色、真实媒体引用或前台响应延迟的验收结论。

下一步第七步：使用当前完整网站源码和测试部署环境，完成后台/复杂业务映射接线、
真实双端故障恢复、浏览器交互、Worker CPU/内存与前台响应验证。
