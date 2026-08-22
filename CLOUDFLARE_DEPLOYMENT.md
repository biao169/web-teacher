# Cloudflare Workers 部署说明

本项目使用 Cloudflare Workers + D1 + R2 + Static Assets。

## 资源

```powershell
npx wrangler d1 create teacher_site
npx wrangler r2 bucket create teacher-site-media
npx wrangler d1 migrations apply teacher_site --remote
```

把 D1 `database_id` 写入 `wrangler.toml`。

也可以在 Cloudflare D1 控制台直接打开数据库，复制并执行：

```text
migrations/0001_initial.sql
```

该文件已经合并为单个完整初始化脚本，适合空数据库首次建表。不要在已有正式数据的数据库中反复手动执行初始化脚本；已有数据迁移应先备份，再使用后台“导入与导出”恢复。

## 本地调试

```powershell
uv run pywrangler dev
```

## 部署

```powershell
uv run pywrangler deploy
```

## 数据迁移

Cloudflare 后台可先导出 `/api/export/site.json`。完整 Excel/ZIP 导出建议在本地或 Ubuntu 运行：

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m tools.export_bundle
```

## 生成密钥，配置到cloudflare，不是填入.toml
```powershell
D:\Python\Miniconda\envs\py312\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```
将生成的密钥，手动在worker中添加变量

## 网页端部署 Python 本地模块

Cloudflare 网页端部署不会自动把项目根目录的 `app/` 业务包作为 Python 模块加入 Worker。`wrangler.toml` 已配置构建前脚本：

```toml
[build]
command = "python tools/prepare_cloudflare_build.py"
watch_dir = "app"
```

该脚本会在部署前把 `app/` 复制成 `src/app/`，让 `src/worker.py` 可以在 Cloudflare Python Worker 入口目录内导入本地业务包。`src/app/` 是生成目录，已经加入 `.gitignore`，不要手动维护。

如果部署时报 `ModuleNotFoundError: No module named 'app'`，需要确认 `tools/prepare_cloudflare_build.py`、`.gitignore` 和 `wrangler.toml` 的 `[build]` 配置已经推送到 GitHub，并由 Cloudflare 使用最新提交重新部署。
