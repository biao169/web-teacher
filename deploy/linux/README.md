# Ubuntu / Debian 部署与 tweb 管理（0.15.94）

本轮提供可以在目标主机执行的部署代码，未连接或修改真实服务器。支持运行 systemd 的 Ubuntu/Debian；网站需要 Python 3.12+ 和 venv。Ubuntu 24.04+、Debian 13 的默认 Python 满足这一最低要求；使用旧发行版时，请先准备符合要求的解释器，传 `--python /实际路径/python3.12`。脚本不替换系统 Python，也不添加第三方 apt 源。

## GitHub 项目准备与一条指令安装

把压缩包中 `teacher-site/` 内的文件上传到仓库根目录。根目录必须能直接看到 `install.sh`、`pyproject.toml`、`backend/`、`database/`、`deploy/`。本版本自动下载针对公开 GitHub 仓库，不在仓库 URL 中放入令牌或密码。部署的仓库/分支代码将以管理员权限执行，使用自己审核的版本。

在 Ubuntu/Debian 的交互式 SSH 终端执行下面**一行命令**。仓库默认 `https://github.com/biao169/web-teacher.git`，分支默认 `web-py`；只需把 teacher.example.org 替换为实际域名。URL 中带斜杠的分支写作 `feature/name` 即可。需要已安装 `curl`；没有时先 `sudo apt-get update && sudo apt-get install -y curl`。

```bash
( f=$(mktemp) && trap 'rm -f "$f"' EXIT && curl --fail --show-error --location --proto '=https' --tlsv1.2 'https://raw.githubusercontent.com/biao169/web-teacher/web-py/install.sh' -o "$f" && sudo bash "$f" --domain 'teacher.example.org' --port 8003 )
```

若需要指定本机监听端口，修改或追加 `--port 8005`；省略时交互式终端会提示输入，默认 `8003`。若需要指定解释器，在末尾追加 `--python /opt/python/bin/python3.12`。解释器必须有 venv 支持，并能被 teacher-site 系统用户访问；不要放在 `/root` 或个人家目录内，因为服务隔离禁止访问家目录。

不用 `curl | bash`，保留终端输入，安装期间才能输入管理员名和密码。管理员密码交互输入，不写入命令行、安装状态或脚本。脚本安装 git、ca-certificates、python3、python3-venv，然后准备独立虚拟环境、当前锁文件依赖、唯一数据库结构和 systemd 服务。

安装完成表示**本机应用健康检查通过**；完成 DNS、反向代理与 HTTPS 配置后才可从公网使用。主站、后台和快传共用安装时选择的 `127.0.0.1:端口`，不新增快传端口。浏览器入口是 `https://域名/`、`/admin`、`/transfer`。

## 常用命令

无参数运行 `sudo tweb` 显示中英文菜单，每个选项都带简短说明。以下命令也可直接执行：

| 命令 | 内容 |
| --- | --- |
| `sudo tweb status` | systemd 当前状态 |
| `sudo tweb start / stop / restart` | 分别启动、停止、重启；写其中一个动词，不要照抄斜杠 |
| `sudo tweb logs` | 查看最近 100 行并持续输出服务日志，Ctrl+C 退出 |
| `sudo tweb paths` | 网站 URL、源码、数据库、媒体、日志和配置位置 |
| `sudo tweb doctor` | 服务、监听端口、UFW/firewalld/nftables/iptables、Nginx 配置与 Caddy 安装情况 |
| `sudo tweb proxy` | 输出当前域名的 Caddy 与 Nginx 配置片段及检查命令 |
| `sudo tweb update` | 从已保存仓库/分支更新整站源码和锁定依赖 |
| `sudo tweb update --branch staging` | 改为指定分支，成功后保存此分支 |
| `sudo tweb update --repo https://github.com/biao169/web-teacher.git --branch web-py` | 更换仓库与分支 |
| `sudo tweb update-source` | 只更新源码，复用现有依赖，不初始化数据库 |
| `sudo tweb update-deps` | 只按当前锁文件更新 Python 依赖 |
| `sudo tweb update-db` | 只初始化空库或核验当前数据库结构 |
| `sudo tweb update-service` | 只重生成 systemd 服务和反向代理片段 |
| `sudo tweb update --scope frontend` | 前台局部更新；后端、SQL、快传、部署代码和 pyproject 必须与当前一致，否则拒绝并提示整站更新 |
| `sudo tweb db-init` | 空库初始化并创建管理员；已有库只核验当前结构及管理员状态 |
| `sudo tweb db-update` | 与 db-init 相同：确保数据库符合当前源码，不执行历史迁移 |
| `sudo tweb db-reset` | 输入 RESET 后，停服并按新站重建数据库、重新创建管理员 |
| `sudo tweb update --reset` | 先确认 RESET，获取新版本，再以新版本 SQL 重建数据库 |
| `sudo tweb uninstall` | 输入 DELETE 后完全删除本工具管理的站点 |

也可以使用 `sudo tweb update --scope source|deps|db|service|frontend|all`。自动化操作可传 `--confirm RESET` 或 `--confirm DELETE` 代替破坏性操作的文字确认；新管理员创建仍需终端密码输入。普通启动/更新不自动清空数据库。开发需要每次新站时使用 Windows `start.cmd`，或 Linux 的 `update --reset` / `db-reset`。所有新命令不做迁移、备份；旧结构不匹配时停止更新并提示使用明确的重置流程。

数据库重置删除主数据库及 SQLite 侧文件，账号、站点内容和快传任务一并重建。物理媒体和快传文件不随数据库重置删除；只有卸载会把本站物理文件一起删除。

整站更新先下载源码和安装依赖，再停服核验数据库、切换源码并检查健康。只更新源码会复用现有 `.venv`，不运行 pip、不碰数据库，适合小改动；依赖或数据库结构变化时改用整站更新或对应独立命令。下载/依赖失败不停止现有服务。无重置的更新若健康失败，会切回本次更新前的代码；这是失败恢复，不创建数据库备份。成功后删除旧源码版本。**执行重置后不能恢复旧数据**；失败时保留新代码并停服，使用 `logs`、`db-init`、`start` 修复。

服务内存限制沿用原配置：MemoryHigh=160M、MemoryMax=224M。它限制整个服务，不是单文件大小；需要按服务器资源及真实传输负载验收后调整 systemd unit。全局更新更新源码/依赖，不覆盖已安装的 systemd 运行参数或管理员手动调整的配置；新增版本若需要改服务参数，应依说明修改并执行 `sudo systemctl daemon-reload && sudo tweb restart`。

## 文件位置与权限

| 位置 | 用途 |
| --- | --- |
| `/usr/local/bin/tweb` | 终端管理入口 |
| `/opt/teacher-site/tweb.py` | 独立管理程序，可用于失败安装的卸载 |
| `/opt/teacher-site/current` | 当前版本符号链接 |
| `/opt/teacher-site/releases/…` | 源码和该版本 `.venv` |
| `/opt/teacher-site/transfer-data/files` | 快传文件；当前项目根目录下的 `transfer-data` 链接到此目录 |
| `/opt/teacher-site/transfer-data/cache` | 快传缓存 |
| `/etc/teacher-site/storage.toml` | 数据路径配置；默认统一受控路径 |
| `/etc/teacher-site/teacher-site.env` | HTTPS 来源及网站环境配置 |
| `/etc/teacher-site/install.json` | 仓库/分支、安装状态和管理文件校验，不保存登录密码 |
| `/etc/teacher-site/generated/` | 反向代理与服务参考配置 |
| `/opt/teacher-site/data/database/site.sqlite3` | 唯一在用数据库，包含快传元数据 |
| `/opt/teacher-site/data/media` | 网站媒体 |
| `/opt/teacher-site/data/cache` | 网站缓存 |
| `/opt/teacher-site/data/service.log` | 服务运行日志；可按运维策略配置 logrotate |
| `/etc/systemd/system/teacher-site.service` | 单一网站服务 |

源码、解释器和配置归 root；非登录系统账号 teacher-site 只能写站点数据和快传目录。安装拒绝接管已有非空目录、同名账号/服务或 tweb 命令。目录有归属标记，卸载前核对。默认不支持把数据改到上述目录之外；自行外置的数据无法由本工具识别并彻底卸载。

## 反向代理与防火墙

`sudo tweb doctor` 只读取检查信息。并存多个防火墙时分别报告，不自动启用、清空或改写规则；云平台安全组无法从主机内可靠判断，需要在云控制台检查。仅为公网开放实际 SSH 端口、TCP 80/443，不对公网开放本机网站端口。两种反代任选一种：

- **Caddy**：将 `sudo tweb proxy` 输出的 Caddy 片段合并至 `/etc/caddy/Caddyfile`；不要直接 import `/etc/teacher-site/generated/`，该配置目录只允许 root 和站点账号读取。运行 `sudo caddy validate --config /etc/caddy/Caddyfile`，通过后 `sudo systemctl reload caddy`。完成 DNS 与证书验证所需网络配置后，Caddy 管理 HTTPS。
- **Nginx**：在对应域名已配置 TLS 和证书的 `server` 块中加入生成的 `location` 片段，保留其他站点；`sudo nginx -t` 通过后 `sudo systemctl reload nginx`。提供的是 location 片段，不是可单独启用的完整 TLS 站点文件，证书路径使用自己的实际路径。

Nginx 片段关闭请求/响应缓冲，避免在线快传被额外整段缓存；具体文件限额仍使用后台已有设置。Caddy 不配置 request_buffers/response_buffers。网络路径和浏览器是否使用点对点直传仍取决于原快传功能、网络和 HTTPS 环境，本次没有修改传输协议。

官方参考：
- Nginx：https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Caddy：https://caddyserver.com/docs/caddyfile/directives/reverse_proxy
- systemd：https://manpages.debian.org/trixie/systemd/systemd.exec.5.en.html
- Python：https://www.python.org/downloads/

## 卸载边界和失败处理

`uninstall` 停止并禁用本站服务，删除全部受管版本/虚拟环境、主数据库、媒体、快传文件/缓存、配置、本站服务日志、tweb 入口和本站系统账号/组。未修改的受管 systemd unit 一并删除。目录内指向外部的符号链接只删除链接，不删除目标。

如果入口或 systemd unit 被人工改动，卸载会先停止操作并显示具体文件，避免删除可能已改作其他用途的配置。需要确认仍属于本站后，恢复该文件原始受管内容再卸载。脚本不卸载共用 Python/git/Nginx/Caddy，不删除系统共用日志，也不会删除手动合并到外部代理的配置或证书；卸载后自行移除该域名的代理段。这些共用资源不属于本站。

首次安装中断时，管理目录和 tweb 入口保留，可用 `tweb paths` 查看阶段，`tweb uninstall` 清理后重装。若失败发生在创建入口之前，请按错误中显示的路径检查；不要把其他站点目录强行删掉。数据库初始化/启动失败时，可从 `tweb logs` 查看原因。无任何真实服务器测试成功的隐含承诺，部署后必须完成 HTTPS 登录、上传下载及服务重启验收。

当前部署在项目目录中持久保存 data/，每个源码版本的 data 链接到此目录，源码更新不会删除数据库/媒体；Windows 和直接启动默认使用项目根目录 data/。默认首页语言为英文。


### 上传到 GitHub 的 web-py 分支

将压缩包中 `teacher-site/` 内的全部源码放在仓库根目录，包含 `.gitignore`、`.gitattributes`、`release-manifest.json`，不要额外套一层 `teacher-site/`。默认仓库为 `https://github.com/biao169/web-teacher.git`，分支为 `web-py`。直接上传本次完整源码可使用已有发布清单；如果修改了代码、文档或添加文件，提交前在根目录执行：

```bash
python -B -m deploy.vps.release manifest --refresh
python -B -m deploy.vps.release verify
```

把刷新后的清单与源码放在同一个提交中。清单只做文件完整性校验，不能代替对仓库代码来源的信任。部署在安装 Python 依赖、切换版本之前执行校验；清单不匹配会停止，请在开发端重新生成并提交。

`.gitattributes` 保持文件原始字节，避免 Git 的 `core.autocrlf` 改写发布内容；`.sh` 强制 LF，现有 `.cmd` 保留 CRLF。初始化仓库时先放入该文件再添加源码。已有 Git 工作区应用本规则后，可执行 `git add --renormalize .`，检查变更，再重新生成清单并提交。安装命令使用 `bash install.sh`，不依赖从 ZIP 保留可执行位。

`.gitignore` 排除默认数据库/媒体/缓存目录、环境凭据、本机配置、虚拟环境和压缩包；自定义到其他位置的运行目录也应单独排除。不要把运行数据上传到源码仓库。

首次安装默认使用 web-py。`sudo tweb update` 使用已保存的安装来源，不强行覆盖管理员选择的分支。已有站点如需切换到本仓库，执行：

```bash
sudo tweb update --repo https://github.com/biao169/web-teacher.git --branch web-py
```

本步骤仅变更部署配置和发布流程；数据库结构、教师网站功能及文件快传功能不变。GitHub 分支需先上传并可读取，才能执行云端真实安装。
