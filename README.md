# Cloudflare 原生教师个人/团队网站

这是为 Cloudflare 免费部署重新设计的新项目，目标是替代原 Django 站点的核心功能：

- Workers/Hono：前台页面、后台页面和 API。
- D1：结构化内容数据库，替代 Django ORM/SQLite。
- R2：图片、PDF、附件、视频等媒体对象存储，替代 `media/` 文件夹。
- Workers Static Assets：CSS、JS、默认图标等静态资源。
- Cloudflare Access 或 JWT：保护 `/admin` 后台。

## 本地开发

本地阶段先使用 `public/media/` 存放图片、PDF、附件等媒体文件，并在数据库中记录相对 key，例如 `profile/avatar.jpg`。部署到 Cloudflare 后，再把这些文件上传到 R2；代码中的 `/media/*` 路径会由 Worker/R2 接管。

需要先安装 Node.js LTS。当前项目依赖 `npm`、`wrangler` 和 TypeScript 工具链。

如果 Windows 主机没有 Node/npm，但 Docker 可用，可以使用项目内的工具容器：

```powershell
.\tools\docker-npm.ps1 install
.\tools\docker-npm.ps1 run typecheck
.\tools\docker-npm.ps1 run db:migrate:local
.\tools\docker-npm.ps1 run db:seed:local
.\tools\docker-dev.ps1
```

该方式使用 `docker-compose.tools.yml` 中的 `node:24-alpine`。当前本机已有的 Saleor 镜像不包含 Node/npm，不能直接复用来运行 Wrangler。

```powershell
npm install
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

## 部署流程

1. 创建 D1 数据库：

```powershell
wrangler d1 create teacher_site
```

将返回的 `database_id` 写入 `wrangler.toml`。

2. 创建 R2 bucket：

```powershell
wrangler r2 bucket create teacher-site-media
```

3. 应用远程迁移：

```powershell
npm run db:migrate:remote
```

4. 部署 Worker：

```powershell
npm run deploy
```

## 权限建议

生产环境建议使用 Cloudflare Access 保护 `/admin/*`，Worker 会读取 `Cf-Access-Authenticated-User-Email`，并要求邮箱出现在 `ADMIN_EMAILS` 白名单中。本地调试可在 `.dev.vars` 配置 `LOCAL_ADMIN_TOKEN`，请求后台时附带同名请求头；生产环境应保持该变量为空。

## 数据迁移

从原 Django SQLite 导出 D1 SQL 和媒体清单：

```powershell
D:\Python\Miniconda\envs\py312\python.exe tools\export_django_to_cloudflare.py --source ..\web01\db.sqlite3 --media-root ..\web01\media --out data\django_export.sql --media-manifest data\media_manifest.csv
```

本地导入：

```powershell
wrangler d1 execute teacher_site --local --file=./data/django_export.sql
```

远程导入：

```powershell
wrangler d1 execute teacher_site --remote --file=./data/django_export.sql
```

`data/media_manifest.csv` 会列出旧媒体文件路径。部署前可以把对应文件复制到 `public/media/` 做本地调试；正式部署时上传到 R2，并保持 object key 一致。

## 已迁移功能

- 前台：首页、团队、论文、代表性论文、项目、专利/软著、学生、课程、新闻、新闻评论、留言、sitemap、robots。
- 后台：表级列表、搜索、新增、编辑、删除、CSV 导入导出、全站 JSON 导出、媒体库、上传、字段历史提示、重复检查。
- 数据：覆盖原 Django 主要模型字段，文件字段统一用 R2/local media object key。
- 安全：后台依赖 Cloudflare Access 邮箱白名单或本地 `LOCAL_ADMIN_TOKEN`；新闻内容不直接注入原始 HTML，而是安全文本渲染，并单独识别 PDF 链接。
- 工具：翻译缓存扫描、手动翻译写入、论文外部元数据查询 URL 生成、手动元数据应用。

## 需要显式授权后再启用的功能

自动翻译和自动 Crossref/OpenAlex 补全会把站点内容或论文标题发送到第三方服务。当前代码只生成待处理缓存、查询 URL 和手动应用入口，不会默认批量外传数据。若确认可以联网外传，再添加自动执行端点。
