# 部署、更新与撤回（第 10/10 步）

本手册适用于同一台机器上的教师 Nuxt Node 服务和独立快传 Node 服务。代码版本 0.10.0，数据库 schema 8。第 9 步升级到本版不迁移数据库结构。真实 Windows、浏览器、双机和 VPN 现场结果须填写 [验收矩阵](acceptance.md)，本手册不是已完成公网部署的证明。

## 目录和准备

在同一父目录放置教师工程（名称可自定）与 **`file-transfer/`**。保留整个工具目录，不能只更新 `server/`。工具前台和独立后台随教师站构建；快传数据在工具的 `storage/` 中，不使用教师媒体库。旧三处接入仍为 `nuxt.config.ts`、`SiteHeader.vue`、`Sidebar.vue`，没有第四处教师源码改动。

- 使用验证版本 Node 24.19.0、pnpm 11.19.0；运行范围以 `package.json` 为准。启动脚本不会联网安装依赖。
- 教师工程须已具备自己的配置、数据库和依赖。工具不会重新初始化教师数据库，也不会安装 Node、修改系统执行策略或管理教师密码。
- 工具运行依赖只有两个锁定的 MIT 包。安装：在 `file-transfer/` 执行 `pnpm install --frozen-lockfile`；离线安装还要求本机已经缓存依赖。
- 远端浏览器使用教师站的 HTTPS 地址；独立工具默认回环监听 8787，不将其直接暴露为匿名上传入口。

## 首次接入

以下命令在工具目录执行，将 `../web-test` 换成实际教师工程：

```sh
node scripts/integrate-teacher.mjs check ../web-test
node scripts/integrate-teacher.mjs apply ../web-test
node scripts/initialize-bridge.mjs
node scripts/teacher.mjs build ../web-test
```

`check` 只核对，`apply` 会先检查全部三处，再备份原片段并写入。不匹配时停止；不会覆盖教师整份代码。已接入则无需再次应用。

开两个终端，分别启动：

```sh
node scripts/start.mjs
```

```sh
node scripts/teacher.mjs start ../web-test
```

开发调试将第二条的 `start` 改为 `dev`。配套脚本只在教师运行进程中注入工具专用私钥；构建不嵌入该私钥。

使用教师账号登录并打开 `/transfer-admin/`，取得当前账号 UID。服务器终端执行一次 `node scripts/manage-admin.mjs grant "账号UID"`，刷新后进入统一管理页。教师管理员不会自动获得工具管理权。前台为 `/zh/transfer`、`/en/transfer`，发送／接收在同页切换；教师后台侧栏按权限显示入口。

首次仅开放已实际核验的路径和需要的用户角色。LAN 默认不设速率，可按规则设置；匿名默认关闭。VPN 严格模式没有硬出口限制时保持计费链路禁用。不要为了让状态变绿而勾选尚未核验的出口。

## Windows 操作入口

先在终端运行 `node --version` 与 `pnpm --version`。`deploy/` 中的 `.cmd` 均以脚本位置定位工具目录，支持中文和空格路径，不要求从指定工作目录双击。

| 脚本 | 用途 |
| --- | --- |
| `install.cmd` | 首次／升级后安装锁定依赖 |
| `initialize.cmd` | 首次建立身份桥；保留已有密钥 |
| `start.cmd` | 启动独立快传；窗口保持打开 |
| `teacher-dev.cmd` | 启动教师开发服务 |
| `teacher-build.cmd` | 构建教师生产包 |
| `teacher-start.cmd` | 启动教师生产包 |
| `doctor.cmd` | 运行诊断，保留输出窗口 |
| `health.cmd` | 查询已运行工具的就绪状态 |
| `maintenance.cmd` | 备份／校验／恢复／清理已失效运行锁，参数同 Node 命令 |

教师目录不是同级 `academic-cms` 时，在命令提示符中执行，例如：

```bat
set "FT_TEACHER_ROOT=D:\Python\b01-website\web-test"
call deploy\teacher-build.cmd
call deploy\teacher-start.cmd
```

环境变量只对该终端及其子进程生效；另开的窗口需同样设置，或直接传目录：`deploy\teacher-dev.cmd "D:\Python\b01-website\web-test"`。命令提示符中的退出码会保留，窗口中的错误不会一闪而过。停止运行中的服务用 **Ctrl+C**，等待停止完成；不要把关闭浏览器当作停止服务器。

本版没有安装 Windows 后台服务。双击脚本、原生文件权限和 Windows 电源挂起须在目标电脑验收；可先用前台终端运行。强行结束进程可能留下锁，见下文。

## Linux 长期运行示例

附 `deploy/file-transfer.service.example` 与可选 `deploy/academic-teacher.service.example`。先审阅并替换既有服务账号、Node 绝对路径和工程路径。模板中的 `/usr/bin/node` 是占位部署路径，必须与 `command -v node` 及版本核对一致；不得沿用开发机绝对路径。账号需要访问工具配置、私钥与独立数据目录。教师进程还需要原有教师环境及数据权限。

已有教师进程管理方式时继续使用它，仅调整启动入口；不要额外启动第二个教师服务。模板没有 `Requires=` 或 `BindsTo=` 快传依赖，因此工具失败不触发教师站停止。`KillMode=control-group` 用于同时处理教师包装脚本及子进程；`Restart=on-failure` 有频率上限。配置依据：[systemd.service](https://www.freedesktop.org/software/systemd/man/systemd.service.html)、[systemd.kill](https://www.freedesktop.org/software/systemd/man/systemd.kill.html)。

以实际管理员权限手工安装审阅后的单元。例如首次使用这两个服务名时：

```sh
sudo cp deploy/file-transfer.service.example /etc/systemd/system/file-transfer.service
sudo cp deploy/academic-teacher.service.example /etc/systemd/system/academic-teacher.service
sudo systemd-analyze verify /etc/systemd/system/file-transfer.service /etc/systemd/system/academic-teacher.service
sudo systemctl daemon-reload
sudo systemctl enable --now file-transfer.service academic-teacher.service
sudo systemctl status file-transfer.service academic-teacher.service
```

查看日志：`journalctl -u file-transfer.service -n 100 --no-pager`。停止：`systemctl stop academic-teacher.service file-transfer.service`。本次交付仅做模板语法验证，不创建机器账号、安装单元或更改正在运行的服务。

快传启动前的 `unlock-stale` 仅清理记录 PID 已不存在的锁；活着的 PID、无权限判断、损坏的锁均拒绝清除，不执行 kill。进程 ID 被系统复用时也会拒绝，需要管理员确认实际运行状态后处理。单机同一数据目录只允许一个快传实例，不支持把 SQLite 放在多机共享目录或同时启动多个容器访问同一目录。

## HTTPS 与反向代理

`deploy/nginx-transfer.conf.example` 应合并到现有教师站 HTTPS 的 server 段。所有 `/transfer-api/` 仍经过教师服务，由它校验最新登录状态、来源和 CSRF；不能直接代理到 8787 绕开身份桥。

WebSocket 需要正确转发 `Upgrade`、`Connection` 并保留长连接超时；模板对此单一路由显式配置 HTTP/1.1、升级头和关闭缓冲。现有全站代理如已满足条件，无需重复增加 location。[Nginx WebSocket 说明](https://nginx.org/en/docs/http/websocket.html)

部署后核对浏览器→教师与教师→工具两个路径是否经过受限 VPN。WSS 加密不能证明绕过 VPN；LAN／公网候选隐藏或不明时仍拒绝按“免费直连”处理。中继和暂存是逐跳加密，服务端可接触文件。本站现有证书、域名、可信来源、Cookie 设置仍按教师站原配置管理。

## 诊断与单实例保护

```sh
node scripts/doctor.mjs ../web-test
node scripts/doctor.mjs ../web-test --live
node scripts/health.mjs
```

`doctor` 默认只读本地配置、密钥匹配、SQLite 完整性、管理员存在性、工具开关、依赖版本、教师三处接入及源码包哈希；不会应用补丁、升级数据库、修改权限或输出密钥。`--live` 额外查询所配置工具地址，要求服务版本一致。普通诊断不证明浏览器链路、物理出口或教师生产包是最新；改动工具后仍须重新构建。

`pass` 为该项通过；`warn` 可表示尚未开放、没有管理员、服务运行时存在正常运行锁、没有硬出口限制或工作目录没有发布清单；`fail` 会返回非零退出码。缺失初始化或依赖时先完成相应步骤，不盲目重建密钥。分机部署只有公钥的工具端应另按实际身份桥架构检查，当前同机诊断的私钥项不适用。

`runtime.lock` 在服务创建前独占建立，正常停止后释放。备份持有同一锁；运行中的服务、第二个服务或同时维护不能占用同一数据目录。异常退出后停止关联服务，再执行：

```sh
node scripts/maintenance.mjs unlock-stale
```

若 PID 仍存在则拒绝；该命令不停止进程。旧版 0.9 服务没有此锁，升级前必须明确停止它。单独的本地管理和统计导入命令也应在停机备份前结束。

## 停机备份、恢复与升级

详见 [备份恢复](backup-restore.md)。第 9 → 10 步无数据库迁移，但增加了运行锁和操作工具，仍先备份。旧版启动任务应先暂停／结束，停止两个服务并保留源文件；刷新前台以加载新代码。

1. 停止两个服务以及本地维护／计量导入程序。旧版没有维护脚本时，先将原工具配置和完整 `storage/` 复制到受保护的独立备份位置，保留原源码包。
2. 更新完整工具源码，保留实际配置、私钥及 `storage/`；不要把空示例覆盖为真实配置。新包无运行数据和密钥。
3. 安装冻结依赖，运行诊断并重新构建教师站；启动快传，再启动教师站。首次 0.10 运行后可使用本版可校验备份工具。
4. 验证前台导航、登录、管理入口、允许与禁止路径、一个文件和一个嵌套目录，以及额度与恢复。新生成的恢复任务使用当前配置；保存配置会使旧版本任务失效。

回滚时整体恢复旧工具代码与升级前的对应数据、配置和密钥，再按旧版本重新构建教师站。不要将不同时间的数据库、临时文件和私钥混用。恢复旧备份也会回退额度观测与领取状态，开放计费链路前必须核对当前供应商账单和后台额度，不能当成“额度刷新”。

## 停用与卸载

先结束传输并备份。取消 `FT_TEACHER_MODULE_ENABLED=true`，不用强制启用接入的 `teacher.mjs` 包装脚本，以教师原命令重新构建／启动；工具页面和扩展入口随之移除。工具独立服务可停止，教师站继续运行。

需要撤回三处源码片段时执行 `node scripts/integrate-teacher.mjs revert ../web-test`，它保留不相关的后续修改并在冲突时停止。之后重新构建教师站。systemd 用户停用已实际安装的快传单元；仅在确实使用配套教师单元时调整该单元，不能误停既有教师服务。最后保留私有备份、密钥和必要分享数据，是否删除工具目录由管理员按业务保留要求决定；本版不自动删除用户文件。
