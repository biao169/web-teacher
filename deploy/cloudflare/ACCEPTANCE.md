# Cloudflare 第五步验收记录

日期：2026-09-29（UTC+8）。项目版本仍为 v0.15.119，补丁标识 cloudflare-step5。

结论：部署适配、发布前检查、教程和本地可执行验收已完成。**尚未通过真实 Cloudflare 整站验收，不能据此宣布生产可用。** 没有访问用户 Cloudflare 账号、推送 GitHub、执行远程 SQL 或发布 Worker。

## 已执行的验收

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| 部署及业务边界测试 | 71 项通过 | pytest；可丢弃 SQLite、HTTP TestClient、文件存储替身；新增主站验收使用打包模板字典 |
| 主站/权限 | 通过 | 中英文页面、公开项目私密字段隔离、站点地图公开范围、脚本地址不暴露、未登录私有媒体拒绝 |
| 媒体 HTTP | 通过 | 图片签名与后缀不符、未知正文、HEAD/GET、权限；不能替代浏览器对各种真实媒体的解码测试 |
| 快传回归 | 通过 | 六位码、在线块确认、目录收发、权限变更、额度、清理租约和失败检查点 |
| 原 SQL 与本地 D1 | 通过 | JS workerd/Miniflare 的实际本地 D1：原始 127 条 SQL、必要业务表、事务回滚、JSON/中文/空值 |
| 本地 R2 | 通过 | JS workerd/Miniflare：二进制、范围读取、前缀列举与删除，不影响主站媒体对象 |
| Pyodide FFI | 通过 | 实际 Pyodide + JS 绑定替身：参数、批量数组、空值、SDK 包装解包、R2 分批清理；不是云端绑定 |
| 密码兼容 | 通过 | Pyodide 执行原 600000 次 PBKDF2，结果与既有格式一致 |
| 完整 bundle | 通过 | 锁定依赖同步、临时打包、源码一致性、绑定/导出/Cron/静态文件检查、Wrangler dry-run、临时目录清理 |
| 完整 Python Workers 启动 | 阻断 | 本次重新尝试，workerd 下载 Python 运行组件时无法解析 pyodide-capnp-bin.edgeworker.net，应用尚未启动 |
| 真实云端双浏览器、Cron、性能 | 未执行 | 尚无用户测试 Worker 地址及可用云端运行结果 |
| Windows 实机运行 | 未执行 | 本次在 Linux 执行；没有更改 Windows 启动逻辑 |

新增测试以本轮部署风险为边界，不代表对网站所有后台业务重新做了全量测试。主站与快传原业务源码、根目录依赖声明、数据库表结构均保持不变。

## 如何重现本地检查

在项目根目录、已安装应用依赖及 pytest 的环境：

```bash
python -B -m pytest deploy/cloudflare/tests -q
```

完整打包检查：按 README 配置构建变量，执行 `python deploy/cloudflare/build.py bundle`。此命令不发布、不执行 SQL，产物只在外部临时目录保留至命令结束。

开发者可复用一个源码外、已经按 package-lock.json 执行 npm ci 的测试目录，执行：

```bash
python deploy/cloudflare/tests/native_bindings.py /外部测试目录
```

仅使用本地 Miniflare/workerd D1/R2，测试数据临时保存。默认占用本机 8795/9295 端口，先确保未被其他程序占用。工具需 Node 和 Python；它不会连接线上资源。`ffi_probe.py` 则需从含临时 src 的 Worker 产物目录，通过锁定的 Pyodide Python 执行。

## 真实网页部署验收清单（待执行）

先使用独立测试 Worker、D1 和私有 R2 桶，按 README 连接 GitHub 的 web-py 分支。只有新建空 D1 才导入 database/schema.sql。

| 顺序 | 操作 | 必须满足 |
| --- | --- | --- |
| 1 | 查看 Builds 日志 | 没有执行根目录 pip install .；分支、域名和资源正确；dry-run 后真实 deploy 成功 |
| 2 | 查看绑定与触发器 | DB、MEDIA、ASSETS、TRANSFER_COORDINATOR 存在；使用独立缓存桶时还有 CACHE；Cron 每分钟触发 |
| 3 | 设置初始化 Secret，打开 /setup | 创建管理员后可登录；再次访问关闭；删除初始化 Secret；不能重复创建管理员 |
| 4 | 访问首页及各公开列表 | 中英文、logo、导航、搜索、筛选、滚动加载正常；匿名项目响应没有负责人、金额、成员等私密字段 |
| 5 | 测试媒体 | 后台上传 JPG/PNG/PDF/视频并预览；Range/HEAD 正常；公开媒体按配置可见，私密媒体匿名不可读 |
| 6 | 验证站点地图 | robots.txt 中使用真实域名；sitemap.xml 只列公开内容；后台、数据库及脚本不可直接下载 |
| 7 | 两个浏览器在线传文件 | 六位码可配对；中转多块传输完成后文件哈希一致；中途断开不能误报完成 |
| 8 | 测试局域网与文件夹 | 局域网文件字节不经服务端中转；目录结构、空文件、空目录正常；浏览器目录保存权限拒绝时提示明确 |
| 9 | 离线缓存与部署重启 | 发送端离线后仍可领取有效缓存；新部署后有效离线任务保留；旧在线码要求重新配对 |
| 10 | 身份与配额 | 普通用户无法操作他人任务；撤销权限即时生效；大小、缓存总量和流量额度超限被拒绝 |
| 11 | 过期/撤销清理 | Cron 记录与后台状态可查；逐批清理完成；正式媒体不受影响；关闭自动清理后无自动删除 |
| 12 | 实际负载 | 在预计并发下记录错误率、延迟、CPU/内存与 D1/R2 请求量；不要将单次打包结果当作容量保证 |

可选执行 GET 检查：

```bash
python deploy/cloudflare/smoke.py --origin https://你的实际测试域名
```

只发送 GET，不使用登录凭据，不调用 Cloudflare 管理 API；首次访问快传可能补写默认配置。成功只表示所列公开端点的状态、内容类型及必要标记通过。它不能替代上表的登录写入、真实传输、浏览器、Cron 和性能验收。

## 故障定位与更新

- 下载运行组件失败发生在应用启动之前；先排查测试环境 DNS/HTTPS，不要关闭证书校验，也不要通过清空数据库处理。
- 新域名需要修改 TEACHER_ORIGIN 后重新部署；身份 Cookie 不跨域继承。
- 正常更新保留原 D1、R2、Durable Object 注册标记；不重置数据库、不重新执行 /setup。
- 若云端验收未通过，保留失败阶段和不含凭据的错误日志，按 README 排错后重测对应项目。

## 2026-09-30 构建 SQLite 修复补充

补丁 cloudflare-sqlite-fix1：仅部署打包路径调整，不改变数据库或业务代码。新增独立 Python 子进程测试，分别阻止 sqlite3 和 _sqlite3 的导入，确认 Cloudflare 默认打包成功、初始化 SQL 与原文件逐字节一致、且不生成迁移计划。另核对显式迁移计划在缺少 SQLite 时明确报错，以及原共享打包接口、独立快传打包的兼容性。

本次部署测试及原数据库/打包回归共 87 项通过。第五步的原验收记录作为历史结果保留；本补丁的新增验证不代表真实 Cloudflare 整站已验收。

本次完整 build.py bundle 也已通过：PACKAGE、锁定运行依赖同步、Wrangler dry-run 和临时目录清理成功。没有执行真实发布。

## 2026-09-30 D1 第二步验证

- 102 项测试通过（1 条既有 Starlette 弃用提示）：含缺少 Python SQLite 时打包、空 D1 初始化、重复部署保留记录、缺表/缺索引/字段变化/额外表阻止发布、check 空库拒绝、权限和 JSON 错误不当作空库、bundle 不访问远程。
- 完整 build.py bundle 通过：Wrangler dry-run 通过，并由真实本地 D1 执行唯一 SQL，查询到 127 个表/显式索引对象，随后清理临时目录。
- 尚未调用用户远程 D1 或发布至 Cloudflare；远程初始化与令牌权限仍需实际部署验证。管理员创建继续沿用 /setup，不自动生成密码。

## 2026-09-30 R2 第三步验证

- 118 项测试通过（1 条既有 Starlette 弃用提示）；新增 16 项覆盖共用桶/独立桶、本地/远程参数隔离、二进制往返、写入/读取/删除失败、精确对象清理、清理失败提示、前缀和绑定验证。
- 完整 `build.py bundle` 通过：Wrangler dry-run、真实本地 R2 的 media/ 与 cache/ 两个前缀写入/读取/逐字节比对/删除均成功；随后本地 D1 的 127 个结构对象检查通过，临时目录清理完成。
- 未调用用户远程 R2/D1，未实际发布。远程检查需要构建令牌权限；该探针不能替代运行时上传/预览验收。强制终止进程可能留下小型随机测试对象，按日志完整路径人工检查。

## 2026-09-30 域名第四步验证

- 134 项测试通过，1 条既有 Starlette 弃用提示。覆盖 workers.dev 地址生成、旧 TEACHER_ORIGIN 兼容、自定义域名配置、错误/冲突域名拒绝、默认入口开关，以及原有同源校验和 robots 中 sitemap 地址随配置变化。
- 不填写 TEACHER_ORIGIN、仅以 TEACHER_WORKERS_SUBDOMAIN 生成默认地址的完整 bundle 通过；Wrangler dry-run、本地 R2 二进制读写删除、本地 D1 127 个结构对象验证和临时清理全部完成。
- 自定义域名路由已做配置测试；未向用户 Cloudflare 账号绑定真实域名、申请证书或发布。实际 DNS/证书和线上登录仍需部署后验收。

## D1 导入结果兼容验证

30 项针对性 D1/部署流程测试通过，包含进度文字/空输出/对象输出的成功导入、非零退出拒绝、返回成功但实际未建表时结构复查拒绝，以及重复部署保留记录。未执行用户远程数据库操作；需要重新部署验证线上结果。此前完整 bundle 验证记录不代表本次远程导入已验收。

## Worker 启动随机数第一步验证

- deploy/cloudflare/tests 共 132 项测试通过，1 条既有 Starlette 弃用提示。新增 4 项验证入口导入（禁止 token_hex）、首次请求构建/后续复用、失败重试不缓存半成品、协调器实例隔离。SDK 用测试替身，不能替代真实 Workers 快照验收。
- 保留现有主站/快传/D1/R2 测试；尚未执行用户云端发布，首次请求性能、实际快照及双端传输需后续线上验收。

## 启动修复第二步：实例复用及失败重试

136 项 deploy/cloudflare/tests 测试通过，1 条既有 Starlette 弃用提示。新增 4 项真实应用路由集成测试（LAN/relay 分别计项）：经实际 build_application 创建应用后，连续执行接收码流程及中继块确认，构建次数为 1；安装完成后注入异常，缓存仍为空，重试使用不同应用且快传 Mount 仅 1 个，两次路由数量一致。数据库和存储使用本地替身，SDK 使用替身；云端快照和多客户端联调尚未完成。

## 启动修复第三步：项目导入路径检查

- 147 项部署测试通过，1 条既有 Starlette 弃用提示。新增 11 项独立子进程检查：当前真实入口通过；启动阶段随机数、时间、业务/数据库导入、socket、子进程及写文件的负向用例均被拒绝。
- STARTUP-CHECK 已接入 build.py preflight，check/bundle/deploy 共用；SDK 使用替身，生产运行函数未修改。
- 本次未重新进行完整工具链打包或真实云端发布，不能据此断言 Cloudflare 快照和请求链已验收。云端需确认 STARTUP-CHECK 和最终 DEPLOY 均通过，再进行业务请求验收。

## 启动修复第四步：最终验收结果

- 149 项部署测试全套通过；随后新增 Hello world 识别测试，3 项启动验收针对性复验通过（含首次 HTTP→真实登录表单→后台和连续访问、15 次公开探针、默认页拒绝）。既有 Starlette 弃用提示不影响结果。
- 完整 build.py bundle 在 Python 3.13.15 下通过：STARTUP-CHECK、锁定依赖、Wrangler dry-run、真实本地 R2 两前缀往返/删除、本地 D1 127 对象检查与临时清理全部完成。
- 公开云端域名检查未通过：12 路径响应未满足预期，/en 使用探针 UA 返回 200 text/plain 和 Hello world；不能认定教师网站已上线。详细见 STARTUP-ACCEPTANCE.md。
- 未发布到用户账号，未提交真实登录凭据、上传云端媒体或执行云端双端传输。云端最终启动、首次请求及业务验收仍待新版本发布后完成；不改动已有 D1/R2 数据。

## CPU 修复第一步（cloudflare-cpu-step1）

- 150 项原有部署测试通过；新增 Codes 构造副作用负向用例后，16 项启动相关测试复验通过。
- Python 3.13.15 完整 bundle 通过：依赖锁、实际暂存源码 SNAPSHOT-CHECK、Wrangler dry-run、本地 R2 media/cache 往返及删除、本地 D1 127 对象与清理。
- 预加载定义仍不构造应用；原 Worker 入口的重复应用构建留待第二步处理。没有提高 CPU 配额或改动运行随机数函数。
- 业务源码与数据库文件保持逐字节一致；仅 deploy 文件变更，交付时例行重建 release-manifest.json。
- 未发布到 Cloudflare，未验证实际 CPU 时间、快照执行耗时或 Pyodide 重入错误是否消失。

## CPU 修复第二步（cloudflare-cpu-step2）

- 新增资源工厂提取与校验测试：导入生成模块创建 0 个主站应用，包装构建创建 1 个；原工厂文本一致，原启动结构变化及生成文件篡改会阻止发布。
- 全套首次运行 150 项通过，5 项因测试暂存目录未创建失败；生成器补齐父目录创建后，相关 39 项复验全部通过。既有首次登录、连续请求、快传实例复用及失败重试覆盖保留。
- Python 3.13.15 完整 bundle 通过：SNAPSHOT-CHECK、锁定依赖、Wrangler dry-run、本地 R2 两前缀读写删除、本地 D1 127 对象及清理。
- 本次修改仅在 deploy；打包例行更新 release-manifest.json。未提交 GitHub、发布 Worker、修改远程数据或实际测量线上 CPU；第三步将拆分主站/快传加载路径。

## CPU 修复第三步（cloudflare-cpu-step3）

- 155 项既有部署测试通过；补齐测试用的 Worker 环境绑定后，新增 3 项分流测试通过：主站首页/登录/setup 不调用快传安装器；快传后台和门户正常；Cron 不构建 HTTP 应用。
- 原有局域网/中继收发状态、连续请求复用、协调实例隔离、失败重试测试仍通过。快传测试现在显式使用协调侧应用模式。
- 完整 bundle 通过：SNAPSHOT-CHECK、锁定依赖、Wrangler dry-run、本地 R2 两前缀读写删除、本地 D1 127 对象与清理。
- 只修改 deploy；业务源码、数据库与远程数据不变，打包例行重建 release-manifest.json。未发布到 Cloudflare，也未完成线上 CPU 与 Pyodide 异常验收。

## CPU 修复第四步（cloudflare-cpu-step4）

- 161 项部署测试通过；修正 Cron 测试替身的返回格式后，相关 6 项复验通过，只剩既有 Starlette 弃用提示。
- 覆盖错误堆栈脱敏、保持原异常传播、正常请求不输出成功日志、平台错误码/Ray ID 提取和 Cron 跳过状态。首次初始化及快传状态测试继续通过。
- Python 3.13.15 完整 bundle 通过：快照副作用检查、依赖锁、Wrangler dry-run、本地 R2 双前缀读写删除、本地 D1 127 对象与清理。
- 新增 CPU-DIAGNOSTICS.md；未部署到用户账号或宣称线上 CPU/Pyodide 故障已消失。平台强制终止不保证能输出应用 ERROR，elapsed_ms 不是 CPU 时间。
- 本轮只修改 deploy，数据库与业务源码未改；打包例行更新校验清单。

## 统一密码第四步最终验证

- 部署、密码策略、跨平台计算、账号、公开注册/登录相关测试共 206 项通过；随后补充改密与会话撤销测试，14 项初始化/改密复验通过。既有 Starlette 弃用提示不影响结果。
- 锁定 Pyodide Python 实际执行更新后的 ffi_probe.py 成功：D1/R2 使用本地 JS 替身，密码使用真实 Web Crypto 与原 Worker derive，100000 次固定摘要一致。
- Python 3.13.15 完整 build.py bundle 成功：快照副作用检查、依赖锁、Wrangler dry-run、本地 R2 两前缀读写删除、本地 D1 127 对象检查与清理。未执行远程 SQL、远程部署或实际 Windows 测试。
- 共用密码模块统一100000次，无旧版本迁移；/setup 使用 same-origin、严格 Origin 校验及脱敏诊断；未知提交结果不假定未写入。
- 完整使用说明见根 README、Cloudflare README 与 PASSWORD-COMPATIBILITY.md。上线后仍需完成真实首次初始化、登录、设密、改密与会话撤销验收。
