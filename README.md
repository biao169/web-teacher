# 教师个人/团队网站双平台版本

这个项目是不使用 Flask 的轻量 Python 网站骨架，目标是：

- 前期部署到 Cloudflare Workers，可正常维护和展示网站。
- 后期可导出 JSON/CSV/YAML/Excel/ZIP，再快速迁移到 Ubuntu。
- 共享核心代码，Cloudflare 和 Ubuntu 只保留薄适配层。
- 前台展示教师照片、团队成员照片、论文、项目、专利、学生、课程和动态。
- 后台可配置导航栏、首页按钮、栏目内容和排序。

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
