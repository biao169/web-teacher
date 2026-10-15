# 教师个人网站：部署与使用手册

本项目提供教师与团队的中英文公开网站、统一内容后台、媒体库、论文引文与翻译、角色权限、两站数据同步和文件快传。页面使用服务端 HTML 模板与原生 JavaScript，无须编译 Vue/Nuxt 前端。

本文按随附源码的实际入口编写，面向 Windows 本机使用、Ubuntu/Debian 长期运行，以及 **Cloudflare 网页控制台连接 Git 仓库部署**。文中的域名、仓库、目录、资源 ID 和令牌均须替换为自己的值；不要原样使用示例域名创建 Worker。

## 目录

1. [功能与网站入口](#1-功能与网站入口)
2. [项目关键文件](#2-项目关键文件)
3. [Windows 部署与使用](#3-windows-部署与使用)
4. [Ubuntu/Debian 部署与管理](#4-ubuntudebian-部署与管理)
5. [Cloudflare Worker 网页版部署](#5-cloudflare-worker-网页版部署)
6. [后台使用与两站同步](#6-后台使用与两站同步)
7. [缓存、登录与平台差异](#7-缓存登录与平台差异)
8. [备份、更新与故障定位](#8-备份更新与故障定位)
9. [进一步阅读](#9-进一步阅读)

## 1. 功能与网站入口

| 功能 | 用途 |
| --- | --- |
| 教师、学生与研究方向 | 管理个人资料、学术链接、学生分类、简介、联系方式和媒体；公开范围由后台控制 |
| 项目、论文、专利/软著、课程 | 展示成果与附件；论文支持多种引文、复制、通讯作者和多值标签；课程资料可单独控制可见性 |
| 新闻动态 | 发布分类新闻、图片/视频、富文本与 PDF 正文，关联相关成果 |
| 首页、导航与按钮 | 设置首页展示、Logo、站名、中英文导航、固定筛选入口、页脚及外链 |
| 后台与权限 | 账号、角色、可见性和增删改权限；前台登录显示不能替代服务端鉴权 |
| 媒体、数据与运行维护 | 上传与引用管理、回收站、数据工具、日志与公开缓存维护 |
| 翻译与论文服务 | 通过后台设置启用服务、填密钥和设置优先级；管理原文、人工译文、批量任务与论文元数据 |
| 两站同步 | 配置对端、授权模块、连通性检查、手动/定时同步及任务进度；支持 Worker 和本地服务器 |
| 文件快传 | 与主站共用账号和 HTTP 入口，支持既有局域网/广域网、缓存及文件夹传输能力，受浏览器和权限限制 |

常用地址：

| 地址 | 说明 |
| --- | --- |
| `/zh`、`/en` | 中文/英文首页 |
| `/{lang}/profiles`、`students`、`research_interests` | 教师、学生、研究方向；例如 `/zh/students` |
| `/{lang}/projects`、`publications`、`patents`、`courses`、`news` | 相应公开模块 |
| `/{lang}/n/{url_name}` | 后台“导航与按钮”生成的固定入口，不手工猜测导航 ID |
| `/admin` | 后台及登录入口；登录后按角色显示功能 |
| `/admin/site-sync` | 两站同步管理 |
| `/transfer` | 同站文件快传，无须另开端口 |
| `/health/ready` | 部署就绪检查；不代表全部业务均已验证 |
| `/robots.txt`、`/sitemap.xml` | 由站点地址与公开内容生成的爬虫规则、站点地图 |
| `/setup` | **Worker 空账号库**的首次管理员设置，需要初始化 Secret；不是日常登录页 |

`{lang}` 为 `zh` 或 `en`。导航、公开记录及部分后台功能需管理员先配置；空站没有演示内容是正常情况。

## 2. 项目关键文件

仓库根目录应直接包含下表文件，不要把整个 `teacher-site/` 文件夹再套进仓库一层，否则 Worker 构建根目录和安装脚本会找不到源码。

| 路径（相对项目根目录） | 作用 |
| --- | --- |
| `install.sh`、`install-multi.sh` | Ubuntu/Debian 单实例、隔离多实例安装入口 |
| `start.sh`、`start-transfer.sh` | Linux 直接启动；快传仍共用主服务 |
| `deploy/windows/` | 所有 Windows `.cmd` 启动、示例与测试命令 |
| `deploy/shared/launcher.py`、`bootstrap.py`、`service.py` | 本地初始化、虚拟环境与依赖准备、单进程 HTTP 服务 |
| `deploy/shared/config/storage.example.toml` | 本地存储配置模板 |
| `deploy/shared/requirements/requirements-vps.lock` | Windows/Linux 运行依赖锁定文件 |
| `deploy/linux/tweb.py` | Ubuntu/Debian 安装与管理命令实现 |
| `deploy/cloudflare/build.py`、`pipeline.py` | Worker 检查、临时构建、资源验证和发布 |
| `deploy/cloudflare/pyproject.toml`、`uv.lock`、`pylock.toml`、`package-lock.json` | Worker Python/SDK/Node 工具链与依赖锁定 |
| `deploy/cloudflare/runtime/`、`site_workers.py` | Worker 路由、公开缓存、Admin 分工与运行资源 |
| `database/schema.sql` | 当前统一初始化结构；旧站升级应使用已有升级器，不直接重建 |
| `backend/app/config.py` | `Settings.from_env`：本地 TOML 与环境变量读取及路径校验 |
| `backend/cli.py` | 本地显式初始化、首个管理员、结构核验与维护命令 |
| `backend/app/native/` | 原生内容、权限、模板上下文、Read Model 与维护服务 |
| `frontend/public/`、`frontend/admin/`、`frontend/shared/` | 前台、后台和共用模板/JS/CSS/静态资源 |
| `site_sync/`、`transfer/` | 两站同步、文件快传源码 |
| `release-manifest.json` | 发布文件清单；自行替换发布文件后应按原打包工具刷新清单 |
| `docs/README.md`、`docs/SOURCE.md`、`docs/OPERATIONS.md` | 完整功能、函数/路由索引、运维与策略说明 |

## 3. Windows 部署与使用

### 3.1 环境和首次准备

1. 安装 **Python 3.12 或以上**，确保含 `venv`；网页正常运行不需要 Node.js。
2. 解压到固定目录，例如 `D:\TeacherSite`。在该目录能看到 `backend`、`deploy`、`pyproject.toml`。
3. 在 CMD 进入项目根目录，复制本机配置模板：

```bat
cd /d D:\TeacherSite
copy deploy\windows\local.example.cmd deploy\windows\local.cmd
notepad deploy\windows\local.cmd
```

例如填写以下内容；`set "变量=值"` 的引号在赋值语句外，不在值中再加一层引号：

```bat
@echo off
set "TEACHER_PYTHON=C:\Python312\python.exe"
set "TEACHER_PORT=8003"
set "TEACHER_NO_PAUSE=1"
```

`local.cmd` 是私有本机配置，不提交仓库。首次启动会创建/复用虚拟环境并安装锁定依赖，需要联网；以后按锁文件变化决定是否更新依赖。

### 3.2 选择正确的启动命令

以下命令均在项目根目录执行：

| 命令 | 行为与用途 |
| --- | --- |
| `deploy\windows\start-normal.cmd` | **普通站点推荐**。按 `TEACHER_CONFIG` 或默认存储启动，保留已有数据；首次空库提示创建管理员 |
| `deploy\windows\start.cmd` | **重建开发数据库、填充示例，再启动**。只用于可丢弃开发环境，不用于保留正式数据 |
| `deploy\windows\start-existing.cmd` | 使用已有开发库启动，不重新重建；与开发配置对应 |
| `deploy\windows\rebuild.cmd` | 仅重建开发库并填示例，不启动服务 |
| `deploy\windows\add-demo-data.cmd` | 追加基础开发示例；普通站点需加 `--profile normal` |
| `deploy\windows\add-frontend-examples.cmd` | 导入扩展示例，按脚本要求先停服；不是日常启动命令 |
| `deploy\windows\start-transfer.cmd` | 快传兼容入口，仍启动同一主服务，不是第二个服务器 |
| `deploy\windows\test.cmd` | 临时数据库验收，不重建正在使用的网站数据 |

普通使用：

```bat
deploy\windows\start-normal.cmd
```

首次输入管理员账号、密码及确认密码。默认访问 `http://127.0.0.1:8003/zh`、`http://127.0.0.1:8003/admin`。主站只监听本机；关闭前台进程用 `Ctrl+C`，修改配置后重新启动。`start-normal.cmd` 正常不会每次清库。

### 3.3 Windows 变量与文件路径

| 变量 | 默认/示例 | 控制内容 |
| --- | --- | --- |
| `TEACHER_PYTHON` | Python 可执行文件绝对路径 | 选择解释器，优先级最高，须 3.12+ |
| `TEACHER_VENV` | 项目 `.venv` | 运行虚拟环境目录 |
| `TEACHER_PORT` | `8003` | 本地网站与快传共用端口 |
| `TEACHER_CONFIG` | 外部 `storage.toml` 路径 | 普通启动使用的存储配置；开发重建忽略此项 |
| `TEACHER_ORIGIN` | 自动得到本机地址 | 站点主地址及来源校验；本地端口变化时同步核对 |
| `TEACHER_NO_PAUSE` | 设 `1` | 不在脚本结束时停留等待按键 |
| `TEACHER_DEV_ROOT` | 项目 `data` | 可重建开发数据根目录，仅开发入口使用 |
| `TEACHER_DEV_DATABASE_PATH` | `database\site.sqlite3` | 开发 SQLite 路径，相对开发根目录 |
| `TEACHER_DEV_MEDIA_DIR`、`TEACHER_DEV_CACHE_DIR` | `media`、`cache` | 开发媒体与缓存目录 |
| `TEACHER_DEV_TRANSFER_DIR`、`TEACHER_DEV_TRANSFER_CACHE` | `transfer-data\files`、`transfer-data\cache` | 开发快传文件/缓存目录 |
| `TEACHER_DEV_ADMIN_USER` | `admin` | 重建开发库时的测试管理员 |
| `TEACHER_DEV_ADMIN_PASSWORD` | 不填则交互输入 | 仅测试用密码，勿使用正式密码 |

没有外部配置时，普通站点主要数据为 `D:\TeacherSite\data\database\site.sqlite3`、`data\media`、`data\cache`、`data\transfer-data\files`、`data\transfer-data\cache`；日志为 `data\logs\service.log`。开发模式以 `TEACHER_DEV_ROOT` 及相应变量为准，不把普通站点与开发库当作两套自动隔离的数据：**默认根目录相同，保留数据应使用普通启动并另配开发目录。**

希望数据脱离源码目录时，复制 `deploy/shared/config/storage.example.toml` 到自己的目录，填写绝对路径，在 `local.cmd` 设置 `TEACHER_CONFIG`。具体 `[storage]` 字段见下一节；Windows TOML 路径可使用 `D:/TeacherSiteData/...`，避免反斜杠转义。

## 4. Ubuntu/Debian 部署与管理

### 4.1 前提与源码来源

需要运行 systemd 的 Ubuntu/Debian、管理员权限、Git、Python **3.12+** 和对应 `venv` 支持。安装脚本不会替换系统 Python；若系统默认 Python 较旧，先准备符合要求且服务账号可访问的解释器，再传 `--python`。不要将正式服务解释器放进 `/root` 的私有目录。

把审核过的项目提交到自己的 Git 仓库。以下使用项目默认仓库和分支；若使用自己的仓库，克隆和安装参数都应替换：

```bash
git clone --branch web-py --single-branch https://github.com/biao169/web-teacher.git teacher-site
cd teacher-site
```

安装脚本会重新从指定 `--repo`/`--branch` 获取源码，不会把当前目录中尚未提交的修改当作已发布内容。

### 4.2 安装一个站点

单实例入口示例：

```bash
sudo bash install.sh \
  --repo https://github.com/biao169/web-teacher.git \
  --branch web-py \
  --domain teacher.example.org \
  --port 8003 \
  --python /usr/bin/python3.12 \
  --pip-source pypi
```

按照终端提示创建首个管理员。域名填主机名，不加 `https://`；应用端口为内部端口，不是公网 HTTPS 端口。

推荐需要多站点或独立命令时，使用隔离实例入口：

```bash
sudo bash install-multi.sh \
  --repo https://github.com/biao169/web-teacher.git \
  --branch web-py \
  --instance lab \
  --command tweb-lab \
  --base /opt/teacher-site-lab \
  --domain teacher.example.org \
  --allowed-origins https://www.teacher.example.org \
  --port 8003 \
  --python /usr/bin/python3.12 \
  --pip-source pypi
```

`install-multi.sh` 支持交互选择实例/目录/命令。上述显式参数使后续命令固定为 **`tweb-lab`**；再安装一个站点须使用不同实例名、命令、目录和内部端口。无参数 `tweb-lab` 打开管理菜单；单实例默认管理命令为 `tweb`。


#### 4.2.1 一条命令安装

在有 curl 的交互式 SSH 终端运行以下一行，将域名换成自己的：

```bash
( f=$(mktemp) && trap 'rm -f "$f"' EXIT && curl --fail --show-error --location --proto '=https' --tlsv1.2 'https://raw.githubusercontent.com/biao169/web-teacher/web-py/install.sh' -o "$f" && sudo bash "$f" --domain 'teacher.example.org' )
```

未传 `--port` 时，交互终端会询问内部应用端口，回车使用 8003；非交互运行使用默认值。可以显式指定：

或者：

```bash
f=$(mktemp) && trap 'rm -f "$f"' EXIT && curl --fail --show-error --location --proto '=https' --tlsv1.2 'https://raw.githubusercontent.com/biao169/web-teacher/web-py/install-multi.sh' -o "$f" && sudo bash "$f" --domain 'teacher2.example.org'
```

推荐第二个网站显式指定命令和目录：

```bash
f=$(mktemp) && trap 'rm -f "$f"' EXIT && curl --fail --show-error --location --proto '=https' --tlsv1.2 'https://raw.githubusercontent.com/biao169/web-teacher/web-py/install-multi.sh' -o "$f" && sudo bash "$f" --domain 'teacher2.example.org' --instance lab2 --command tweb2 --base /opt/teacher-site-2 --port 8009
```

也可以下载本补丁中的独立 install-multi.sh 后，在 VPS 执行：

```bash
sudo bash install-multi.sh --domain teacher2.example.org --command tweb2
```


### 4.3 创建时可设置的安装参数

| 参数 | 默认/约束 | 影响 |
| --- | --- | --- |
| `--repo` | 默认上述 GitHub 仓库 | 网站源码来源；须为支持的 HTTPS GitHub 仓库地址 |
| `--branch` | `web-py` | 安装和后续更新分支 |
| `--domain` | 必填，纯主机名 | 主站 HTTPS 地址、允许主机、站点地图与代理示例 |
| `--allowed-origins` | 逗号分隔 HTTPS 根地址 | 允许的额外访问域名，不自动创建 DNS/证书 |
| `--port` | `8003`，1024–65535 | 同一主站/后台/快传的内部监听端口 |
| `--python` | `/usr/bin/python3`，实际须 3.12+ | 安装及运行环境的基础解释器 |
| `--pip-source` | `tuna`；可选 `pypi` | Python 依赖下载源，不改变网站数据 |
| `--instance` | 多实例入口使用，字母开头的小写名 | 隔离服务、账号和配置，例如 `lab` |
| `--command` | 多实例入口使用 | 系统管理命令名，例如 `tweb-lab` |
| `--base` | 多实例入口使用 | 代码和数据根目录；应与其他实例完全分离 |

`--instance/--command/--base` 不是普通 `install.sh` 的参数，使用 `install-multi.sh`。安装器检查端口和归属冲突，不杀死其他站点。

### 4.4 HTTPS、域名与反向代理

服务只监听 `127.0.0.1:<内部端口>`，网站、后台、快传全部走同一 upstream。将域名解析到 VPS，在现有 Nginx 或 Caddy 中配置 HTTPS，再接入安装器生成的片段：

```bash
tweb-lab paths
tweb-lab proxy
tweb-lab status
tweb-lab doctor
```

这些命令显示本实例真实路径及代理示例，**不会替你覆盖现有代理站点、申请证书或完成 DNS**。确认片段已接入正确 TLS 站点后，按所用代理执行配置检查与重载，例如 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

例如已安装 Nginx 且已有证书时，可在 `/etc/nginx/sites-available/teacher-site-lab.conf` 的 TLS 站点中包含生成片段：

```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/teacher.example.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/teacher.example.org/privkey.pem;
    include /etc/teacher-site-lab/generated/nginx-location.conf;
}
```

证书路径须改为真实已存在的证书；上面不是证书申请命令。使用 `sites-available/sites-enabled` 布局的 Nginx，首次建立启用链接后再检查、重载：

```bash
sudo ln -s /etc/nginx/sites-available/teacher-site-lab.conf /etc/nginx/sites-enabled/teacher-site-lab.conf
sudo nginx -t
sudo systemctl reload nginx
```

已有同名链接时不再创建。其他 Nginx 安装布局按实际主配置接入；不额外嵌套 `location /`，生成片段已经包含它。

若使用已安装的 Caddy，可将生成 `Caddyfile.fragment` 的内容合并到 `/etc/caddy/Caddyfile`，核对域名/上游后运行：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

不要同时让两个代理争用公网 80/443；Caddy 服务账号未必能读取网站私有配置目录，推荐合并片段内容而非放宽整个目录权限。DNS、证书及防火墙的实际设置以你的代理环境为准。

正常访问 `https://teacher.example.org/zh` 和 `/admin`。保留快传所需的请求流和升级转发配置；不另开“快传专用公网端口”。

### 4.5 安装后的关键路径

以下为上面 `lab` 示例；以 `tweb-lab paths` 输出及 `storage.toml` 为准：

| 内容 | 路径 |
| --- | --- |
| 安装根目录 | `/opt/teacher-site-lab` |
| 当前代码与虚拟环境 | `/opt/teacher-site-lab/current`、`current/.venv` |
| 受管源码版本目录 | `/opt/teacher-site-lab/releases/` |
| 管理器/命令 | `/opt/teacher-site-lab/tweb.py`、`/usr/local/bin/tweb-lab` |
| 存储配置 | `/etc/teacher-site-lab/storage.toml` |
| 服务环境变量 | `/etc/teacher-site-lab/teacher-site.env` |
| 安装记录 | `/etc/teacher-site-lab/install.json` |
| 生成代理片段 | `/etc/teacher-site-lab/generated/nginx-location.conf`、`generated/Caddyfile.fragment` |
| systemd 单元 | `/etc/systemd/system/teacher-site-lab.service` |
| 主 SQLite 数据库 | `/opt/teacher-site-lab/data/database/site.sqlite3` |
| 媒体、业务缓存 | `/opt/teacher-site-lab/data/media`、`data/cache` |
| 快传文件、缓存 | `/opt/teacher-site-lab/transfer-data/files`、`transfer-data/cache` |
| 应用日志 | `/opt/teacher-site-lab/data/logs/service.log` |

默认单实例对应 `/opt/teacher-site`、`/etc/teacher-site`、`teacher-site.service` 和 `tweb`。不要套用历史包中的 `/var/lib/...` 路径来删除或备份当前实例。

### 4.6 常用启动与管理命令

下表中的 `tweb-lab` 可替换为自己的命令；默认单实例用 `tweb`。管理入口可按需请求 sudo 权限。

| 命令 | 用法 |
| --- | --- |
| `tweb-lab` | 打开管理菜单 |
| `tweb-lab status` | 查看服务状态 |
| `tweb-lab start` / `stop` / `restart` | 启动/停止/重启该实例 |
| `tweb-lab logs` | 跟踪日志，`Ctrl+C` 结束跟踪 |
| `tweb-lab doctor` / `paths` / `proxy` | 诊断、查看路径、查看代理片段 |
| `tweb-lab port 9103` | 调整内部端口并刷新受管配置；代理实际接入仍需核对 |
| `tweb-lab domains --allowed-origins https://alias.example.org` | 设置额外域名；多个地址逗号分隔，之后核对 DNS/TLS/代理 |
| `tweb-lab pip-source pypi` | 更换后续依赖安装源 |
| `tweb-lab update --scope all` | 完整更新；先备份数据 |
| `tweb-lab update --scope source` | 仅源码；不兼容时拒绝并提示完整更新 |
| `tweb-lab update --scope frontend` | 仅模板/JS/CSS；必须满足后端契约兼容 |
| `tweb-lab update --scope dependencies` | 更新已安装源码所需依赖 |
| `tweb-lab update --scope database` | 核验/升级已有结构，不等于清空重建 |
| `tweb-lab update --scope config` | 刷新受管服务和代理示例 |
| `tweb-lab permissions` / `permissions --repair` | 检查/显式修复本实例权限 |
| `tweb-lab db-init` / `db-update` | 初始化空库/升级核验 |
| `tweb-lab cleanup-preview` / `cleanup-status` / `cleanup-run` | 预览、查看、执行既有维护清理 |

`db-reset`、`remove --scope ...`、`uninstall` 是破坏性维护入口，按程序列出的范围与确认词操作；不是解决普通 500/503 或更新失败的第一步。

### 4.7 Ubuntu 运行变量：在哪设置、控制什么

存储参数统一由 `backend/app/config.py` 读取：**显式环境变量优先于 `TEACHER_CONFIG` 指定的 TOML**。相对 TOML 路径相对于该 TOML 所在目录解析，正式部署推荐绝对路径。

| 变量 | 设置位置/默认 | 控制内容 |
| --- | --- | --- |
| `TEACHER_CONFIG` | 服务环境文件；默认指向本实例 `storage.toml` | 统一存储配置来源 |
| `TEACHER_ORIGIN` | 受管环境文件，由 `--domain` 生成 | HTTPS 主地址、来源校验、SEO 地址 |
| `TEACHER_ALLOWED_ORIGINS` | 受管环境文件，由域名管理生成 | 额外允许的完整来源；不能代替 DNS/TLS |
| `TEACHER_DATA_DIR` | 未指定时项目 `data`；受管安装使用 TOML | 总数据根目录 |
| `TEACHER_DATABASE_PATH` | 数据根目录 `database/site.sqlite3` | 主数据库文件位置 |
| `TEACHER_MEDIA_DIR`、`TEACHER_CACHE_DIR` | 数据根目录 `media`、`cache` | 媒体与业务缓存位置，不是 HTML 页面缓存开关 |
| `TRANSFER_MEDIA_DIR`、`TRANSFER_CACHE_DIR` | 受管 TOML 指向实例 `transfer-data` | 快传文件和缓存位置 |
| `TRANSFER_DATABASE_PATH` | 旧独立快传数据库来源 | 兼容迁移用途；当前快传记录在主库，不能借此另开独立服务 |
| `TEACHER_ASSET_MODE` | 受管安装为 `local`；支持 `local/cdn` | 静态资源模式，不控制公开 HTML 缓存 |
| `TEACHER_PUBLIC_STREAM_CONCURRENCY` | 默认 `2`，范围 `1..4` | 前台渐进流加载并发，不是进程数 |
| `TEACHER_HTTP_CONCURRENCY` | 默认 `16`，范围 `8..32` | 本地 HTTP 并发上限；直接启动时读取，受管服务在生成 `ExecStart` 时固化 |
| `TEACHER_SYNC_KEY` | 可选，64 位十六进制 Secret | 同步兼容部署密钥；通常先使用后台同步密钥/授权流程 |
| `SYNC_HISTORY_DAYS` | 默认 `90` | 同步历史保留天数 |
| `TEACHER_SYNC_PAUSED` | 默认 `0`；运行环境中 `1` 暂停 | 暂停同步，不是暂停网站；受管环境生成不自动保留任意自定义项 |
| `TEACHER_METADATA_EMAIL` | 可选运行变量 | 论文元数据请求联系邮箱 |
| `TEACHER_TRANSLATION_HOSTS` | 可选，逗号分隔主机名，不含协议/路径 | 自建翻译服务允许访问的额外域名，后台地址仍须匹配 |

翻译/论文 API 密钥见 Worker 的可选 Secret 表；本地也读取相同环境变量，或在后台服务设置中填写。不要把密钥写入公开 README、前端代码或 Git。

**受管环境文件的更新边界：**管理器会重写 `teacher-site.env`，当前仅专门保留 `TEACHER_SYNC_KEY`、`SYNC_HISTORY_DAYS`、`TEACHER_PUBLIC_STREAM_CONCURRENCY` 三项额外值。修改主域名/额外来源优先使用管理命令，不把任意自定义变量直接写进生成文件后假定永不丢失。

需要长期保存其他环境变量时，可以通过 systemd drop-in 引入自己的独立文件（以下仍为 lab 实例）：

```bash
sudo touch /etc/teacher-site-lab/custom.env
sudo chmod 600 /etc/teacher-site-lab/custom.env
sudoedit /etc/teacher-site-lab/custom.env
sudo systemctl edit teacher-site-lab.service
```

`touch` 不会清空已有内容；已有配置应在编辑前核对。编辑器中的 drop-in 填写：

```ini
[Service]
EnvironmentFile=/etc/teacher-site-lab/custom.env
```

`custom.env` 示例（这是 systemd 环境文件，不写 `export`）：

```ini
TEACHER_PUBLIC_STREAM_CONCURRENCY=1
SYNC_HISTORY_DAYS=90
TEACHER_METADATA_EMAIL=admin@your-domain.tld
```

保存后：

```bash
sudo systemctl daemon-reload
tweb-lab restart
```

备份时同时保存自定义环境文件及 `/etc/systemd/system/teacher-site-lab.service.d/`。`TEACHER_HTTP_CONCURRENCY` 的受管上限已经写在服务 `ExecStart` 参数中，仅加环境变量并重启不会改动该参数；如需改为 8，可在受管配置生成时传入并检查最终单元：

```bash
sudo env TEACHER_HTTP_CONCURRENCY=8 tweb-lab update --scope config
sudo systemctl cat teacher-site-lab.service
```

配置生成会影响本站服务/代理示例，应先核对现有自定义配置；后续再生配置时仍需传相同上限。

### 4.8 自定义存储与直接启动

例如复制模板到 `/etc/my-teacher/storage.toml`，保留需要的 `[storage]` 字段：

```toml
[storage]
data_dir = "/srv/teacher-data"
database_path = "/srv/teacher-data/database/site.sqlite3"
media_dir = "/srv/teacher-data/media"
cache_dir = "/srv/teacher-data/cache"
transfer_media_dir = "/srv/teacher-transfer/files"
transfer_cache_dir = "/srv/teacher-transfer/cache"
asset_mode = "local"
```

SQLite 不能放进可清理缓存目录；媒体/缓存目录不得互相重叠。修改路径不会自动搬迁原数据，应停服、备份和迁移后验证服务账号权限。受管安装路径调整还需核对管理器的 `paths` 和维护行为，不能只搬一个数据库文件。

不安装 systemd、仅临时运行：

```bash
TEACHER_PYTHON=/usr/bin/python3.12 \
TEACHER_CONFIG=/etc/my-teacher/storage.toml \
bash start.sh --port 8003
```

首次空库交互创建管理员；终端 `Ctrl+C` 停止。不要在同一端口同时运行直接启动和 systemd 服务。直接启动的 `TEACHER_PORT` 只控制启动器；受管服务改端口使用 `tweb-lab port`。

## 5. Cloudflare Worker 网页版部署

### 5.1 部署方式与资源

这里的“网页版”是 **Cloudflare Dashboard → Worker 连接 Git 仓库 → Workers Builds 执行项目部署脚本**，不是在 Quick Edit 中粘贴一个 Python 文件。

准备：

- 仓库根目录中有完整项目；部署分支如 `web-py` 已包含你要发布的文件。
- 同一 Cloudflare 账号下创建一个 D1 数据库和媒体 R2 桶，记录数据库名称/ID、桶名、账号 ID。
- 自有域名，或已启用的账号 `workers.dev` 子域名。
- 发布令牌及辅助 Worker 发布 Secret，权限覆盖下述实际操作。

当前拓扑包含主 Worker、私有 Admin、Native 辅助服务；`separate` 模式再使用已有的独立同步 Executor。PublicPage/PublicData 是主 Worker 的可缓存 entrypoint，**不是两个额外 Worker**。辅助服务名称由主 Worker 名自动生成，普通名称通常为 `<主名>-admin`、`<主名>-sync-native`、`<主名>-sync-executor`；长名称会截断并加哈希，不要自行创建同名占位服务。

数据在云端：D1 保存业务记录/账号/同步元数据；R2 保存媒体/文件对象；Assets 保存打包静态资源；Workers Cache 保存符合条件的成功公开响应。云端不使用本机 `data/database/site.sqlite3`，也不把仓库里的运行数据当作 D1 导入来源。

### 5.2 网页控制台创建流程

1. 在 Cloudflare 创建 D1 数据库，记下 **Database ID** 与实际数据库名称；创建 R2 媒体桶并确保账号可用 R2。可另建业务缓存桶，也可沿用一个桶的不同前缀。
2. 创建/选择主 Worker，并连接 Git 仓库，选择生产分支。主 Worker 名须与下面 `TEACHER_WORKER_NAME` 完全一致。
3. 在该 Worker 的 **Settings → Build**（界面可能显示“构建”）设置项目根目录、命令、构建变量与构建 Secrets。
4. 按 5.3–5.5 配置后启动构建/部署；若初次连接已提前触发失败，补齐配置后重新部署即可，不需要删除 D1/R2 重来。
5. 检查构建日志，确认最后发布完成，而不只是 `check` 或 dry-run 完成。
6. 用主地址访问 `/setup`，按 5.6 创建首个管理员，再进入 `/admin`。

构建配置：

| 项目 | 填写 |
| --- | --- |
| 生产分支 | `web-py`，或与 `TEACHER_BUILD_BRANCH` 相同的实际分支 |
| Root directory | `deploy/cloudflare`（前提是仓库根目录直接包含项目文件） |
| Build command | `python build.py check` |
| Deploy command | `python build.py deploy` |
| Python 构建版本 | `PYTHON_VERSION=3.13`，满足 Worker 项目 `requires-python >=3.13` |
| Node 构建版本 | `NODE_VERSION=22` 或符合当前锁工具的兼容版本，脚本最低要求 22 |
| 自动安装依赖 | 通过构建变量 `SKIP_DEPENDENCY_INSTALL=1` 关闭平台自动安装，由项目脚本按锁文件准备 |

不要将部署命令替换为默认 `npm run deploy`、裸 `pip install .` 或只上传主脚本；本项目的构建会准备模板、SDK、Assets、绑定和辅助服务。

### 5.3 必需/推荐的构建变量与 Secrets

**Build Variables/Secrets 是构建进程的环境，不等于任意同名值都会自动进入 Worker 运行环境。**下列项目为现有脚本明确读取并生成/同步的配置。普通变量填 Variables；令牌和密钥填 Secrets，不放入仓库。

| 名称 | 类型与要求 | 作用 |
| --- | --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 普通变量，32 位账号 ID | 选择发布账号，与 D1/R2 所属账号一致 |
| `TEACHER_WORKER_NAME` | 普通变量，必填，小写字母/数字/连字符，最长 63 | 主 Worker 名与辅助服务命名前缀，须与关联构建项目一致 |
| `TEACHER_D1_ID` | 普通变量，必填，有效非零 UUID | 已创建的 D1 数据库 ID |
| `TEACHER_D1_NAME` | 普通变量，必填 | D1 实际数据库名，不是绑定名 `DB` |
| `TEACHER_MEDIA_BUCKET` | 普通变量，必填 | 已创建的媒体 R2 桶名，不是绑定名 `MEDIA` |
| `TEACHER_ORIGIN` | 普通变量，推荐显式填写 HTTPS 根地址 | 主站地址与来源检查；不带业务路径、query、端口 |
| `TEACHER_BUILD_BRANCH` | 普通变量，默认 `web-py` | 限制预期部署分支；改生产分支时同步修改 |
| `PYTHON_VERSION` | 构建普通变量，如 `3.13` | Cloudflare 构建 Python 版本，不是本地解释器路径 |
| `NODE_VERSION` | 构建普通变量，如 `22` | Node/npm 构建工具版本 |
| `SKIP_DEPENDENCY_INSTALL` | 构建普通变量，`1` | 关闭 Cloudflare 的自动依赖安装 |
| `CLOUDFLARE_API_TOKEN` | 构建 Secret；由实际发布认证提供 | Wrangler 主站发布及远程 D1、R2 验证；使用自己的令牌时需覆盖这些权限 |
| `TEACHER_AUX_API_TOKEN` | 构建 Secret，必填 | 项目通过 API 创建/更新辅助服务、检查绑定和调度；不能只依赖主 Worker 的关联 CI 认证 |
| `TEACHER_SETUP_TOKEN` | 构建 Secret，新站设置时需要，32–256 字符 | 发布到 Admin 运行环境，允许空账号库的 `/setup` 创建管理员 |

令牌权限按实际账号范围设置：主发布包含 Workers Scripts 编辑/发布、D1 编辑（初始化/核验）、R2 对象读写删除测试，以及使用自有域名时对应域名管理所需权限；账号信息读取等按 Cloudflare 的发布令牌要求配置。辅助令牌至少需要目标账号 Workers Scripts 编辑与辅助服务/调度读取；`cloud-check` 还会用它只读查询 D1 的同步凭据状态，须具备相应 D1 查询权限。两种令牌可以使用同一个满足要求的专用令牌，但职责不同，不把 `TEACHER_AUX_API_TOKEN` 当网站访客登录凭证。

不要通过环境变量手工设置 `WORKERS_CI`、`WRANGLER_CI_OVERRIDE_NAME`、`WRANGLER_CI_MATCH_TAG`：它们由平台注入/校验，伪造名称会触发构建身份不一致。

### 5.4 域名、同步和初始化控制变量

| 名称 | 默认/可选值 | 控制功能 |
| --- | --- | --- |
| `TEACHER_CUSTOM_DOMAIN` | 可选，单个自有主机名 | 未填 ORIGIN 时可推导主地址；同时填写时须与 ORIGIN 主机一致 |
| `TEACHER_CUSTOM_DOMAINS` | 可选，多个自有主机名，逗号分隔 | 构建管理的 Custom Domains；不是带 `https://` 的来源列表 |
| `TEACHER_ALLOWED_ORIGINS` | 可选，逗号分隔 HTTPS 根地址 | 额外允许访问来源；只填此项不自动创建域名路由 |
| `TEACHER_WORKERS_SUBDOMAIN` | 使用 workers.dev 且未填 ORIGIN 时需要 | 账号的 workers.dev 子域名，不含主 Worker 名和 `.workers.dev` 后缀 |
| `TEACHER_WORKERS_DEV` | 默认 `true`；`true/false` 或 `1/0` | 是否保留 workers.dev 入口；主地址为 workers.dev 时不能关闭 |
| `TEACHER_CACHE_BUCKET` | 可选；省略时使用既有共桶/分前缀方式 | R2 业务缓存桶，**不是** Workers Page Cache 容量或开关 |
| `TEACHER_D1_INIT` | 默认 `auto`；`auto/check/upgrade` | `auto` 可初始化空库并处理代码识别的旧结构；`check` 只验已有结构、空库失败；`upgrade` 允许同一已识别升级流程，不能升级任意旧库 |
| `TEACHER_SYNC_EXECUTOR_MODE` | 默认 `inline`；可设 `separate` | `inline` 在既有主链路推进；`separate` 使用独立同步 Executor，隔离执行器职责，不保证所有共享资源完全独立 |
| `TEACHER_SYNC_PAUSED` | 默认 `0`；设 `1` | 暂停现有同步调度/相关接收路径，不关闭前台网站 |
| `TEACHER_SYNC_KEY` | 可选构建 Secret，64 位十六进制 | 同步兼容密钥，脚本同步至相应组件；不填时保留已有 Secret，新站可在后台配置 |
| `TEACHER_METADATA_EMAIL` | 可选普通构建变量 | 传给 Admin 的论文元数据联系邮箱 |
| `TEACHER_TRANSLATION_HOSTS` | 可选普通构建变量 | 传给 Admin 的额外翻译主机白名单，格式为 `translate.your-domain.tld` 等主机名 |
| `TEACHER_RECOVERY_DIR` | 高级构建变量，已识别 D1 升级时使用 | 升级恢复书签输出目录；构建机临时目录不等于永久备份，应保存相关恢复信息 |

最小主地址有三种选择，任选一种并替换占位内容：

- 自有域名：填写 `TEACHER_ORIGIN=https://你的实际域名`，并在控制台绑定该域名；或同时配置 `TEACHER_CUSTOM_DOMAIN=你的实际域名` 由构建管理。
- 多自有域名：主地址用 `TEACHER_ORIGIN`，`TEACHER_CUSTOM_DOMAINS` 填主域名和别名，逗号分隔。
- workers.dev：填完整 `TEACHER_ORIGIN=https://主Worker名.账号子域名.workers.dev`；也可只填正确 `TEACHER_WORKERS_SUBDOMAIN` 让脚本推导。不要关闭该主入口。

`TEACHER_PUBLIC_STREAM_CONCURRENCY` 在 Worker 策略中固定为 **1**，填写其他值不会调高实际流并发；不要把 Ubuntu 的并发设置复制成 Worker CPU 调整方法。

### 5.5 可选的论文与翻译 API Secrets

以下可选值可作为 **构建 Secret**，现有 `AdminRelease` 会将它们放入实际使用外部服务的 Admin Worker。后台服务设置也可配置相关服务；部署 Secret 的密钥优先。填写密钥不会自动代替后台的服务选择、启用顺序、区域或端点设置。

| Secret | 用途 |
| --- | --- |
| `TEACHER_OPENALEX_API_KEY` | OpenAlex 元数据服务 |
| `TEACHER_SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar 元数据服务 |
| `TEACHER_PUBMED_API_KEY` | PubMed 元数据服务 |
| `TEACHER_GOOGLE_TRANSLATE_KEY` | Google Translate |
| `TEACHER_DEEPL_API_KEY` | DeepL |
| `TEACHER_MICROSOFT_TRANSLATOR_KEY` | Microsoft Translator，实际区域/端点仍在后台配置 |
| `TEACHER_LIBRETRANSLATE_API_KEY` | LibreTranslate；自建地址还须部署主机白名单 |

这些 Secrets 不应放在普通 Variables、D1公开内容或前端 JS。更改后重新运行项目发布流程，让辅助 Admin 的配置同步；不要只给主 Worker 手工添加 Secret 后认为辅助组件也自动拥有它。

### 5.6 首次发布、D1 与管理员

`python build.py check` 只检查配置/源码与版本要求；真正的 `deploy` 会准备依赖、生成资源、打包辅助服务并执行远程验证与发布：

1. 核对主站/辅助名称及现有服务归属；同名但不属本站的辅助服务会拒绝覆盖。
2. 检查 R2 小型二进制探测对象的写入、读取和删除。桶必须已存在；这不是创建 R2 桶的命令。
3. 读取 D1 结构。默认 `auto` 对空库导入 `database/schema.sql`；已有库只处理明确识别的结构/前置版本，未知结构拒绝，不清空数据库。
4. 按当前 inline/separate 模式发布、核对辅助服务和主站；构建完成仍需实际业务验证。

因此新站正常流程不需要先手工导入多份历史 SQL。若使用 `TEACHER_D1_INIT=check`，应自行先准备正确结构；不要反复把初始化 SQL 执行到有业务数据的旧库。

发布成功后访问：

```text
https://你的主地址/setup
```

输入部署时的 `TEACHER_SETUP_TOKEN`、首个管理员账号、密码和确认密码。只有空账号库且没有已完成初始化标记时允许创建；完成后入口自动关闭。随后访问 `/admin` 登录。

完成初始化后可移除不再需要的 Setup Secret；同时检查 **构建 Secret 与实际 Admin Worker 运行 Secret**，只删除构建值不等于删除脚本保留的既有运行 Secret。管理员账号不由 `TEACHER_SETUP_TOKEN` 决定，该值也不是后续登录密码。

### 5.7 更新、日常使用与日志

- 更新：提交到配置的生产分支触发构建/发布；或在控制台重新部署对应提交。核对实际提交与日志中的发布版本。
- 修改构建变量/Secrets：保存后重新部署，不只是刷新浏览器。由构建生成的绑定/普通变量以生成配置为准，手工改控制台值可能被后续发布覆盖。
- 查看故障：在主 Worker 和相关辅助 Worker 的日志/Observability 中按时间、路径、Ray ID、请求 ID 查找；必要时看 CPU、资源超限和异常结果。
- Worker 无 Ubuntu 的 `start/stop/restart` 命令；由平台响应请求，发布新版本或回滚已有部署也不等于清空 D1/R2。
- 同步 Cron 使用现有调度；看到每分钟触发不代表在预热页面。Admin 无公开入口与 Cron，普通前台访问不应推进同步。

维护者需要命令行时，先配置与网页构建相同的变量/Secret，并在满足 Python 3.13+/Node 22+ 的环境运行：

```bash
python deploy/cloudflare/build.py check --deployment-config
python deploy/cloudflare/build.py bundle
python deploy/cloudflare/build.py verify-companions
python deploy/cloudflare/build.py cloud-check
# 只有以下命令会执行真实主站发布：
python deploy/cloudflare/build.py deploy
```

`bundle`/`verify-companions` 是不发布的打包验证；`cloud-check` 检查线上配置/凭据状态而非业务健康。不要把以上检查全部改成生产 Deploy command，也不要以 dry-run 通过代替线上运行验收。

## 6. 后台使用与两站同步

### 6.1 第一次登录后

1. 在“网站设置”填写中英文站名、Logo、首页展示和 SEO 信息。
2. 编辑教师、学生、成果等内容，设置启用/公开范围；先保存内容，再核对前台语言和附件显示。
3. 在“导航与按钮”配置显示位置、顺序、语言和目标；固定筛选入口由该功能生成，不手工写死某个 URL。
4. 在账号/角色中设置人员权限，后台保存/删除/私有数据始终服务端实时校验。
5. 配置论文元数据/翻译服务后再发起任务；人工译文与正文保护按编辑器现有功能管理。
6. 用媒体库上传文件，确认引用位置；回收站永久删除前核对引用，不能把“清缓存”当作删除媒体。

论文索引/展示标签和新闻分类支持英文分号、中文分号或换行分隔；姓名中的逗号保留。普通列表可在完整 PublicData 可用后本地筛选、排序和续页；模型不可用或条件不支持时保留服务端处理。

网站注册是否开放、留言、公开联系方式、首页精选、媒体保留策略、快传配额、外部服务顺序等主要在后台设置，**不是随便添加一个环境变量就会生效**。部署变量负责地址、资源绑定、运行控制与 Secrets；内容配置保存在数据库中。

### 6.2 两站同步使用

1. 在两站分别进入 `/admin/site-sync`，按界面生成/保存本站密钥及授权信息，填对端完整 HTTPS 主地址。
2. 刷新授权并选择允许同步的模块，先执行连通性测试，再创建小范围手动任务。
3. 确认方向：拉取是把对端选定范围写入本站。定时拉取还可能按所选模块处理业务删除；它不是备份。
4. 仅在接收站开启定时拉取；切换来源前先关闭原接收站的自动拉取，避免两边互相覆盖。
5. 关注任务 ID、阶段、进度、错误、暂停/取消状态；设置预算后先观察，再扩大范围。

Ubuntu 在同一主服务内后台推进；Worker 沿用现有 Cron/内部推进/可选 Executor。`separate` 改变执行器部署，不改变同步协议，不代表应手工暴露 Executor 域名给访客。同步页显示的实际预算/模块及权限以当前后台为准，不把历史固定 Worker 数量或旧参数照搬到新部署。

## 7. 缓存、登录与平台差异

| 内容 | 浏览器成功缓存 | Worker 成功共享缓存 | Ubuntu 默认服务器行为 |
| --- | --- | --- | --- |
| 标准匿名首页/列表及白名单详情 | 1800 秒 | 1800 秒；声明 SWR 300 秒、stale-if-error 86400 秒 | 未命中浏览器时由 Python/SQLite/Jinja 生成 |
| 公开固定 `/n/{nav}` 无 query 基础页 | 60 秒 | 120 秒；SWR 30 秒、stale-if-error 300 秒 | 同一短 HTTP 缓存头，不新增服务器结果缓存 |
| PublicData 固定公开 JSON | 300 秒 | 1800 秒；同标准边缘策略 | 请求到服务器后重新生成粗粒度 JSON |
| Admin/Auth/身份/CSRF/私有接口/写请求 | `no-store` | 不共享缓存 | 实时鉴权和处理 |
| 4xx/5xx 或未确认成功内容 | `no-store` | 不写入成功共享对象 | 不缓存错误 |

Worker Default 缓存关闭，仅白名单 Public GET/HEAD 进入 PublicPage/PublicData。公开 HTML 始终匿名；只有成功状态/标记/类型等校验通过后才允许共享。普通自由 query 和固定入口带 query 请求不共享缓存；新闻详情含身份相关表单，不在普通详情缓存白名单。

Ubuntu 当前没有跨请求 HTML LRU/Read Model 结果缓存，默认 Nginx 片段未设置 `proxy_cache`。`Cache-Tag`/CDN 响应头不凭空产生本地边缘缓存；同请求设置/媒体读取复用也不等于跨请求缓存。ETag/304可能在生成之后才判断，不能当作没有数据库查询。

登录成功会立即交接显示身份，后续公开切页先用可用快照、再静默确认 Cookie；明确失效才纠正显示，网络错误不能据此误判退出。后台权限和私有字段仍即时校验，前端快照不决定权限。

普通公开修改提交后沿用现有标签失效；确认异常时管理员按模块清理 Page/Data，不自动预热。Ubuntu 共享边缘清理显示 `not_applicable`。清理无法删除浏览器尚 fresh 的副本，也不能修复真正的页面生成错误。Worker 1101/1102硬终止不保证应用还能执行兜底，stale受已有对象、窗口和平台链路限制。

旧 `TEACHER_PUBLIC_CACHE_TTL_SECONDS`、`TEACHER_PUBLIC_PAGE_CACHE_TTL_SECONDS`、`TEACHER_PUBLIC_CACHE_MB`、`TEACHER_PUBLIC_NAV_PREFETCH_CONCURRENCY`、`TEACHER_WORKER_CACHE_MODE`、`TEACHER_WORKER_REQUEST_CACHE` 等开关已不用于当前公开策略。不要在创建时添加这些变量期待启用旧缓存模式，也不要增加缓存预热或高频扫描任务。

## 8. 备份、更新与故障定位

### 8.1 备份

- 本地服务器：备份实际主数据库、媒体/快传文件、存储配置、环境文件和自定义 systemd/代理配置。SQLite 使用一致性备份方式，或停服后复制；不要在写入期间只复制 `.sqlite3` 而忽略 WAL 一致性。
- Worker：按 Cloudflare D1 的备份/恢复能力保存恢复点，备份 R2 对象，保留构建变量与私有 Secrets 的安全来源。回滚 Worker 代码不等于回滚 D1 数据。
- 源码更新不保证自动生成完整业务备份；两站同步也不是误删恢复工具。

### 8.2 常见问题

| 问题 | 先检查 |
| --- | --- |
| Windows 每次数据消失 | 是否用了会重建开发库的 `start.cmd`；改用保留数据入口并核对路径 |
| Linux 启动失败/502/503 | `tweb-lab status`、`doctor`、`logs`；无应用日志再看 `sudo journalctl -u teacher-site-lab.service -n 100 --no-pager` |
| 修改端口后域名仍失败 | 内部监听、生成片段、代理实际 upstream、DNS/TLS 与允许来源是否一致 |
| 登录/保存提示来源不正确 | ORIGIN/ALLOWED_ORIGINS、请求 Host、HTTPS 代理及实际访问域名；不要关闭 CSRF 来绕过 |
| Worker 构建失败 | Python/Node 版本、根目录、分支、SKIP_DEPENDENCY_INSTALL、项目名、ID/桶名及令牌权限 |
| D1 结构不一致 | 对照发布日志与当前 `database/schema.sql`，先备份；未知结构不靠删库解决 |
| `/setup` 404 | Token 是否传至 Admin、长度是否合格，以及是否已有账号/初始化标记；完成后关闭是正常行为 |
| 单个前台页面 500/503 | 检查该 **document 请求**的响应正文/头、发生时间、Ray ID、请求 ID及对应 Worker 日志，不能仅凭其他 CSS 成功断定主页面正常 |
| 1101/1102、资源超限 | 先查平台异常与 CPU/内存、失败路径及是否处于生成阶段；不循环清空成功缓存 |
| 登录显示未更新 | 区分身份后台请求与主文档失败，核对实际部署版本；不要把前端身份显示当真实授权 |
| 清缓存仍报错 | 检查真实生成/服务转发路径；purge不能修复模板、数据库或运行限额问题 |

### 8.3 验证入口

Windows 临时数据库验收：

```bat
deploy\windows\test.cmd
```

需要 DOM 验证时额外准备 Node/npm：

```bat
deploy\windows\test.cmd --dom --report "%TEMP%\teacher-site-acceptance.json"
```

开发者离线 Worker/VPS 源码预演（不发布、不连接真实 D1/R2）：

```bash
python -B tests/stage_release_v016001.py --separate-sync
```

临时 SQLite 公开页诊断：

```bash
python tests/probe_public_performance.py --local --output /tmp/teacher-public-probe.json
```

实际 Windows、systemd、Cloudflare 的运行结果需在对应环境确认，离线预演不能证明线上 CPU、缓存跨节点失效或故障回退已通过。

## 9. 进一步阅读

- [网站完整功能与操作](docs/README.md)
- [源码、函数及路由索引](docs/SOURCE.md)
- [部署、数据、缓存与同步运维](docs/OPERATIONS.md)
- `docs/reference/`：原始规格参考，内容可能包含早期目标，以当前源码为准。

Cloudflare 控制台界面和平台权限以官方当前说明为准：

- [Workers Builds 配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [构建环境与版本变量](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [D1 创建与基本操作](https://developers.cloudflare.com/d1/get-started/)
- [Workers 权限与角色](https://developers.cloudflare.com/workers/authorization/)
