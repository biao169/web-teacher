# 教师个人/团队网站 Skill 与架构规划

本文档用于指导 `web03` 的新一版教师个人/团队网站设计。目标是保留 `web01` 的核心业务能力，吸收 `web02` 的 Cloudflare 迁移经验，同时满足：

- 不使用 Flask。
- 尽量使用 Python，便于后续维护。
- 同一套代码尽量同时适配 Cloudflare Workers 和普通 Ubuntu 云服务器。
- 前期以 Cloudflare Workers 作为可正常使用的生产环境，后期可通过标准导出包迁移到 Ubuntu。
- 前台导航、按钮、栏目开关和排序可通过后台配置。
- 前台必须展示教师个人照片、团队成员简介和照片。

## 1. Skill 检索结果

本次检索了当前可安装的 OpenAI curated skills。未找到以下精确命名的现成 skill：

- `Academic-IA-Planner`
- `Publication-Parser`
- `Content-Schema-Builder`
- `Academic-Design-System`
- `Math-And-Media-Renderer`
- `SSG-Architecture-Selector`
- `Academic-SEO-Optimizer`
- `Responsive-Accessibility`
- `Alumni-And-News-Updater`

已安装与本项目最直接相关的现成 skill：

- `cloudflare-deploy`：用于后续 Cloudflare 部署流程、Wrangler 配置和上线检查。安装位置为 `C:\Users\Admin\.codex\skills\cloudflare-deploy`，将在下一轮 Codex 对话中可直接使用。

由于学术主页相关 skill 暂无现成包，本项目采用“项目内 skill 矩阵”作为设计约束，后续如果需要，可以把下面 9 个能力沉淀为本地 Codex skills。

## 2. 项目内 Skill 矩阵

### Academic-IA-Planner

负责网站信息架构。前台一级导航建议：

- 首页：教师身份、照片、研究方向、代表成果、近期动态。
- 团队：教师、博士后、博士生、硕士生、本科生、毕业生。
- 论文：筛选、分组、引用复制、BibTeX/DOI/PDF 链接。
- 项目：基金项目、横向项目、进行中/已结题状态。
- 专利与软著：专利、授权、申请、软件著作权。
- 课程：课程简介、课件资源、授课对象。
- 动态：新闻、获奖、招生、会议、学生去向。
- 联系：邮箱、办公室、招生方向、留言。

后台必须允许维护：

- 导航项标题、中英文标题、路由或外链、图标、按钮样式、是否启用、排序。
- 首页按钮，例如“查看论文”“团队成员”“联系留言”，通过后台配置，不写死在模板中。
- 首页展示模块开关，例如代表论文、项目、专利、学生、新闻是否展示和展示条数。

### Publication-Parser

负责论文导入和标准化。建议能力：

- 支持 DOI、BibTeX、GB/T 7714、APA、IEEE 原始引用文本解析。
- 支持 ORCID、Google Scholar、DBLP、CNKI 链接字段。
- 保留 `source_citation`，自动解析只作为建议结果，避免覆盖人工整理内容。
- 支持 Crossref、OpenAlex、Semantic Scholar 查询，但自动外传论文标题或站点内容前必须显式授权。
- 输出多种引用格式，并在前台支持单条复制、批量复制、格式切换。

### Content-Schema-Builder

负责结构化内容。建议采用 Python 共享 schema：

- Python 侧使用 Pydantic 或 dataclass 定义内容模型。
- 存储层抽象为 Repository，Cloudflare 使用 D1/R2，Ubuntu 使用 SQLite/Postgres + 本地文件或 S3/R2。
- 导入导出格式支持 JSON、YAML、CSV 和 Excel；`.xlsx` 的复杂处理优先放在 Python 工具侧，Cloudflare 后台可提供异步导出或 JSON/CSV 轻量导出。
- 关键模型：`SiteSetting`、`GlobalSetting`、`NavigationItem`、`Profile`、`ResearchInterest`、`Publication`、`Project`、`Patent`、`Student`、`StudentCategoryDisplay`、`News`、`Course`、`Message`、`MediaAsset`、`TranslationCache`、`AutoFetchLog`。

### Academic-Design-System

负责学术风 UI/UX。设计方向：

- 首页第一屏直接出现教师姓名、职称、单位、个人照片、研究摘要和主要行动按钮。
- 学术内容以密集、可扫描、低装饰的列表为主，避免营销式大卡片堆叠。
- 论文、项目、专利使用紧凑列表和筛选栏；团队成员用照片 + 简介 + 链接的清晰布局。
- 配色应克制但不单色：白底、深灰正文、学术蓝/墨绿作为强调色，辅以浅色分隔线。
- 中英文切换不应破坏布局，长英文标题和 DOI 要允许换行。

### Math-And-Media-Renderer

负责公式、PDF 和媒体展示：

- KaTeX 用于新闻、课程、项目说明中的公式渲染。
- PDF 采用 PDF.js 或浏览器原生预览；下载、水印和可见范围由后台配置。
- 图片、头像、Logo、新闻封面统一进入媒体库。
- Cloudflare 部署时媒体存 R2；Ubuntu 可存本地 `media/` 或对象存储。
- 后台上传图片应支持裁剪、压缩、复用已有媒体。

### SSG-Architecture-Selector

负责静态生成与运行时渲染的取舍。推荐不是纯 SSG，而是“双模式 SSR + 可导出静态快照”：

- Cloudflare：Python Worker 动态渲染 HTML，静态资源通过 Workers Static Assets，数据放 D1，媒体放 R2。
- Ubuntu：同一套 Python 应用以 ASGI 方式运行，数据放 SQLite/Postgres，媒体放本地或对象存储。
- 可选静态导出：提供 `python -m tools.export_static`，生成可归档的 HTML 快照，便于备份、镜像和搜索引擎兜底。

这样后台修改导航、按钮和内容后，两种部署都能即时生效，不需要每次都重新构建全部静态页面。

### Academic-SEO-Optimizer

负责学术 SEO：

- 每页独立 `title`、`description`、canonical、Open Graph。
- 论文页输出 DOI、作者、年份、期刊会议等结构化元数据。
- 生成 `sitemap.xml` 和 `robots.txt`。
- 教师页提供 ORCID、Google Scholar、DBLP、ResearchGate、CNKI 等外部学术主页链接。
- 中英文页面使用稳定 URL，例如 `/zh/` 与 `/en/`，并设置 `hreflang`。

### Responsive-Accessibility

负责响应式与无障碍：

- 移动端优先保证导航、筛选、论文复制工具和后台表单可用。
- 图片必须有 `alt`；头像缺失时使用姓名首字母或默认头像。
- 表单控件必须有 label；按钮文本来自后台时仍需有可读的 aria label。
- 颜色对比满足 WCAG AA；键盘可访问后台主要操作。

### Alumni-And-News-Updater

负责学生动态、毕业去向和新闻维护：

- 学生模型保留入学、毕业、去向、奖项、主页、联系方式可见范围。
- 学生页可按“在读博士/在读硕士/毕业生/合作学生”等后台配置分组。
- 新闻可关联论文、项目、学生，支持富文本、封面、PDF、评论审核。
- 重要动态可置顶或设为首页展示。

## 3. Cloudflare 官方要求摘要

截至 2026-08-14 官方文档显示：

- Python Workers 是 beta，需要 `python_workers` compatibility flag。
- Python Worker 入口是继承 `WorkerEntrypoint` 的 `Default` 类，并实现 `fetch`。
- Python Workers 使用 `pywrangler` 开发和部署，官方流程要求安装 `uv` 和 Node。
- Workers Static Assets 可把 HTML、CSS、图片等随 Worker 一次部署；`wrangler` 配置中通过 `[assets] directory = "./dist"` 和 `binding = "ASSETS"` 绑定。
- 默认情况下，匹配静态资源的请求可直接由 Cloudflare 静态资源层响应；找不到资源时再进入 Worker。可以用 `run_worker_first` 控制特定路径先走 Worker，例如 `/api/*`、`/admin/*`。
- 标准 Wrangler 部署流程仍需要 Cloudflare 账号、Node.js、Wrangler/C3，并通过 `wrangler deploy` 或 `pywrangler deploy` 发布。

本项目推荐配置方向：

```toml
name = "teacher-site"
main = "src/worker.py"
compatibility_date = "2026-08-14"
compatibility_flags = ["python_workers"]

[assets]
directory = "./public"
binding = "ASSETS"
run_worker_first = ["/admin/*", "/api/*", "/media/*", "/sitemap.xml", "/robots.txt"]

[[d1_databases]]
binding = "DB"
database_name = "teacher_site"
database_id = "replace-after-create"
migrations_dir = "migrations"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "teacher-site-media"
```

## 4. 从 web01 继承的功能边界

`web01` 是一个完整的 Django 教师个人/团队网站，不是简单静态主页。需要继承的核心能力：

- 公开页面：首页、论文、代表论文、项目、专利、学生、团队、新闻、课程、联系、sitemap、robots。
- 后台数据：站点设置、全局设置、导航、教师、研究方向、论文、项目、专利、学生、新闻、课程、留言、媒体、翻译缓存。
- 后台辅助：字段历史提示、查重、媒体复用、图片裁剪、富文本新闻编辑、PDF 在线阅读、媒体引用检测、媒体回收站、上传限制、速率限制。
- 服务层：论文元数据补全、引用解析、翻译缓存、新闻安全渲染、媒体库管理、图片压缩、备份。

需要重构的部分：

- Django Admin 不能直接运行在 Cloudflare Workers 中。
- Django ORM 需要抽象为跨 D1/SQLite/Postgres 的 repository。
- 本地 `media/` 文件系统需要抽象为 R2/local filesystem。
- 登录和权限需要适配 Cloudflare Access 与 Ubuntu 会话登录。
- Excel 导入导出建议放到 Python 管理工具和 Ubuntu 后台中，Cloudflare Worker 中优先支持 CSV/JSON。

## 5. 从 web02 继承的 Cloudflare 经验

`web02` 已验证的 Cloudflare 原生模型：

- Workers + Static Assets 承载前台和后台页面。
- D1 保存结构化内容。
- R2 保存图片、PDF、附件、视频等媒体对象。
- `public/media/` 可作为本地调试目录，部署后迁移到 R2。
- `/media/*` 在生产中由 Worker/R2 接管，或通过 `PUBLIC_MEDIA_BASE_URL` 指向公开对象存储域名。
- 后台可用 Cloudflare Access 邮箱白名单保护；本地用 `LOCAL_ADMIN_TOKEN` 调试。
- 自动翻译和论文外部元数据补全不应默认批量外传数据。

`web03` 不直接照搬 `web02` 的 TypeScript/Hono 实现，而是继承资源模型和部署经验，改为 Python 优先。

## 6. 推荐技术架构

### 6.1 分层结构

建议目录：

```text
web03/
  app/
    core/                 # 平台无关业务逻辑
      models.py           # Pydantic/dataclass schema
      repositories.py     # Repository 接口
      rendering.py        # HTML 页面渲染入口
      navigation.py       # 后台配置驱动的导航/按钮
      citations.py        # DOI/BibTeX/GB/T/APA/IEEE 解析
      media.py            # 媒体 key、URL、校验、压缩
      seo.py              # sitemap/robots/meta/schema.org
      security.py         # HTML 清洗、上传限制、限流辅助
    adapters/
      cloudflare/         # Python Worker + D1/R2/ASSETS
      ubuntu/             # ASGI + SQLite/Postgres/local storage
    admin/                # 后台页面与表单逻辑
    public/               # 前台页面逻辑
    templates/
    static/
  content/
    seed/                 # 演示数据与初始化内容
  migrations/
    d1/
    sqlite/
  tools/
    import_web01.py
    export_static.py
    backup_site.py
  public/                 # Workers Static Assets / 构建输出
  docs/
```

### 6.2 Python Web 层

不使用 Flask。可选路线：

- 推荐：FastAPI/Starlette 风格 ASGI 应用，Ubuntu 直接 `uvicorn` 运行；Cloudflare 侧用 Python Workers/FastAPI 适配。
- 保守 Cloudflare 生产路线：公共页面和后台 API 使用 Python Worker `WorkerEntrypoint`，Ubuntu 适配层用 Starlette 暴露同样路由。业务逻辑保持在 `app/core`。

由于 Cloudflare Python Workers 仍是 beta，第一版实现应避免重依赖：

- 不依赖本地文件写入。
- 不在 Worker 中执行复杂图片处理。
- 不把 `.xlsx` 处理放进 Worker 请求路径。
- 不把大型 PDF 处理放进 Worker；只做访问控制和 R2 代理。

### 6.3 数据与媒体适配

| 能力 | Cloudflare Workers | Ubuntu |
| --- | --- | --- |
| 结构化数据 | D1 | SQLite 或 Postgres |
| 媒体文件 | R2 | 本地 `media/` 或 S3/R2 |
| 静态资源 | Workers Static Assets | Nginx 或 ASGI static |
| 后台认证 | Cloudflare Access + `ADMIN_EMAILS` | Session/JWT + 管理员账号 |
| 本地调试 | `.dev.vars` + `LOCAL_ADMIN_TOKEN` | `.env` + 本地管理员 |
| 备份 | D1 export + R2 manifest | DB dump + media tar/rsync |

Repository 接口必须稳定，例如：

- `list_profiles()`
- `list_publications(filters)`
- `save_publication(data)`
- `list_navigation(enabled_only=True)`
- `save_media_asset(meta)`
- `open_media_stream(key)`

这样前台、后台和导入工具不直接关心 D1、SQLite 或 R2。

## 7. 数据可迁移与导出契约

Cloudflare 阶段必须不是“临时版”。它写入的每一类内容都要能完整导出，并能在 Ubuntu 部署中快速导入。

### 7.1 标准导出包

后台提供“整站导出”功能，生成一个 zip 包：

```text
teacher-site-export-YYYYMMDD-HHMMSS.zip
  manifest.json
  content/
    site_settings.json
    global_settings.json
    navigation_items.json
    profiles.json
    research_interests.json
    publications.json
    projects.json
    patents.json
    students.json
    student_category_displays.json
    news.json
    courses.json
    messages.json
    media_assets.json
    translation_cache.json
  tabular/
    publications.xlsx
    projects.xlsx
    patents.xlsx
    students.xlsx
    news.xlsx
    all_tables.xlsx
  yaml/
    site_settings.yaml
    navigation_items.yaml
  media/
    media_manifest.csv
    media_manifest.json
```

`manifest.json` 必须包含：

- `schema_version`：例如 `2026.08.14.1`。
- `exported_at`：导出时间。
- `source_platform`：`cloudflare` 或 `ubuntu`。
- `site_url`：导出来源站点。
- `table_counts`：每张表记录数。
- `media_count` 和 `media_total_bytes`。
- `checksum`：重要文件校验值，便于迁移后核对。

### 7.2 内容 ID 与媒体 key 稳定

跨平台迁移时不要依赖数据库自增 ID 作为唯一业务标识。建议每张主要表增加稳定字段：

| 模型 | 稳定标识 |
| --- | --- |
| 教师/团队成员 | `uid`，例如 `profile-zhang-san` |
| 论文 | `uid`，优先由 DOI 规范化生成；无 DOI 时用标题 hash |
| 项目 | `uid`，由项目编号或标题 hash 生成 |
| 专利 | `uid`，由申请号/授权号或标题 hash 生成 |
| 学生 | `uid`，由学号或姓名+入学年份 hash 生成 |
| 新闻 | `slug` |
| 课程 | `uid`，由课程名+学期生成 |
| 媒体 | `object_key` |
| 导航 | `key` |

媒体文件不直接嵌入 JSON。业务表只保存 `avatar_key`、`cover_key`、`pdf_key`、`attachment_key` 等 object key。Cloudflare 中这些 key 指向 R2；Ubuntu 中同样 key 可映射到本地 `media/` 或对象存储。

### 7.3 Excel 导出策略

Cloudflare Worker 上不适合在请求路径中生成大型复杂 Excel。建议采用分层策略：

- Cloudflare 后台即时导出：JSON、CSV、YAML、媒体清单。
- Cloudflare 后台小规模 Excel：仅对单表、记录量可控时生成。
- 推荐完整 Excel：下载 JSON/CSV 导出包后，在本地或 Ubuntu 上用 Python 工具生成 `.xlsx`。
- Ubuntu 后台：可以直接生成完整 `all_tables.xlsx`，因为普通服务器更适合运行 openpyxl/pandas 这类库。

配套工具：

```powershell
D:\Python\Miniconda\envs\py312\python.exe -m tools.export_bundle --format zip
D:\Python\Miniconda\envs\py312\python.exe -m tools.bundle_to_excel exports\teacher-site-export.zip
D:\Python\Miniconda\envs\py312\python.exe -m tools.import_bundle exports\teacher-site-export.zip --target sqlite
```

### 7.4 Cloudflare 到 Ubuntu 迁移流程

推荐迁移流程：

1. 在 Cloudflare 后台执行“整站导出”，下载 zip。
2. 导出 R2 媒体对象，或根据 `media/media_manifest.json` 批量下载媒体。
3. 在 Ubuntu 部署新站点，初始化数据库 schema。
4. 上传导出包到 Ubuntu 服务器。
5. 执行 `python -m tools.import_bundle`，导入 JSON/YAML 内容和媒体清单。
6. 如果媒体转为本地存储，把 R2 object key 对应文件放入 `media/<object_key>`。
7. 执行校验：表记录数、媒体 key 存在率、sitemap URL 数、首页/团队/论文页 smoke test。

### 7.5 反向迁移

为了防止后期需要再回到 Cloudflare，Ubuntu 版本也必须使用同一套导出包格式：

- Ubuntu 后台导出的 zip 结构与 Cloudflare 完全一致。
- `schema_version` 升级必须附带迁移脚本。
- 导入器必须支持从旧 `schema_version` 升级到当前 schema。
- 所有平台适配层都只读写共享 schema，不私自新增只在单平台存在的业务字段。

## 8. 后台可配置导航与按钮

建议保留并扩展 `NavigationItem`：

| 字段 | 说明 |
| --- | --- |
| `title`, `title_en` | 中英文导航标题 |
| `kind` | `route`、`external`、`anchor`、`button` |
| `url_name` | 内部路由名，例如 `publications` |
| `path` | 直接路径，例如 `/publications` |
| `fragment` | 锚点，例如 `featured-publications` |
| `icon` | 可选图标名 |
| `style` | `link`、`primary`、`secondary`、`ghost` |
| `location` | `header`、`home_hero`、`footer`、`admin_sidebar` |
| `enabled` | 是否启用 |
| `display_order` | 排序 |
| `visibility` | public/authenticated/staff/hidden |

前台模板读取后台配置后渲染导航，不在 HTML 中写死栏目顺序。首页按钮也走同一模型，只是 `location = "home_hero"`。

## 9. 前台设计规划

### 首页

首屏必须包含：

- 教师个人照片。
- 姓名、职称、单位、实验室/团队名。
- 研究摘要和招生方向。
- 后台配置的主要按钮。
- 学术链接：ORCID、Google Scholar、DBLP、CNKI、GitHub 等。

首屏之后：

- 研究方向标签。
- 代表论文。
- 近期动态。
- 代表项目、专利、学生。

### 团队页

团队成员必须支持：

- 头像。
- 姓名、中英文名。
- 身份/年级/方向。
- 简介。
- 邮箱、主页、Scholar、GitHub。
- 展开/收起长简介。
- 按后台配置分组和排序。

### 论文页

必须支持：

- 关键词、年份、类型、作者角色筛选。
- 按年份、类型、代表性成果分组。
- GB/T、APA、IEEE、BibTeX 复制。
- DOI、PDF、项目关联。
- PDF 可见范围控制。

### 动态页

必须支持：

- 新闻分类。
- 富文本或 Markdown 内容。
- 封面图。
- PDF 在线阅读。
- 可关联论文、项目、学生。
- 评论是否开启由后台配置。

## 10. Ubuntu 部署规划

Ubuntu 侧建议：

- Python 运行时：3.12。
- Web server：Uvicorn/Gunicorn + Uvicorn workers。
- 反向代理：Nginx。
- 数据库：小型站点 SQLite 即可；多人协作或高并发用 Postgres。
- 媒体：本地 `media/`，定期备份；如希望与 Cloudflare 共用媒体，可改用 R2/S3。
- 定时任务：systemd timer 或 cron，用于备份、sitemap 刷新、静态快照导出。

典型命令形态：

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m tools.migrate sqlite
uvicorn app.adapters.ubuntu.main:app --host 127.0.0.1 --port 8000
```

Windows 本地开发继续优先使用：

```powershell
D:\Python\Miniconda\envs\py312\python.exe
```

## 11. Cloudflare 部署规划

Cloudflare 侧建议：

- 使用 `uv` + `pywrangler` 管理 Python Worker。
- 使用 D1 保存内容。
- 使用 R2 保存头像、团队照片、论文 PDF、新闻图片和附件。
- 使用 Workers Static Assets 保存 CSS、JS、默认图片、前端库。
- 使用 Cloudflare Access 保护 `/admin/*`。
- 使用 `run_worker_first` 让 `/admin/*`、`/api/*`、`/media/*`、`/sitemap.xml`、`/robots.txt` 进入 Worker。

典型流程：

```powershell
uv run pywrangler dev
uv run pywrangler deploy
```

或者在需要普通 Wrangler 能力时：

```powershell
npx wrangler d1 create teacher_site
npx wrangler r2 bucket create teacher-site-media
npx wrangler d1 migrations apply teacher_site --remote
npx wrangler deploy
```

## 12. 第一阶段实施顺序

1. 建立 `app/core` 内容 schema 和 repository 接口。
2. 建立首页、团队、论文、项目、专利、学生、新闻、课程、联系的模板。
3. 建立 SQLite 本地 repository 和演示数据，先跑通 Ubuntu/本地 ASGI。
4. 建立后台通用 CRUD：站点设置、导航、教师、学生、论文、项目、专利、新闻。
5. 加入头像/照片/媒体库字段，并实现本地 media 存储。
6. 建立 Cloudflare D1/R2 repository 和 Python Worker 入口。
7. 加入 Cloudflare Static Assets 配置与部署脚本。
8. 建立标准导出包：JSON/YAML/CSV/Excel/媒体清单。
9. 建立导入器：Cloudflare 导出包到 Ubuntu SQLite/Postgres。
10. 从 `web01` 导入真实数据，并参考 `web02` 的迁移清单处理媒体 key。
11. 做响应式、SEO、无障碍、PDF、KaTeX、引用复制。
12. 最后补充备份、安全限流和部署文档。

## 13. 明确排除

- 不使用 Flask。
- 不把 Django Admin 直接搬到 Cloudflare Workers。
- 不在 Worker 请求路径中处理大型 Excel、图片压缩或复杂 PDF 转换。
- 不默认批量调用外部翻译或论文元数据服务，除非管理员显式授权。
- 不允许 Cloudflare 版和 Ubuntu 版出现互不兼容的数据格式。

## 14. 下一步建议

下一步可以直接在 `web03` 初始化代码骨架：

- Python 共享核心：schema、repository、渲染、媒体、SEO。
- 本地 Ubuntu 适配：ASGI 应用、SQLite、后台 CRUD。
- Cloudflare 适配：Python Worker 入口、D1/R2 绑定、Static Assets 配置。
- 数据迁移工具：标准导出包、Excel 生成、导入校验。
- 演示数据：教师照片、团队成员照片、论文、项目、新闻。
