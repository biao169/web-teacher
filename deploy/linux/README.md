# Ubuntu / Debian 部署与 tweb 管理（0.15.110）

需要运行 systemd 的 Ubuntu/Debian、Python 3.12+ 和 venv。脚本不替换系统 Python。主站与快传共用一个服务和一个内部端口；操作同一受管安装的命令互斥执行。

## 一键安装和端口

将压缩包内 teacher-site 目录中的文件上传到 GitHub 仓库根目录：应直接看到 install.sh、pyproject.toml、backend、deploy 和 release-manifest.json。默认仓库是 `https://github.com/biao169/web-teacher.git`，分支为 `web-py`；只执行自己审核过的仓库代码。

在有 curl 的交互式 SSH 终端运行以下一行，将域名换成自己的：

```bash
( f=$(mktemp) && trap 'rm -f "$f"' EXIT && curl --fail --show-error --location --proto '=https' --tlsv1.2 'https://raw.githubusercontent.com/biao169/web-teacher/web-py/install.sh' -o "$f" && sudo bash "$f" --domain 'teacher.example.org' )
```

未传 `--port` 时，交互终端会询问内部应用端口，回车使用 8003；非交互运行使用默认值。可以显式指定：

```bash
sudo bash install.sh --domain teacher.example.org --port 9103 --python /opt/python/bin/python3.12
```

`--repo`、`--branch` 可更换来源。解释器应使用可被服务账号访问的绝对路径，不能放在 /root 或个人家目录。端口范围 1024–65535；安装和改端口前检查冲突，不终止占用端口的其他程序。服务只监听 `127.0.0.1`，不对公网裸露 HTTP。外部 HTTPS 端口仍由 nginx/Caddy 配置，主站和快传不需要额外端口。

安装会准备系统依赖、虚拟环境、数据库和服务账号，并交互创建网站管理员。完成前用服务账号实际创建/删除探测文件、读取源码和存储配置，检查目录访问权限。安装失败保留受管入口用于诊断或卸载。

直接启动不安装系统服务：`bash start.sh --port 9103`，或 `TEACHER_PORT=9103 bash start.sh`。`start-transfer.sh` 复用同一入口。所有 .sh 在根目录，所有 .cmd 在 deploy 下。

## 彩色双语管理菜单

输入 `tweb` 即进入同时显示中英文的菜单，每项带说明。非 root 用户由入口通过 sudo 请求操作系统管理员权限；不改变 sudo 授权规则。安装时指定的 Python 同样用于管理入口。

菜单包含状态、启动、停止、重启、日志、分项更新、端口、数据库初始化/重建、清理预览/执行/状态、权限检查/修复、诊断、路径、代理示例及分项删除。每次只执行一个所选操作，完成后直接退出管理菜单。主菜单或子菜单留空、输入 0 或输入结束均退出，不重新显示菜单；持续日志按 Ctrl+C 结束。失败或中断后也不回到菜单。

执行时显示带编号的双语步骤日志、状态和耗时，普通子命令输出实时保留。重启网站记录停止服务、加载服务定义、启动、健康检查；防火墙与 nginx/Caddy 配置未变时显示 SKIP，不假装执行重启，也不影响其他站点。命令行直接调用具有相同日志。

支持 ANSI 的终端使用颜色区分标题、选项、成功和错误；重定向输出、TERM=dumb 或 `NO_COLOR=1 tweb` 不输出颜色控制符。无终端输入时不循环等待菜单，而是显示帮助；自动化应指定子命令。

## 更新范围

| 命令 | 实际范围 |
| --- | --- |
| `tweb update --scope all` | 下载并校验源码、安装该版锁定依赖，停服初始化/核验数据库后切换版本；默认不清空数据 |
| `tweb update --scope source` | 下载并校验源码，数据库与依赖定义兼容时替换源码；不执行 pip 或数据库命令，保留原虚拟环境绝对路径 |
| `tweb update --scope frontend` | 替换 frontend 中的模板/CSS/JS；后端、数据库、快传与部署代码必须兼容。仅版本号变化不阻止操作 |
| `tweb update --scope dependencies` | 不下载仓库，按已安装源码的锁文件同步依赖 |
| `tweb update --scope database` | 不下载仓库；调用已有数据库升级/核验入口，再核验管理员；不会自动重置 |
| `tweb update --scope config` | 刷新受管服务文件和代理示例；保留存储配置、环境变量以及其他服务参数 |

下载型更新可以附加 `--repo` / `--branch`，成功后保存来源；其余范围不接受仓库、分支或重置参数。仅源码模式遇到 schema、依赖锁或项目依赖定义变化时，在停服前拒绝，提示整站更新。

整站更新沿用原先下载后准备、健康检查失败恢复代码的流程；成功后删除前一源码版本。源码和界面单独更新在原版本目录中替换受管源码对象，不复制虚拟环境，避免依赖脚本里的解释器绝对路径失效。局部源码/依赖更新失败时保持停服，重试相同命令或使用整站更新修复；没有另外保留旧源码备份。数据和配置目录不会随源码切换删除。

`db-init` 用于空库初始化或现有结构核验。`db-update` 等同 database 更新范围：已是当前结构时只核验；仅已有升级器识别的旧结构可以升级，它会沿用原有旧结构快照行为，不新增迁移机制；未知结构拒绝修改并停服。开发按新站使用仍可直接执行 `db-reset` 或 `update --reset`，输入 RESET 后重建所有数据库记录，不备份也不保留旧账号。媒体/快传磁盘文件不会随重建删除。

本版本数据库表与索引不变，从 0.15.107 更新不需要数据库升级或重建。

## 修改端口与代理

```bash
tweb port 9103
tweb proxy
```

不传数字时可交互输入。端口保存在安装状态中，健康检查和后续更新使用同一个值。修改时同步 systemd 和生成的代理示例，服务之前正在运行才自动重新启动；失败会恢复原端口、服务文件与示例并尝试恢复原运行状态。

**需要自行同步实际代理配置。** 脚本只更新示例，避免覆盖已有站点、证书或防火墙。Caddy 把片段合并到 `/etc/caddy/Caddyfile`，校验后 reload；Nginx 把 location 片段合并到已有 TLS server，执行 nginx -t 后 reload。不要直接导入 root 管理目录中受限访问的示例文件。端口修改到代理重载之间，公网访问可能短暂不可用。

`doctor` 检查服务、监听端口及系统已安装的防火墙/代理工具，不修改规则。云安全组只开放实际 SSH 端口及所需的 80/443，内部应用端口不需要对公网开放。

## 分项删除与恢复

所有删除都先显示受管路径并要求确认词，自动化可用 `--confirm` 传入相同词；传错时不停止服务、不删除文件。

| 命令范围 | 删除对象 | 确认词 | 后续 |
| --- | --- | --- | --- |
| `remove --scope cache` | 主站缓存、快传缓存 | DELETE-CACHE | 保留数据库译文；原来运行则重新启动 |
| `remove --scope logs` | 本站 logs 目录及旧 service.log | DELETE-LOGS | 保留审计数据库记录和系统日志；服务启动会写新日志 |
| `remove --scope media` | 所有网站媒体物理文件 | DELETE-MEDIA | DB 引用保留，但旧资源将不可读取 |
| `remove --scope transfer` | 所有快传物理文件和缓存 | DELETE-TRANSFER | 任务/计量记录保留，未接收文件不可继续下载 |
| `remove --scope database` | 受管 database 目录，含库、SQLite 侧文件、旧快照 | DELETE-DATABASE | 保持停服；运行 db-init 创建管理员，再 start |
| `remove --scope source` | releases 内源码和依赖、current 链接 | DELETE-SOURCE | 保留数据、配置、tweb；运行 update --scope all 恢复，再 start |
| `remove --scope all` 或 `uninstall` | 本站全部受管文件、配置、服务、命令、账号及组 | DELETE | 完整卸载本站 |

删除媒体/快传文件不会替你修改数据库业务关系；只删除某条媒体及其记录，应使用网站后台的媒体管理。这里提供的是运维层面的批量文件清空。

发生删除或权限错误时保持服务停止，修复权限后重试。完整卸载不删除系统共用软件、系统日志、手动合并到外部代理的配置或证书，避免影响其他站点。外部代理配置应另行移除本站域名部分。

## 目录与权限

| 路径 | 用途与访问 |
| --- | --- |
| `/opt/teacher-site/current` | 当前源码链接；root 管理源码和虚拟环境 |
| `/opt/teacher-site/releases/…` | 当前源码/依赖；成功整站更新删除前一版 |
| `/opt/teacher-site/data/database/site.sqlite3` | 唯一活动数据库 |
| `/opt/teacher-site/data/media`、`cache`、`logs` | 主站媒体、缓存、轮转日志 |
| `/opt/teacher-site/transfer-data/files`、`cache` | 快传持久文件与缓存 |
| `/etc/teacher-site` | 存储配置、环境文件、安装状态及 generated 示例 |
| `/opt/teacher-site/tweb.py`、`/usr/local/bin/tweb` | 管理实现和入口 |
| `/etc/systemd/system/teacher-site.service` | 单一网站服务 |

不新增并行缓存或备份目录。源码版本内 data / transfer-data 链接到上述持久目录。数据与快传目录仅 teacher-site 系统账号可读写；配置由 root 管理，服务账号可读；安装状态仅 root 可读。不使用 777。

`tweb permissions` 以服务账号进行实际读写探测；`tweb permissions --repair` 暂停服务，恢复受管数据目录和配置权限，再检查，成功后按原状态启动。它不重写未知外部路径或修改系统解释器权限。管理路径经过符号链接、存储配置改到默认管理范围外，或者 unit/入口被外部修改时，相关删除/修改会拒绝执行。目录内链接只删除链接，不删除外部目标。

## 发布和验证

修改源码、文档或脚本后，在提交 GitHub 前执行：

```bash
python -B -m deploy.vps.release manifest --refresh
python -B -m deploy.vps.release verify
```

清单与源码放入同一提交；使用包内 .gitattributes 避免 Windows 换行转换造成校验失败。不要上传 data、transfer-data、虚拟环境、本机配置或凭据。本交付包已生成清单。

验证覆盖隔离目录下的分项更新/删除、端口/回滚、菜单、权限探测，以及实际本地服务进程更新、重启和卸载；未在真实 Ubuntu/Debian 主机安装或改动系统服务，也未推送 GitHub。上线后仍需完成真实系统账号、sudo、代理 HTTPS 和快传验证。

## 健康检查失败排查（v0.15.110）

健康检查连接保存的本地端口并携带安装域名 Host，要求返回本站的健康 JSON。HTTP 400/401/403/404 会直接提示状态码和配置检查方向；拒绝连接/超时会保留最近原因。生产域名不需要在本地健康检查中解析 DNS。旧版缺少 Host 可造成正常服务误报，先按根目录 README 的步骤替换受管 tweb.py，再重启；无需重建数据库。若仍失败，检查应用日志与 systemd journal，不能靠重启防火墙或删除数据库解决所有启动错误。
