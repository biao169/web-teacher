# 教师与课题组网站

基于 Python、FastAPI、Jinja 模板和原生 JavaScript，提供中英文教师/课题组展示、内容管理、文件互传、备份恢复和异地网站同步。前端使用本地静态资源，不需要 Nuxt/Vue。当前源码版本见 `pyproject.toml`。同步任务可查看持久化进展、累计请求异常、异常后有效进展及连续无进展次数；各同步视图显示完整任务ID与明确时区。媒体分片与清理使用局部进度读写，减少反复加载整份任务。有检查点的同步支持按实际进展恢复，Worker连续无进展最多重试30次、本地部署8次。后台先单独核对强制中断的检查点，冷却后再推进；可衔接中断后的父子任务并补记完成状态，监控显示等待原因和最早恢复时间。手动任务默认使用本任务独立授权后台续跑，关闭定时拉取不影响；读取准备结束仍待人工确认，推送仍待接收方批准。Worker资源异常后保留降速档位，缩小复核批次并协商更小的新文件分片；就绪任务轮换，冷却和锁定任务让行。连续故障验收覆盖读取、准备、媒体、提交和清理，并区分本轮错误与旧恢复状态；权限失效或无进展额度耗尽会停止本任务后台续跑。恢复机制和重试边界见[异地同步说明](docs/reference/site-sync.md)。

## 文档入口

| 文档 | 用途 |
| --- | --- |
| [功能使用手册](docs/FEATURES.md) | 当前功能、后台入口、配置与使用边界 |
| [函数与源码索引](docs/FUNCTIONS.md) | 功能对应的模块、关键函数、参数及调用方式 |
| [文件互传设计](docs/reference/file-transfer.md) | 局域网直连、在线中继、离线缓存、接收码与文件夹 |
| [日志与缓存管理设计](docs/reference/log-cache.md) | 日志、内存缓存、磁盘缓存、清理与资源控制 |
| [异地网站同步设计](docs/reference/site-sync.md) | 预览、批准、最新候选、分步执行、恢复与状态 |

## 启动与部署

解压后的 `teacher-site/` 是项目根目录。上传Git仓库时，将该目录内的内容放在仓库根目录，保留 `install.sh`、`install-multi.sh`、`backend/`、`deploy/` 等相对位置。

| 环境 | 入口 | 说明 |
| --- | --- | --- |
| Windows，保留现有开发数据 | `deploy\windows\start-existing.cmd` | [Windows说明](deploy/windows/README.md) |
| Windows，重建专用开发数据库 | `deploy\windows\start.cmd` | 会重建专用开发数据库；勿用于生产数据 |
| 本地 Linux 直接启动 | `bash start.sh --port 8003` | 与文件互传共用端口 |
| Ubuntu/Debian 单实例 | `sudo bash install.sh --domain teacher.example.org` | [部署与管理](deploy/linux/README.md) |
| Ubuntu/Debian 多实例 | `sudo bash install-multi.sh --domain teacher2.example.org --instance lab2 --command tweb2 --base /opt/teacher-site-2 --port 8009` | [多实例说明](deploy/README-multi.md) |
| Cloudflare Worker | `deploy/cloudflare/build.py` | [构建、配置与部署](deploy/cloudflare/README.md) |

本地 Python 要求3.12+；Cloudflare构建使用其锁定工具链。VPS安装脚本默认拉取 `https://github.com/biao169/web-teacher.git` 的 `web-py` 分支，执行前应先把所需源码上传到该分支；也可通过 `--repo` / `--branch` 指定来源。

默认公共界面为英文，支持中英文切换。主站管理入口 `/admin`，文件互传 `/transfer/`；首次管理员初始化按对应平台部署说明操作。

## 数据与更新

数据库结构以 [database/schema.sql](database/schema.sql) 为执行依据，配置入口是 [backend/app/config.py](backend/app/config.py)。媒体、缓存、数据库和快传文件使用各自配置目录；生产实例由安装器生成独立路径。已有站点更新源码时保留数据库、媒体和私有配置，不用示例数据替换线上数据。

[数据库说明](database/README.md) · [测试用法](tests/README.md)。第三方资源授权保留在 `legal/` 及对应 `vendor/` 目录。

## 打包

在项目根目录运行：

```bash
python -B deploy/shared/package_release.py --output /绝对路径/项目外的输出目录
```

打包工具收录根目录全部 `.sh` 安装/启动入口、各平台部署代码、测试及文档，排除运行数据库、缓存和本地私有配置，生成并严格核对文件清单。输出目录中不得已有同名交付包。

## 多域名访问

Worker 与本地服务均支持以下环境配置：

```ini
TEACHER_ORIGIN=https://teacher.example.org
TEACHER_ALLOWED_ORIGINS=https://lab.example.org,https://teacher.example.net
```

主域名自动加入白名单，仍用于 SEO；其他域名可登录、管理及文件互传，各域名单独登录，Cookie 不跨域共享。所有域名必须指向同一应用/Worker，并配置 DNS、HTTPS 与对应路由。

Worker：将上述值同时配置到构建环境（由构建写入运行时变量）。若在控制台直接修改运行时变量，下次构建仍需提供同样的值。已有多个域名和路由时，仅配置来源白名单即可，详见 [Worker部署](deploy/cloudflare/README.md)。

Ubuntu 安装：

```bash
sudo bash install.sh --domain teacher.example.org --allowed-domains lab.example.org,teacher.example.net
```

已有安装更新源码后执行：

```bash
sudo tweb domains --allowed-domains lab.example.org,teacher.example.net
sudo tweb proxy
```

命令更新白名单并重启原本运行中的应用，输出代理配置示例；需将示例域名及证书配置应用到实际 nginx/Caddy 并检查后重载。`install-multi.sh` 支持同一参数；各实例使用自己的管理命令和配置目录。详见 [Ubuntu部署](deploy/linux/README.md) 与 [函数索引](docs/FUNCTIONS.md#域名策略基础接口)。

同步任务列表显示完整ID；Worker的1102恢复与资源边界见 [同步设计说明](docs/reference/site-sync.md#worker-超限与恢复边界)。
