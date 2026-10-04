# 文件互传设计

## 目标与接入

文件互传复用主站账号、角色、CSRF与数据库，在 `/transfer/` 提供用户界面，在 `/admin/transfer` 提供嵌入式管理工作区。主站本地入口由 `transfer/backend/integration.py::install(app, resources, root)` 安装；不要启动已停用的独立监听入口。

本地文件由 `DurableStore` 管理，数据库保存任务、偏移和配额记录。Worker的快传请求经 `deploy/cloudflare/runtime/routing.py` 与协调器运行适配层处理，数据绑定与主站共享，路由/存储实现不等同本地文件系统。

## 三种传输路径

| 模式 | 数据路径 | 状态与限制 |
| --- | --- | --- |
| 局域网直连 | 浏览器间的WebRTC数据通道；网站用于协调 | 双方需在线，网络必须允许连接；网站不应宣称所有网络都能直连 |
| 在线中继 | 发送浏览器→服务端有界分片→接收浏览器 | 双方需在线，占服务端带宽；压力过大可拒绝请求，不能无界排队 |
| 离线缓存 | 发送浏览器→服务端暂存→接收浏览器 | 占持久化空间，受有效期、容量、下载次数与流量规则限制 |

连接方式选择与失败提示由前端处理；失败不应当伪装成已完成传输，也不能默认把未落盘数据当作离线可恢复数据。

## 任务与数据一致性

1. 读取当前设置、身份和用户/角色/匿名规则，检查发送或接收权限。
2. 建立任务或在线房间，记录文件大小、文件夹元数据与控制凭据。
3. 上传前取得并发名额，读取有上限的分块。离线文件先完成持久化，再确认对应数据库进度。
4. 接收端按已确认偏移继续；任务操作校验版本/预期状态，防止旧请求覆盖新进度。
5. 结束、取消或到期后按任务范围分批清理；不能递归删除未知目录中的文件。

主站会话权限由 `transfer/backend/identity.py::SessionSQL` 适配到快传操作；浏览器控制凭据、接收能力和主站管理员权限不能互相替代。

## 资源控制

`transfer/backend/resources.py` 的 `CHUNK=1048576`，普通快传单次读块最多1MiB；这不是异地网站同步的16/64KiB媒体分片。

| 环境变量 | 默认 | 用途 |
| --- | --- | --- |
| TRANSFER_IO_CONCURRENCY | 4 | 本地大流量请求并发目标，实际受缓冲预算进一步限制 |
| TRANSFER_BUFFER_MIB | 16 | 缓冲预算，校验范围4～64MiB |
| TRANSFER_IO_IDLE_SECONDS | 30 | 单次IO等待超时，校验范围1～120秒 |

`BoundedIO` 在读取请求正文前判断容量；占满返回503和重试提示，不建立无界等待队列。`read_chunk()`同时限制请求声明长度、实际读取字节和总读取时间。单个文件总大小仍受后台策略、存储空间和目标平台限制。

## 接收码与文件夹

接收码由 `codes.Codes` 发放、解析和撤销，格式为两位字母加四位数字。在线码有到期与速率限制；离线码映射到仍有效的暂存分享，并生成只读接收能力，不暴露发送端控制密钥。号码短，不应当视为高强度口令；验证、节流、到期和权限共同限制访问。

文件夹元数据由 `folders.Folders` 分批登记、校验路径并封存。拒绝路径穿越、绝对路径和非法条目；接收端写目录能力见 `folder_receiver.py`、`receivers.py` 及前端对应代码。浏览器未支持目录保存时使用界面明确提供的兼容流程，不能承诺所有浏览器都直接落地成文件夹。

## 配额与清理

`settings.select_rule(settings, p)`按用户→角色→已注册默认或匿名规则选择权限；`settings.edit(settings, data)`验证可修改字段，`accounting.py`计算时间区间与计量。管理员可控制日/周/月总量、单文件大小、并发、暂存上限、有效期和下载次数。

本地 `offline.DiskBudget`检测空间与预留容量，`offline.Maintenance.tick()`分批清理到期任务；Worker使用其存储适配和定时清理入口。清理不能抢占仍被保护的活动写入，不能删除主站媒体。详见 [日志缓存管理](log-cache.md)。

## 关键函数与调用方式

| 源码位置 | 入口 | 用法 |
| --- | --- | --- |
| transfer/backend/integration.py | install(app, resources, root) | 应用初始化时挂载，共用主站资源 |
| transfer/backend/native.py | Transfers.create(p, name, size, folder=None) | 创建上传任务，先校验身份与策略 |
| transfer/backend/native.py | Transfers.chunk(p, id, offset, data) | 提交指定偏移分片；处理返回状态后推进 |
| transfer/backend/native.py | Transfers.control(p, id, action, expected, stamp=None) | 携带预期状态/版本控制任务 |
| transfer/backend/lan.py | Rooms.act(r, op, data) | 处理在线直连协调操作 |
| transfer/backend/relay.py | Relay.act(r, op, data, body=None) | 处理在线中继操作与分片 |
| transfer/backend/codes.py | Codes.issue / resolve / revoke | 均由路由传入已解析的资源和请求数据 |
| transfer/backend/folders.py | Folders.submit / seal / listing | 分批登记文件夹、封存和分页读取 |
| transfer/backend/resources.py | read_chunk(request) | 有界读取HTTP块，拒绝过大或超时输入 |
| transfer/backend/offline.py | Maintenance.tick(batches=32) | 单轮有界到期清理；不要用它删除任意路径 |

这些是内部服务入口；异步方法应 `await`，资源对象应来自已认证路由。不能在公共页面传入伪造的管理员对象调用它们。

## 多域名访问

主站域名策略由 `backend/app/security/origins.py` 维护；本地和 Worker 的传输适配器为每个请求取得允许的公开来源，将同一 config 交给 `transfer/backend/origins.py` 统一校验。Origin 必须与当前 Host 对应的来源一致，不能仅因两者都在白名单就允许跨来源提交。身份、CSRF、SessionSQL 权限、接收令牌和配额规则仍然生效。

页面分享链接默认使用当前域名；粘贴其他本站白名单域名的链接时，前端只提取严格校验后的分享路径，转换到当前域名访问。白名单来自服务端转义后的模板元数据；不接受任意外站链接，不发起跨域携带 Cookie 的请求。

所有域名连接同一站点和存储。Worker 继续使用固定 `teacher-transfer-v1` 协调器标识，不按域名拆分房间、在线中继或接收码。Ubuntu 本地服务也由同一应用实例维护传输状态；多个独立实例不因此自动共享内存房间。各域名分别登录，配额及下载次数按原任务与身份共享。

运行时从 `TEACHER_ALLOWED_ORIGINS` 读取允许来源；Worker 与 Ubuntu 部署方式见根目录 README。多域名须映射同一实例，不应分别部署独立数据库或协调器后期待接收码互通。
