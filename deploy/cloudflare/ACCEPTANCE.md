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
