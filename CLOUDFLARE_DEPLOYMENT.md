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

`0001_initial.sql` 是首次部署唯一需要执行的数据库初始化文件，包含当前全部表、字段和索引。初始化脚本只建表，不插入示例数据。不要在已有正式数据的数据库中反复手动执行初始化脚本；已有数据迁移应先备份，再使用后台“导入与导出”恢复或按后续新增迁移说明升级。

## 本地调试

```powershell
uv run pywrangler dev
```

## 部署

```powershell
uv run pywrangler deploy
```

`wrangler.toml` 中已设置 `workers_dev = true`，部署后可以通过 Cloudflare 提供的 `*.workers.dev` 地址访问。若部署成功但访问根路径显示 404，优先检查 Worker 路由逻辑：本项目只有 `/assets/...` 和 `/media/...` 走静态资源/R2，`/`、`/team`、`/publications` 等前台页面必须由 Python Worker 动态渲染。

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

该脚本会在部署前把 `app/` 复制成 `src/app/`，让 `src/worker.py` 可以在 Cloudflare Python Worker 入口目录内导入本地业务包；同时会把根目录 `i18n_dictionary.json` 复制为 `src/i18n_dictionary.json`，作为 R2 词典不存在时的随包默认词典。`src/app/` 和 `src/i18n_dictionary.json` 都是生成内容，已经加入 `.gitignore`，不要手动维护。

如果部署时报 `ModuleNotFoundError: No module named 'app'`，需要确认 `tools/prepare_cloudflare_build.py`、`.gitignore` 和 `wrangler.toml` 的 `[build]` 配置已经推送到 GitHub，并由 Cloudflare 使用最新提交重新部署。

## R2 媒体桶说明

`teacher-site-media` R2 桶为空不影响网站首页显示。静态 CSS/JS 和三张默认媒体来自 `public/` 的 Cloudflare Static Assets，其中 `public/media/default/` 会随部署一起发布，仅包含网站默认图标、教师默认头像和学生默认头像。

后台在 Cloudflare Worker 环境上传或裁剪媒体时，会写入 R2 的 `MEDIA` 绑定，并在 D1 的 `media_assets` 表记录 `storage_kind = r2`。新上传对象默认使用 `uploads/<category>/<filename>-<timestamp>` key，前台访问路径仍是 `/media/uploads/...`。

Worker 的 `/media/...` 路由按 key 优化读取顺序：

- `/media/uploads/...` 和 `/media/r2/...`：先查 R2，找不到再回退 Static Assets。
- `/media/profile/...`、`/media/icons/...` 等普通静态媒体：先查 Static Assets，找不到再回退 R2。

迁移到 Ubuntu 时，导出 D1 数据和 R2 媒体对象，将 R2 对象恢复到 Ubuntu 项目的 `media/uploads/...`，数据库中的 `object_key` 不需要改变。

## R2 翻译词典说明

根目录 `i18n_dictionary.json` 是本项目唯一正式维护的手动中英互译词典源文件，主要用于前台固定 UI 文案和可复用内容译文。

Cloudflare Worker 渲染动态页面时，词典读取顺序为：

1. R2 `MEDIA` 桶中的 `i18n/i18n_dictionary.json`。
2. 随部署包生成的 `src/i18n_dictionary.json`。
3. 内置 `TRANSLATIONS` 和 D1 中的 `translation_cache`。

在后台“手动中英词典”界面点击“保存词典文件”时：

- Cloudflare Worker 环境会把当前词典文件内容写入 R2 的 `i18n/i18n_dictionary.json`。
- 本地/Ubuntu 环境会直接写回根目录 `i18n_dictionary.json`。

后台“翻译缓存”页只显示模型字段翻译任务。若某个字段原文命中手动词典，前台英文会直接使用词典译文，后台缓存列表显示为“词典命中”，对应英文内容不可在缓存列表中修改，只能进入“手动中英词典”页修改词典文件。

如需把线上词典同步回本地，可从 R2 下载 `i18n/i18n_dictionary.json`，覆盖项目根目录的 `i18n_dictionary.json` 后再提交代码。
