# 独立测试与演示

本文件夹包含示例入口、`support/windows-oneclick/` 专用启动器、`runtime/` 示例运行目录（首次运行生成）、测试记录及开发打包工具。停止示例进程后可整体删除；根目录 Tweb.sh 和正式网站不依赖本文件夹。

前提：Node >=24.19.0 <25，pnpm **11.19.0**，首次安装需联网。Windows 可复用 Codex 自带运行时；若没有 pnpm，请先安装。完整回归还需要 Python 3（可用 `FT_TEST_PYTHON` 指定路径），以及创建符号链接的权限（Windows 开发者模式或适当权限）；脚本不会自动更改系统权限。脚本不安装系统 Node，不申请管理员权限。

| Windows 双击 | Ubuntu/Debian 命令（仓库根目录） | 用途 |
| --- | --- | --- |
| `01_check.cmd` | `bash test-examples/run.sh check` | 快传全部 Node 测试、启动器测试、部署脚本回归；不证明教师全量/UI验收 |
| `02_demo_both.cmd` | `bash test-examples/run.sh demo` | 初始化独立示例库，启动教师＋快传 |
| `03_demo_teacher.cmd` | `bash test-examples/run.sh teacher` | 初始化独立示例库，仅启动教师 |
| `04_production_build.cmd` | `bash test-examples/run.sh production-build` | 隔离目录初始化、验证启用快传的 Ubuntu 生产构建 |

演示在本文件夹的 `runtime/` 中复制源码、安装依赖，**不操作根目录教师数据库/快传存储，更不会连接 `/opt/academic-suite`**。首次复制后复用；若要测试新源码，停止示例服务并重命名 `runtime/` 后重新运行。不要同时启动两个示例命令。

教师地址 `http://127.0.0.1:18005/zh`；快传 `/zh/transfer`；教师管理 `/admin`；快传管理 `/transfer-admin/`。独立快传监听 18787，只在本机使用。账号 `demo_admin`，随机密码见 `runtime/academic-cms/data/oneclick-demo-login.txt`，重复初始化不会重置密码。

演示入口会保留最小安全默认策略；管理员须实际核验 LAN 网段和链路后再允许传输。不要把示例账号、HTTP 配置或数据目录用于生产。

启用快传的隔离生产构建完成后，可执行 `node test-examples/production-http.mjs`，检查生产进程、中英文首页/快传页、首页 API 以及教师到快传的身份桥。该脚本使用临时数据库、临时快传副本和随机本机端口，结束后删除自己创建的临时目录；不会修改正式库。需要文件夹链接权限以复用依赖。它不验证真实 HTTPS 证书或浏览器文件传输。

手工验收：教师登录/退出、导航、教师权限与快传授权；分别发送单文件和嵌套目录；双浏览器/双设备接收与校验；匿名禁止；不同层级权限；LAN限速规则；日/月 VPN 额度耗尽后计费链路禁止；刷新恢复；HTTPS 下 WebSocket。自动测试不能替代这些真实网络验收。
