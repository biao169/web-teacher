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
