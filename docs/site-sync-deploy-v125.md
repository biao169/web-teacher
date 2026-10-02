# v0.15.125：Worker 同步诊断与预置媒体部署

## 本版处理内容

1. 部署配置生成器加入 `global_fetch_strictly_public`，完整 Worker 构建校验要求保留该标志。`/api/*` 加入 `assets.run_worker_first`，避免 API 由静态资源优先处理。重新部署两站后生效，无需在控制台寻找开关。
2. 接收端同步异常返回服务端诊断编号，日志记录操作名、异常类型、最后八个调用位置及耗时；不记录密钥、密码、SQL 或原始业务数据。缺表/缺字段、数据库请求限制与其他异常分类提示。调用端兼容 Cloudflare JSON 错误、1101/1102 和 Ray ID；沿用现有后台通知。
3. 同步模块纳入已有 Worker 构建快照；缓存不变的表结构摘要，减少重复加载与计算。没有缓存业务内容，删除及更新仍读取当前数据。这些优化不保证消除所有 CPU/内存超限。
4. Linux 部署允许预置媒体，导入持久化媒体目录，设置网站服务账号权限；支持本次源码检查失败后重新获取源码续装。

当前提供的 HTTP 500 提示不足以证明具体根因。本版没有在线执行两站同步，不能宣称生产故障已经验证消除。两站部署后先测试连接；仍失败时，用“服务端诊断编号”在接收站 Worker 日志搜索 `site-sync`。本地显示的调用诊断编号和服务端编号可能不同。平台在 Python 运行前终止请求时，应使用 Ray ID 和 Workers 指标，应用日志可能无法生成。

## 预置媒体如何放置

推荐源码布局：

- `data/media/photos/teacher.jpg`
- `data/media/documents/introduction.pdf`

默认安装后对应：

- `/opt/teacher-site/data/media/photos/teacher.jpg`
- `/opt/teacher-site/data/media/documents/introduction.pdf`

兼容直接放 `data/example.jpg`，导入为 `data/media/example.jpg`。自定义数据路径时使用相同的 `media/` 子目录。只更新前台时不导入媒体；首次安装、整站更新和源码更新会处理预置媒体。

同路径同内容跳过，同路径不同内容停止并提示，不覆盖原文件。导入前检查全部路径与冲突，复制按块读取；单文件上限 512 MiB、总量上限 2 GiB。支持常用图片、音视频和 PDF。数据库、缓存、日志、配置、隐藏文件和符号链接不得作为预置媒体；`transfer-data` 仅允许空目录或空 `.gitkeep`，不能带快传运行数据。

导入文件不等于创建媒体数据库记录。安装后使用后台媒体目录核对收录文件，再用于教师、学生、新闻等内容。仍沿用媒体库原有内容校验和权限规则。

仓库默认忽略运行数据；需要发布的媒体可逐个明确加入 Git，例如：

```bash
git add -f data/media/photos/teacher.jpg
```

不要把整个运行数据库、快传缓存或私密媒体加入仓库。发布包仍不收集本机运行数据。本版支持“随源码提供的媒体”，不会接管安装前已存在的非空安装目录。

## 修复此次 Linux 安装中断

先把新版完整源码更新至 GitHub `web-py` 分支。旧安装保存的 `tweb` 还是旧代码，不能只执行旧入口期待新逻辑生效。使用新版管理脚本续装：

```bash
repair_dir=$(mktemp -d /tmp/teacher-site-repair.XXXXXX)
git clone --depth 1 --branch web-py https://github.com/biao169/web-teacher.git "$repair_dir/source"
sudo python3 "$repair_dir/source/deploy/linux/tweb.py" resume-install
```

默认路径下，此命令保留已保存端口等配置。本次在源码检查阶段失败且暂存目录已清除时，会重新下载源码。成功后更新已安装的 `tweb` 入口。已有 current 或服务定义时拒绝此续装方式，需按实际阶段诊断，不能覆盖正在运行的网站。

## 修改文件

| 路径（相对项目根目录） | 内容 |
|---|---|
| `deploy/shared/worker_package.py` | 生成公网 fetch 兼容标志 |
| `deploy/cloudflare/integration_package.py` | API 路由优先、配置校验 |
| `deploy/cloudflare/runtime/snapshot.py` | 同步模块构建快照预加载 |
| `deploy/linux/tweb.py` | 预置媒体校验、导入、权限、续装 |
| `backend/app/native/site_sync.py` | 表结构摘要复用 |
| `backend/app/native/site_sync_admin.py` | 页面、管理与对端操作诊断 |
| `backend/app/native/site_sync_transport.py` | 对端应用与平台错误解析 |
| `backend/app/native/site_sync_diagnostics.py`（新增） | 共用服务端异常诊断 |
| `tests/test_site_sync_v124.py` | 网络响应测试适配 |
| `tests/test_sync_deploy_v125.py`（新增） | 导入、冲突、诊断、续装回归 |
| `deploy/cloudflare/tests/test_acceptance_step5.py` | 部署配置必需项回归 |
| `pyproject.toml` | 版本 0.15.125 |
| `README.md` | 版本入口和使用说明 |
| `docs/site-sync-deploy-v125.md`（新增） | 本文 |
| `release-manifest.json` | 打包生成的完整性清单 |

## 验证与数据库

同步 v120–v124、Linux 部署、构建管道和快照检查共 107 项通过；新增部署/诊断及 Worker 验收检查 38 项通过。测试使用隔离数据库和模拟网络，未发布远程 Worker，未执行真实 systemd 安装。数据库 SQL 与 v124 完全一致，无需重置或新增迁移，不增加依赖。
