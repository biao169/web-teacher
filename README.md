# 教师个人/团队网站双平台版本

这个项目是不使用 Flask 的轻量 Python 网站骨架，目标是：

- 前期部署到 Cloudflare Workers，可正常维护和展示网站。
- 后期可导出 JSON/CSV/YAML/Excel/ZIP，再快速迁移到 Ubuntu。
- 共享核心代码，Cloudflare 和 Ubuntu 只保留薄适配层。
- 前台展示教师照片、团队成员照片、论文、项目、专利、学生、课程和动态。
- 后台可配置导航栏、首页按钮、栏目内容和排序。


## Ubuntu/Debian 一键部署

公开仓库可在 Ubuntu/Debian 服务器上用一行命令部署：

```bash
tmp=$(mktemp) && curl -fsSL https://raw.githubusercontent.com/biao169/web-teacher/main/deploy/ubuntu/install.sh -o "$tmp" && chmod +x "$tmp" && "$tmp"
```

脚本会提示输入域名、内部监听端口、安装目录和仓库地址；域名留空时默认使用服务器 IP。部署完成后，首次访问 `/admin/setup` 初始化高级管理员账号。

常用维护命令：

```bash
web-teacher status
web-teacher logs
web-teacher restart
web-teacher paths
web-teacher update
web-teacher backup
web-teacher reset-data
web-teacher uninstall
```

重复运行部署脚本时会检测历史残留，默认 `keep` 会保留数据库、媒体文件和密钥；需要清空数据时可选择 `reset` 或运行 `web-teacher reset-data`，删除类操作都会要求输入确认文本。

该一行命令可以在任意当前目录运行；脚本内部会自动进入安装目录执行初始化与更新命令。

如果 Nginx 启动失败但 `nginx -t` 通过，通常是 80 端口被 Apache/Caddy/旧 Nginx 或云面板占用，可运行 `sudo ss -ltnp | grep ':80 '` 和 `web-teacher nginx-test` 检查。

## 本地 Ubuntu 风格开发

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m pip install -r requirements.txt
D:\Python\Miniconda\envs\py312\python.exe -m tools.init_db
D:\Python\Miniconda\envs\py312\python.exe -m tools.serve_ubuntu
```

访问 `http://127.0.0.1:8000`。

首次部署默认只初始化空数据库，不自动填充示例数据。

如需本地演示基础示例内容：

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m tools.init_db --seed
```

填充更完整的示例内容：

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m tools.seed_examples
```

如果只想快速预览，也可以不安装 Uvicorn，直接运行标准库开发服务器：

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m tools.dev_server --port 8003
```

## 导出迁移包

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m tools.export_bundle --site-url http://127.0.0.1:8000
```

导出包包含：

- `manifest.json`
- `content/*.json`
- `tabular/*.csv`
- `tabular/all_tables.xlsx`
- `yaml/*.yaml`
- `media/media_manifest.*`

## 导入迁移包

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m tools.import_bundle exports\teacher-site-export-YYYYMMDD-HHMMSS.zip --db data\site.sqlite3
```

## Cloudflare Workers

Cloudflare 侧使用：

- Python Workers
- Workers Static Assets
- D1
- R2

初始化资源：

```powershell
npx wrangler d1 create teacher_site
npx wrangler r2 bucket create teacher-site-media
npx wrangler d1 migrations apply teacher_site --remote
```

把 D1 返回的 `database_id` 写入 `wrangler.toml` 后部署：

```powershell
uv run pywrangler deploy
```

## 低 CPU 设计约束

- 页面请求只做小范围 SQL 查询和字符串渲染。
- 列表默认最多读取 300-500 条。
- Excel、图片压缩、完整备份等高 CPU 工作放在本地或 Ubuntu 工具中。
- Cloudflare 请求路径只做轻量 CRUD、导航读取、页面渲染和 R2/Static Assets 分发。
