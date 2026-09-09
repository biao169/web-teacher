# 教师网站与文件快传 · 完整源码套件

根目录 `Tweb.sh` 是 Ubuntu/Debian 生产管理入口。`academic-cms/` 是教师网站；`file-transfer/` 是独立快传工具；`test-examples/` 集中放置演示、测试命令与专用启动器，停止示例进程后可整目录删除，不影响生产安装。

## Git 首次启动命令

先由仓库维护者将**本压缩包解压后的根目录内容**提交到自己的 Git 仓库。仓库根目录必须直接有 `academic-cms`、`file-transfer`、`Tweb.sh`。服务器使用者无需事先克隆仓库。下面以当前 GitHub 公开仓库为例，默认示例分支为 `web-vue`；需要时可手动替换为其他分支：

```bash
bash -c 'set -e; f=$(mktemp); trap '\''rm -f "$f"'\'' EXIT; curl -fL --proto "=https" --tlsv1.2 "https://raw.githubusercontent.com/biao169/web-teacher/web-vue/Tweb.sh" -o "$f"; bash -n "$f"; sudo bash "$f" install'
```

这是一句完整终端命令：先完整下载脚本到临时文件，成功后进行 Bash 语法检查，再运行交互安装；网络失败不会执行半截脚本，交互输入仍来自终端，不使用 `curl | bash` 占用标准输入。临时文件退出时自动清理。机器须已有 Bash、curl 和 sudo（root可将 sudo 去掉）；没有 curl 时先 `sudo apt-get update && sudo apt-get install -y curl ca-certificates`。

安装会检测缺少的依赖，并征询安装；然后询问 Git 仓库地址、源码分支（默认 web-vue，可手动输入其他分支）、快传开关、端口、HTTPS地址、数据库（网站）高级管理员用户名和两次密码。Raw URL 的分支是**部署脚本版本**，安装时填写的分支是**源码版本**，推荐一致；如用 `release/test`，Raw 地址写对应实际 Raw 文件链接，安装时也输入 `release/test`。后续更新保留上次成功选用的源码分支，不存在的分支在停机前失败。

GitLab/Gitea 等同理：将命令中的 HTTPS 地址替换为该平台给出的 `Tweb.sh` 原始文件链接。私有仓库可将部署脚本单独放在可信且可访问的 HTTPS 地址，实际源码通过已配置的 Git 凭据拉取；不能把需要登录的 HTML 页面当作 Raw 脚本地址。本包示例已使用当前远程仓库地址；如换仓库或换分支，请同步替换 Raw 脚本地址和安装时填写的源码仓库/分支。

已有本地源码包时仍支持 `sudo bash Tweb.sh` 进入菜单。旧版已装用户可下载根目录新版脚本后执行 `sudo bash Tweb.sh full`；成功后建立 Tweb 快捷入口，保留旧 academicctl 入口供过渡。

快捷命令：

```bash
Tweb          # 管理菜单；普通用户按需提示 sudo 密码
Tweb inspect  # 系统/VPN只读检测
Tweb full     # 从指定 Git 分支完整更新
Tweb logs     # 最近100行日志
```

私有仓库请预先给**执行部署的 root 身份**配置只读部署 SSH key 或正常 Git credential helper，并验证其访问权限；不要把 token 填进仓库 URL。脚本不复制你普通用户的私钥、不绕过主机指纹校验。可使用你已配置的 HTTPS 代理；sudo 是否保留代理取决于你的系统策略。

## 生产部署条件

- Ubuntu/Debian，systemd，sudo/root，支持 x86_64/arm64 的专用运行时自动安装；需能访问 Git、Node 官方站和 npm registry。
- 当前源码要求 Node **>=24.19.0 <25**，pnpm **11.19.0**，以本包 package.json/锁文件为准。自动安装使用 Node 官方 HTTPS 下载及 SHA-256 校验；无法下载指定版本时停止，不静默换大版本。
- 建议至少 4GB 内存构建并预留磁盘；备份需**完整现有目录空间＋至少1GiB余量**，依赖与生产构建也需要额外空间。完整备份包含依赖，体积可能较大。
- 使用全新的固定目录 `/opt/academic-suite`，不会自动接管旧 Python/PM2/容器部署，也不覆盖已占用的同名服务或专用账号。已有生产数据迁入需另行审核迁移，不能把初始化当数据导入。
- 教师仅监听 `127.0.0.1:8005`（可选端口），快传仅监听 `127.0.0.1:8787`。输入真实 HTTPS 源地址，配置既有 Nginx/Caddy 的 TLS 反代后才能从远端正常登录。程序启动成功不代表域名/TLS已配置。

## 更新与管理模式

| 命令 | 内容 | 数据行为 |
| --- | --- | --- |
| `install` | Git 拉取、依赖、迁移、生产构建、systemd、创建管理员 | 新建正式空库，不注入示例 |
| `source` | 拉取源码、安装锁定依赖、检查待迁移、构建 | 有待迁移则停止；启用快传时拒绝此模式，请用 full |
| `database` | 仅执行当前已安装源码的迁移 | 不拉 Git、不重建；执行前完整备份 |
| `full` | 拉取指定分支、依赖、迁移、重建 | 保留数据、密钥、上传；先备份 |
| `rebuild` | 用本机源码重新安装/补齐依赖并重建服务 | 不拉 Git、不删库、不重置管理员 |
| `toggle` | 启用/停用快传并重建教师站 | 停用不删除分享、文件和配置 |
| `backup` / `restore` | 停机完整备份 / 整体匹配恢复 | 恢复时原状态移动到 retired，不直接删除 |
| `bootstrap` | 初始化失败后补建数据库（网站）高级管理员 | 复用网站原有“仅首位管理员”保护，不重置现有账号 |
| `grant` | 输入教师 UID 授予快传管理权限 | 教师管理员不自动成为快传管理员 |
| `start` / `stop` | 启停托管服务 | 不更改网站数据 |
| `status` / `logs` / `inspect` | 状态、日志、系统网络检测 | 只读；停用快传时 status 显示 inactive 属正常 |
| `nginx` | 打印反向代理 location 示例 | 不自动改写现有 Nginx 或申请证书 |

操作后退出菜单，再输入 `Tweb` 进入。更新时有停机窗口，不是零停机部署。失败会保留现场，不自动重启可能与数据库不兼容的代码。用 `logs` 检查；可修复问题后 `rebuild`，或选择 `restore`。源码文件的本机改动会被 Git 版本覆盖，但保留在更新前的完整备份中。

“完全更新”不等于“清空所有数据”。本工具刻意不提供无备份一键删库。需要全新站点，建议另建主机/实例，避免误清正式数据。

## 数据、安全与恢复

正式教师数据位于 `/opt/academic-suite/app/academic-cms/data`、媒体位于 `academic-cms/media`；快传数据与签名密钥位于 `file-transfer/storage`；私有快传配置 `file-transfer/config.local.json`。这些目录不从 Git 覆盖；快传存储使用真实目录，不能改为符号链接。全局管理设置在 `/etc/academic-suite/settings.sh`（root-only），应用环境在 `site.env`（root写、服务账号读）。

首次安装自动执行结构迁移，再询问数据库（网站）高级管理员用户名、密码和确认密码（至少6位）。脚本通过现有 BootstrapService 写入数据库，生成正确密码哈希并授予网站全模块管理权限；不是普通注册账号，也不是 VPN 或 Linux 系统账号。无需手工写 SQL、复制密码哈希或默认账号密码。成功后移除 bootstrap token，密码不写入脚本/环境文件。

启用快传时，脚本继续询问是否同时授予该网站管理员快传管理权，默认是；调用快传自己的授权命令，不混用两套权限表。网站登录地址 `https://你的域名/zh/login`，教师后台 `/admin`，快传后台 `/transfer-admin/`。首次进入后台后设置网站名称/导航、教师资料、媒体、权限；快传配置实际网段、匿名与用户规则、日/月额度。正式空库不自动添加演示数据。

若安装中途停在创建管理员前，执行 `Tweb bootstrap` 可继续交互初始化；已创建管理员时，原有保护拒绝重复初始化，不覆盖账号或密码。若密码确认输入失败，可重新执行该命令。其他高级管理员由现有高级管理员在网站后台创建/分配权限；此初始化命令不是忘记密码的重置后门。快传授权失败时可执行 `Tweb grant` 并输入创建时显示的 UID 重试。

三个密钥分别随机生成。服务以专用非 root 账号执行，设置私有临时目录、禁止提权、日志交给 journal。依赖安装和应用构建也使用专用账号；请只部署自己审核过的仓库。

备份在 `/opt/academic-suite/backups/时间-PID`，包含源码、依赖、生产输出、双方数据库和上传、密钥、配置，属于敏感资料。请自行异地加密备份与制定保留策略，脚本不自动删除旧备份。恢复选目录名，会保留恢复前状态在 `/opt/academic-suite/retired-*`，**恢复后不自动启动**。校对数据与 VPN 额度后 `Tweb start`。

## VPN 检测及 HTTPS 接入

这里同时考虑 VPS（服务器）与 VPN（隧道/代理）。检测系统接口、默认路由、策略路由、监听端口、常见 VPN 服务及代理变量是否存在，不读取密钥，不承诺自动识别所有 VPN，也不自动测量供应商的日/月配额。没有发现 VPN 服务不等于链路免费。

局域网直连优先策略、匿名与用户分级、LAN 限速、计费链路与每日/月额度，仍集中在快传后台管理。初始策略不会因脚本检测到网卡而自动放行。首次部署后使用 `grant` 授权管理员，再访问 `/transfer-admin/` 完成实际网段、路径、配额及硬出口限制配置。参见 `file-transfer/docs/deployment.md` 和相关流量说明。

`Tweb nginx` 输出示例，合并到你现有 HTTPS server 段，证书沿用现有配置。检查 `nginx -t` 后再 reload。必须传递 WebSocket 升级头，`/transfer-api/` 仍代理到教师服务，不能直连 8787 绕过身份桥。参考 [Nginx WebSocket 官方说明](https://nginx.org/en/docs/http/websocket.html)。分支克隆语义参考 [Git clone 官方文档](https://git-scm.com/docs/git-clone)。

部署脚本不会自动变更防火墙、DNS、TLS证书或VPN流量硬限制。公网只需通过你已有的 HTTPS 入口访问；不要暴露 8005/8787，也不要将未知反代链直接设为可信。默认信任一跳本机反代；如果反代结构不同，须审核 site.env 中的可信代理跳数。

## 验证范围

随包 `test-examples/README.md` 有自动测试、示例账号及人工验收清单。交付时的实际测试结果见 `test-examples/TEST-RESULTS.md`。脚本未在你的 Windows/Ubuntu/Debian 主机上执行安装，未替你操作 Git 远程仓库、服务器、VPN、防火墙或证书。附件 `start_ubuntu.sh` 是旧 Python 开发启动入口，本包用新的 Nuxt 生产构建与 systemd 方案替代，不调用 `tools.dev_server`。
