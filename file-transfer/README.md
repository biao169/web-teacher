# 文件快传：独立部署与教师网站集成

前台支持发送/接收、文件与文件夹、局域网优先、受控中继和限时分享。后台集中管理账号权限、速率、个人/匿名额度、VPN 保护及临时存储。

- [Ubuntu / Debian 一行部署与 Fweb 菜单](UBUNTU_DEBIAN部署.md)
- [Cloudflare 网页部署教程（Git 导入 Worker）](CLOUDFLARE网页部署教程.md)
- [隔离测试脚本](test-examples/README.md)

独立本机运行：`pnpm install --frozen-lockfile` → `pnpm build` → `pnpm start:standalone`。首次初始化需要设置 `FT_SETUP_TOKEN`，或使用安装脚本在终端创建管理员。前台 `/zh/transfer`，后台 `/transfer-admin/`。数据库默认在本目录 `storage/data/`，无需教师源码。

Cloudflare 运行：Workers 页面与 API、Durable Object SQLite 账号/额度/会话、私有 R2 分块存储。首次部署按教程添加初始化 Secret。云端版有独立日/月文件链路额度，不能读取或替代用户 VPN 的总流量统计。

`pnpm start` 仍启动原有教师身份桥接服务；独立服务请用 `pnpm start:standalone`，两者不要同时占用同一数据目录和端口。独立版不自动复用教师账号。原有教师嵌入模块保持在 `integration/teacher-site/`。

本目录的所有源码、配置和部署脚本可单独放入 Git 仓库；测试示例集中在 `test-examples/`，删除该目录不影响部署。

---

## 原有教师集成与运维说明

# 文件快传工具 · 第 10/10 步

版本 **0.10.0**：完成部署诊断、同目录单实例保护、可校验停机备份／新目录恢复、Windows 操作入口和 Linux 服务模板。代码与自动化交付完成；真实浏览器、Windows、双机及实际 VPN 仍需填写 [现场验收记录](docs/acceptance.md)。部署从 [操作手册](docs/deployment.md) 开始。没有新增教师源码改动或 npm 运行依赖。

四种方式继续支持检查点与中断恢复、暂停和有限自动重试、可选本机恢复记录及速度／剩余时间显示。单文件和目录按已提交检查点续写；ZIP 在同一授权任务内重新生成。见 [续传与任务恢复](docs/recovery.md)。

默认优先选择局域网；其他方式需要明确选择、相应用户权限及真实路径核验，不自动切换计费链路。VPN 统计属于周期采样估算；没有接入出口硬限额，因此严格模式保持计费链路禁用。广域网直连只开放已核验绕开受限 VPN 的路径；中继／暂存可按实际服务器路径使用有效估算预算。操作及限制见 [广域网、中继与临时分享](docs/network-sharing.md)。

已安装第九步：暂停／结束旧任务，停止两个服务及本地维护／采集程序，先整体备份实际配置、完整数据和密钥；更新本目录并保留运行数据，执行 `pnpm install --frozen-lockfile`，重新构建教师网站并启动两者。不要重复接入补丁或初始化密钥。

数据库保持 **schema 8**，第 9 → 10 步无结构迁移；从 schema 7 可自动升级到 8。第 8 版未生成恢复凭据的中断任务不能追溯恢复。依赖仍为 `ws@8.21.3`、`qrcode-generator@2.0.4`（MIT）。回滚恢复升级前整套备份，旧 schema 服务不可直接打开新库。

恢复不重复计入个人额度或同一临时领取次数，重新传输的流量仍申请 VPN 预算。默认恢复窗口 24 小时，最小检查点间隔 4 MiB，自动网络重试最多 3 次；统一后台可调。浏览器大文件自动增大提交间隔，减少反复复制已有内容。刷新恢复需原账号／匿名 Cookie、原源文件和原输出位置，本机记录默认不保存，用户可主动开启。

临时分享支持有效期、领取次数、容量预留、撤销及自动清理。预览不占次数，确认领取后占一次与整项个人接收额度，中途失败不退回。中继／暂存清单最多 256 KiB，正文逐块传输。WSS 为逐跳加密，服务器可以接触内容，临时文件为私有目录中的明文文件，非端到端加密。真实设备、Windows 和实际 VPN 网络仍待部署验收。

在后台原“VPN 流量防护”分区选择统计源：Linux／Windows 本机接口，或本地采集器提供的完整账单快照。确认出口覆盖范围，设置日／月额度、计费方向和时区；接口统计需填写本周期之前已用量。前台显示真实观测值、剩余估算、重置时间与禁用原因。已发出字节的预留保留为“待对账”，防止统计延迟重复放行；管理员核对后才释放，可能暂时重复计入。操作、数据格式和保护边界见 [VPN 流量与额度](docs/vpn-budget.md)。

规则匹配：个人覆盖 → 角色规则 → 登录用户默认；匿名单独匹配。每条规则完整替代默认权限，角色／个人速率留空继承全局。双方可为本次任务选择更低速度，最终取双方有效规则与任务设置的最低值；默认 LAN 不限速。限速作用于每项连接，并发任务的速率可能相加。

个人额度按发送＋接收合计：等待连接时预留，在线双方确认且所选路径获准，或临时任务获准时按整项大小计入开始日／月；此前取消释放预留，此后失败或取消不退回。相同账号给自己传输计两次，并发按一项任务算。前台显示已计入、预留、剩余与重置时间。详细说明见 [身份与额度](docs/access-allowance.md)。

匿名默认禁止。开放后按浏览器签名 Cookie 区分；清除 Cookie 或换浏览器可建立新身份。若需控制匿名总体用量，应配置后台的所有匿名访客共享日／月上限及共享并发。此上限跨匿名身份累计，和个人上限同时生效。

首次开放：在原管理页设置真实局域网范围（如实际使用的 `192.168.1.0/24`）、完成路由核验、开启工具/局域网以及相应用户权限。双方从 HTTPS 教师网站进入：选择文件 → 生成接收码 → 对方连接 → 双方确认 → 接收方选择保存方式。局域网不限速为默认，配置了速率后正常客户端执行节流。详细条件、协议和限制见 [局域网传输说明](docs/lan-transfer.md)。

本机文件整理与接收预览继续可用，详见 [文件处理说明](docs/files.md)。清单最多 20,000 项/8 MiB 路径信息，按 100 项逐批显示；流式保存按块落盘，兼容下载单次及待回收数据合计最多 128 MiB。

## 接入现有教师网站

使用与教师网站一致的 **Node.js 24.19.0**。工具的两个运行依赖均锁定版本，安装在本目录。
将本目录命名为 `file-transfer`，放在教师网站工程的同级目录。例如父目录中同时有 `web-test/` 和 `file-transfer/`。
工具前台与管理页随教师 Nuxt 构建；传输服务为独立 Node 进程。后台页面使用独立布局，不重复显示教师前台导航。

在 `file-transfer/` 内依次执行（将 `../web-test` 改为实际教师工程路径）：

```sh
pnpm install --frozen-lockfile
node scripts/integrate-teacher.mjs check ../web-test
node scripts/integrate-teacher.mjs apply ../web-test
node scripts/initialize-bridge.mjs
node scripts/start.mjs
```

保持快传服务窗口打开，再开一个终端，在同一目录运行：

```sh
node scripts/teacher.mjs dev ../web-test
```

打开教师网站的 `/zh/transfer` 或 `/en/transfer`；管理页为 `/transfer-admin/`。
接入脚本仅修改 3 个已列明的教师文件；先检查所有改动位置，再写入并保存原文件副本。已有接入不会重复添加。
检测到不兼容的本地修改时会停止，不覆盖整份教师源码。源码中的补丁可直接审阅。

Windows 可双击 `deploy/initialize.cmd` 初始化，`deploy/start.cmd` 启动快传服务。
`deploy/teacher-dev.cmd` 默认使用同级 `academic-cms/`；其他目录名可从命令行传入带引号的完整路径，或设置 `FT_TEACHER_ROOT`。
首次仍需按上面的命令应用接入补丁。启动脚本不会自动安装依赖；首次或升级后请先运行安装命令。Windows 本轮未实机验证。另有 `teacher-build.cmd`、`teacher-start.cmd`、`doctor.cmd` 与 `maintenance.cmd`，详见部署手册。

## 首个工具管理员

教师管理员**不会自动成为快传管理员**。先登录教师账号，再访问 `/transfer-admin/`，页面会显示当前账号 ID。
由有权操作服务器的人员，在 `file-transfer/` 目录执行一次：

```sh
node scripts/manage-admin.mjs grant "页面显示的账号ID"
```

刷新页面后可以查看工具管理状态，教师后台侧栏显示“文件快传管理”。同一权限也控制直接访问管理 API。
撤销和查看现有授权：

```sh
node scripts/manage-admin.mjs revoke "账号ID"
node scripts/manage-admin.mjs list
```

上述命令是本机首次授权/恢复入口，不接触教师账号密码、角色表或权限表。日常管理账号可以在统一管理页调整；保存时必须保留当前管理者，避免误锁自己。
已授权用户若被停用、会话退出/失效或被要求修改密码，不能继续使用工具管理 API。

## 运行与配置

默认服务仅监听 `127.0.0.1:8787`。健康检查：

```sh
node scripts/check-config.mjs
node scripts/doctor.mjs ../web-test --live
node scripts/health.mjs
```

`ready` 表示基础服务和独立数据库就绪；`fileHandlingAvailable:true` 表示本机文件处理已可用，会话中的 `policy.transferAvailable` 表示当前身份是否至少有一种可用传输方式，逐项条件见 `policy.links`，具体链路仍需配对后核验。
复制 `config.example.json` 为 `config.local.json` 可修改配置；初始化会保留已有配置并写入工具专用公钥。

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| `configVersion` | `1` | 配置格式 |
| `host` | `127.0.0.1` | 服务监听地址 |
| `port` | `8787` | 服务端口 |
| `dataDirectory` | `storage/data` | 工具内的独立运行数据 |
| `bridgePublicKey` | 空字符串 | 专用 Ed25519 公钥，初始化自动配置 |

环境变量 `FT_CONFIG`、`FT_HOST`、`FT_PORT`、`FT_DATA_DIR`、`FT_BRIDGE_PUBLIC_KEY` 可覆盖对应配置。
相对路径按工具目录解析，启动命令可从其他目录调用。未知配置和越界目录会被拒绝。
`initialize-bridge.mjs` 生成新的工具专用签名私钥，重复执行保留原钥；密钥和真实配置不会进入源码包。
`teacher.mjs` 仅在教师进程启动时注入专用签名私钥，不改教师 `.env`、不复制教师会话密钥、不在构建时嵌入部署私钥。
本机配套脚本默认使用回环连接；分机运行需在教师服务端配置 HTTPS 的 `NUXT_FILE_TRANSFER_SERVICE_ORIGIN` 和独立的 `NUXT_FILE_TRANSFER_SIGNING_KEY`，只向工具服务配置公钥。

## 构建和停止

教师工程已有依赖后，可用：

```sh
node scripts/teacher.mjs build ../web-test
node scripts/teacher.mjs start ../web-test
```

快传服务仍需要单独启动。两个窗口均用 Ctrl+C 停止。生产环境由进程管理器管理两个服务，随包提供可审阅的 systemd 示例；本次未实际安装单元。
本步只验证 Node/Linux 目标；没有部署到公网或验证 Cloudflare/VPN/Windows 实机。
工具源文件变更后必须重新构建教师页面和身份适配器；不能只依据教师源文件哈希判断构建是否最新。

停用接入：不用配套启用脚本，取消 `FT_TEACHER_MODULE_ENABLED=true`，重新启动开发服务或重新构建生产服务。
彻底撤回 3 处接入片段：

```sh
node scripts/integrate-teacher.mjs revert ../web-test
```

保留 `storage/` 及其中备份。本版保持 schema 8；若回退到只支持 schema 1/2/3/4/5/6/7 的旧服务，应恢复对应版本数据备份，不能让旧版程序直接打开新库。

## 验证

```sh
node --test --test-reporter=spec tests/*.test.mjs
node scripts/check-nuxt-module.mjs ../web-test
node scripts/check-ui-types.mjs ../web-test
node tests/ui-dom.mjs ../web-test
```

ZIP 互操作测试需要 Python 3（仅测试使用，应用运行不需要）。默认 Linux 使用 `python3`，Windows 使用 `python`；可通过 `FT_TEST_PYTHON` 指定解释器完整路径。

真实教师构建的 HTTP 联调：`node tests/host-http.mjs ../web-test`，使用隔离测试账号和数据库。
可选包管理器：pnpm 11.19.0；依赖缓存完整时可用 `pnpm install --frozen-lockfile --offline --ignore-scripts`，新机器需先联网安装锁定版本。
维护者可用 Python 3 打包：`python scripts/package-source.py --output ../../file-transfer-source.zip`。

类型检查需要先通过配套脚本运行教师 `prepare` 或构建；DOM 检查使用教师现有 Vue/TypeScript/happy-dom，只执行组件交互，不运行浏览器布局引擎。

说明：[第十步验证记录](docs/step10-verification.md)、[部署手册](docs/deployment.md)、[备份恢复](docs/backup-restore.md)、[现场验收](docs/acceptance.md)、[第九步验证记录](docs/step9-verification.md)、[续传与恢复](docs/recovery.md)、[第八步验证记录](docs/step8-verification.md)、[广域网与分享](docs/network-sharing.md)、[第七步验证记录](docs/step7-verification.md)、[VPN 流量与额度](docs/vpn-budget.md)、[文件处理](docs/files.md)、[第四步验证记录](docs/step4-verification.md)、[单页配置](docs/settings.md)、[第三步验证记录](docs/step3-verification.md)、[接入与撤回](docs/integration.md)、[共用协议](docs/contracts.md)、[第二步验证记录](docs/step2-verification.md)、[版本](docs/versions.md)。


## 维护命令

```sh
node scripts/doctor.mjs ../web-test
node scripts/maintenance.mjs backup "../private-backup-20260908" --stopped
node scripts/maintenance.mjs verify "../private-backup-20260908"
node scripts/maintenance.mjs restore "../private-backup-20260908" "../transfer-restored-data"
```

先停止两个服务和本地维护／计量命令。备份含私钥和实际文件，放在工具外的私有新目录；恢复只写入不存在的新目录，不覆盖当前数据。异常退出留下运行锁时，用 `maintenance.mjs unlock-stale` 仅清理已不存在的 PID；活进程或异常锁会拒绝。详见 [备份恢复](docs/backup-restore.md)。
