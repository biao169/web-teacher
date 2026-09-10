# Academic CMS — 完整后台管理版本

## 当前交付范围

本工程包含公开站、数据库、安全、媒体/i18n/缓存、登录注册与留言，以及已接通真实页面、权限和 API 的完整后台。后台概览统一使用紧凑数据表，主要对象统一使用右侧完整编辑布局。

后台已可管理：

```text
教师与团队
研究方向
论文
项目
专利与软件著作
学生
学生分类显示
新闻动态
课程
联系留言
网站设置
全局设置
导航与按钮
媒体库
翻译
账号权限
操作日志
导入导出
```

## 技术基线

- Node.js `>=24.19.0 <25`
- pnpm `11.19.0`
- Nuxt `4.5.2` / Vue `3.5.42`
- Element Plus `2.14.5`
- TanStack Vue Query `5.102.8`
- Pinia `4.0.3`
- SQLite / Cloudflare D1

Ubuntu 使用 Nitro `node-server`；Cloudflare 使用 `cloudflare_module`（Workers Module）。

## Windows 本地升级和启动

项目根目录提供：

```text
start_windows.bat
```

从上一阶段覆盖代码后执行：

```bat
pnpm install
pnpm run db:migrate:sqlite
```

覆盖新版代码后必须重新安装锁定依赖并执行全部待应用迁移。随后双击 `start_windows.bat`，或运行：

```bat
pnpm exec nuxt dev --host 127.0.0.1 --port 8005
```

默认后台入口：

```text
http://127.0.0.1:8005/admin
```

### 一键完整演示初始化

首次本地验收后台，先关闭正在运行的网站，然后双击：

```text
initialize_windows.bat
```

脚本固定使用 `D:\Python\Miniconda\envs\py312\python.exe` 作为原生构建备用环境，备份旧演示库，重建并迁移 `data/local-demo.sqlite3`，复用现有 Seed 写入全表演示数据，验证管理员与权限后启动网站。登录账号为 `demo_admin`，本次随机密码保存在 `data/local-demo-login.txt`。

完成后普通 `start_windows.bat` 会继续读取 `.env` 中的演示数据库路径。该数据库和登录文件仅供本机开发验收，不得部署到生产环境。

## 后台内容路由

```text
/admin/profiles
/admin/research
/admin/publications
/admin/projects
/admin/patents
/admin/students
/admin/student-categories
/admin/news
/admin/courses
/admin/messages
```

每个可写模块支持概览列表、新建、查看和编辑。联系留言保留访客原始内容为只读，仅允许修改处理状态。

## 通用列表能力

- 服务端搜索、筛选、排序、分页和计数；
- 当前页最小字段投影，不在列表读取长正文；
- URL 保存查询状态；
- 分页尺寸 `10 / 20 / 50 / 100`；
- 当前页有界选择，单次最多 25 条；
- 每次批量只修改一个允许字段；
- 冲突后清除旧选择并刷新列表；
- 页面状态包括加载、空数据、错误、只读和无权限。

## 通用编辑能力

- 模块描述器驱动全部业务字段与编辑分组；
- 创建、查看和编辑三种状态；
- 必填、类型、枚举、长度、URL、邮箱、日期和媒体 key 校验；
- DOI、ORCID、日期先后和新闻关联 UID 等业务校验；
- PATCH 只提交实际变化字段；
- `updated_at` 乐观锁；
- 冲突错误持续显示并可加载最新版本；
- 字段错误自动定位到第一个无效控件；
- 未保存离开提醒；
- 保存后回到原列表筛选与分页位置。

## 权限与写入一致性

客户端只负责隐藏不可用按钮；最终安全判断在服务端完成。

所有内容操作按模块检查：

```text
view
create
edit
delete
export
```

创建、更新、批量更新或删除将业务数据、操作日志和缓存代次视为同一原子操作。批量请求还提交每条记录的 `updated_at`；任意一条过期时整批回滚。

## 数据库迁移

当前迁移链：

```text
0001_initial.sql
0002_auth_security.sql
0003_media_i18n_cache.sql
0004_public_content_indexes.sql
0005_public_interactions_and_demo_seed.sql
0006_admin_shell.sql
0007_admin_content_management.sql
0008_complete_admin_integrity.sql
0009_auth_management_integrity.sql
```

`0007` 增加后台批量事务守卫和核心管理列表索引；`0008`、`0009` 补充完整后台与账号权限完整性约束。不要修改已经应用的历史迁移。

## 示例数据

阶段 6 的全表示例数据和 20 个 PNG 演示媒体继续保留，可用于列表、筛选、分页和表单验证。普通 build、migrate 和 deploy 不会自动写入 Seed。

```bash
export CMS_DATABASE_PATH=data/demo-site.sqlite3
pnpm run db:migrate:sqlite
export CMS_DEMO_SEED_ACK=I_UNDERSTAND_THIS_IS_DEMO_ONLY
export CMS_DEMO_PASSWORD='自行提供符合安全策略的演示密码'
pnpm run db:seed:sample -- --database data/demo-site.sqlite3
```

不要对已有业务数据库执行演示导入。

## 离线验收

在未安装完整 Nuxt 依赖的环境中可以运行：

```bash
node scripts/verify-stage27.mjs
```

或在 pnpm 可用时：

```bash
pnpm run verify:stage27:offline
```

该门禁覆盖严格 TypeScript、SQLite/D1 协议合约、迁移、十个模块、乐观锁、批量原子性、审计、缓存失效、前后台隔离，以及阶段 1～6 和后台 Shell 的历史回归。

离线通过不等于真实浏览器、native `better-sqlite3` 或 workerd 已通过。

后台生产 HTTP 全量回归（自动创建并清理隔离数据库）：

```bash
pnpm run build:ubuntu
pnpm run test:production:http
```

完整后台回归结论和已知静态质量债务见 `docs/53_后台全量回归与最终缺口复核.md`。

## 完整发布门禁

在 Node 24.19.x、真实锁文件和完整依赖环境中执行：

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm run acceptance:stage27
```

首次成功安装后提交 pnpm 实际生成的 `pnpm-lock.yaml`；后续使用 `pnpm install --frozen-lockfile`。

## 文档与报告

- `docs/25_后台功能补全总规划.md`
- `docs/26_后台Shell与访问控制.md`
- `docs/27_后台通用列表筛选分页与批量选择.md`
- `docs/28_后台通用编辑表单与核心内容管理.md`
- `reports/stage27/review-cycles.md`
- `reports/stage27/validation.md`
- `reports/stage27/release-validation.json`

`docs/01–04` 保持原内容和只读权限。

<!-- COMPLETE_ADMIN_GUIDE -->
## 完整网站后台

后台入口：`/admin`。本版本包含以下可操作区域：

- 网站设置、全局设置、导航与按钮；
- 教师与团队、研究方向、论文、项目、专利与软件著作；
- 学生、学生分类显示、新闻动态、课程和联系留言；
- 媒体库、上传、回收站、恢复、使用位置和媒体选择器；
- 新闻结构化富文本；
- 翻译需求扫描、批量翻译、人工译文和历史值建议；
- DOI 与专利元数据辅助输入；
- 用户、角色、权限矩阵和 Session 撤销；
- 只读操作日志；
- 数据导出、加密备份、预检和原子恢复。

### 本地升级

停止开发服务器并备份当前项目目录，然后将交付包中的 `项目目录` 内容覆盖到项目根目录。交付包不包含 `.env`、SQLite 数据库或已上传媒体，因此不会主动覆盖本地运行数据。

本版本新增前端依赖和 `0008_complete_admin_integrity.sql`，覆盖后执行：

```bat
pnpm install
pnpm run db:migrate:sqlite
```

随后运行：

```bat
start_windows.bat
```

### 后台主要地址

```text
/admin
/admin/settings/site
/admin/settings/global
/admin/navigation
/admin/profiles
/admin/research
/admin/publications
/admin/projects
/admin/patents
/admin/students
/admin/student-categories
/admin/news
/admin/courses
/admin/messages
/admin/media
/admin/translation
/admin/auth
/admin/logs
/admin/import-export
```

### 完整后台离线检查

```bat
pnpm run test:complete-admin
pnpm run verify:complete-admin
```

Nuxt 生产构建、浏览器流程、原生 SQLite 和 Cloudflare workerd 验收仍应在安装完整依赖的目标环境中运行。
<!-- /COMPLETE_ADMIN_GUIDE -->

### 根地址的默认语言

`/` 按手动选择 → IP 地区 → 浏览器语言 → 默认英文进行临时跳转；明确的 `/zh`、`/en` 不被 IP 改写。默认值与配置方法、代理条件及验收结果见 [IP 默认语言说明](docs/18_IP默认语言与手动偏好验收.md)。运行参数示例位于 `.env.example`，生产环境需实际传入进程或 Worker。

## 站点地图与双语 SEO（第 5/7 步）

设置 `NUXT_PUBLIC_SITE_URL=https://实际站点域名` 并重启进程或更新 Worker 变量后，`/robots.txt` 自动声明 `/sitemap.xml`。地图动态列出中英文公开入口与可访问详情，排除草稿、未来发布、隐藏和需要登录的对象。首页、内容页共用 canonical/hreflang 逻辑。没有配置域名时页面仍可用，地图明确返回 503。

配置与验收见 [19_站点地图与双语SEO验收.md](docs/19_站点地图与双语SEO验收.md)。第 6/7 步已接通共享编辑生命周期。

## 共享后台编辑流程（第 6/7 步）

统一未保存确认、同页切换保护、保存/删除互斥和保存并返回；媒体及译文冲突后提供显式加载最新版本。详情见 [20_后台编辑生命周期统一与验收.md](docs/20_后台编辑生命周期统一与验收.md)。未新增依赖或数据库结构。本轮已执行至 7/7；最终回归证据、修复内容与尚未完成的视觉验收见 [21_全站回归与最终交付验收.md](docs/21_全站回归与最终交付验收.md)。

## 本轮交付（第 7/7 步）

媒体选择、预览、列表和编辑器共用最新请求保护；二进制上传复用保存接口的 CSRF 刷新；媒体数据类型集中在 `app/admin/media.ts`。字体入口仍是 `app/assets/admin/typography.css`，列表、标签与控件字号分别由 table、label、control 变量控制。

完整文件目录见 [07_项目目录规划与文件功能索引.md](docs/07_项目目录规划与文件功能索引.md)。`pnpm run lint` 仍有存量错误；本轮不能视为全门禁通过的生产发布，部署前请核对最终验收报告的未完成项。
