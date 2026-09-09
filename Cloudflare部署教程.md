# Cloudflare 部署教程：教师网站

本教程基于本包的 `academic-cms/wrangler.jsonc`、`build:cloudflare`、D1 迁移脚本和现有管理员初始化界面。下列操作会创建/更新你的 Cloudflare 资源，需要在你自己的账号执行。本次只提供教程，没有替你创建或发布远程服务。

## 1. 先选择部署方式

| 需求 | 本包支持的方式 |
| --- | --- |
| 仅教师网站使用 Cloudflare 托管 | Workers 执行 Nuxt，D1 保存数据库，R2 保存媒体 |
| 教师＋快传，共用导航和登录 | Ubuntu/Debian 同机运行，见根目录 `Ubuntu-Debian部署说明.md` |
| 上述同机网站使用 Cloudflare 域名/代理 | Cloudflare 作为入口，应用仍在服务器运行；不迁成 Workers |

当前快传使用常驻 Node 服务、`node:sqlite`、本机临时文件和签名私钥，不能把整个 `file-transfer` 上传到 Workers 就运行。本包没有提供“教师在 Workers、快传在另一台服务器”的可直接上线身份桥适配；不要把 `serviceOrigin` 简单改成公网地址当成已经支持。以下所有 Workers 构建均关闭快传模块。

## 2. 本地准备与获取任意分支

在有 Node >=24.19.0 <25 和 pnpm 11.19.0 的开发电脑执行。下面 Shell 环境命令适用于 Linux/macOS/WSL；Windows PowerShell 的环境变量写法在第5节列出。

```bash
git clone --single-branch --branch web-vue https://github.com/biao169/web-teacher.git academic-suite
cd academic-suite/academic-cms
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler whoami
```

`web-vue` 可替换为实际分支，如 `release/cloudflare`。本机无需运行 Ubuntu 的 Tweb，也不要在 Workers 中使用 systemd、SQLite 本机路径或 Python 开发服务器。没有浏览器的 CI 环境可配置自己账号的 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`，按 D1/R2/Workers 资源所需权限授权，不要提交凭据到 Git。

## 3. 创建数据库和媒体桶

```bash
pnpm exec wrangler d1 create academic-cms
pnpm exec wrangler r2 bucket create academic-cms-media
```

把返回的真实 D1 ID 填入 `wrangler.jsonc` 的 `d1_databases[0].database_id`，替换全零占位值。保持绑定名 **DB** 和 **MEDIA** 与代码一致。若修改数据库或桶名称，配置及后续命令同步修改。R2 如提示未启用，请先在控制台启用相应服务。创建与绑定流程参见 [D1命令文档](https://developers.cloudflare.com/d1/wrangler-commands/) 与 [R2创建桶文档](https://developers.cloudflare.com/r2/buckets/create-buckets/)。

使用现有数据库时不要重复创建、不要导入示例库，先确认账号、资源ID和备份。默认不把整个 R2 桶设为公开，媒体通过网站的权限/授权路由提供。

## 4. 设置环境与独立密钥

在 `wrangler.jsonc` 顶层增加 `vars`，保留原有 DB、MEDIA、ASSETS 等配置（本项目脚本使用 JSON.parse，因此请保持严格 JSON，不加注释/尾逗号）：

```json
"vars": {
  "NUXT_AUTH_TRUSTED_ORIGINS": "https://lab.example.com",
  "NUXT_AUTH_SECURE_COOKIES": "true",
  "NUXT_PUBLIC_SITE_URL": "https://lab.example.com",
  "NUXT_CACHE_ORIGIN": "https://lab.example.com"
}
```

使用 workers.dev 域名也可以，先从控制台确认实际 HTTPS 地址，并把上述四项统一成该地址。若切换到自定义域名，更新四项后重新部署。不要设置 HTTP 源地址或 `secureCookies=false` 用来“绕过”生产检查。

分别执行三次下面的生成命令，每次得到一个不同随机值，私下保存：

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

使用 Wrangler 交互录入对应值，不把真实值写进 `vars` 或命令历史：

```bash
pnpm exec wrangler secret put NUXT_AUTH_SECRET
pnpm exec wrangler secret put NUXT_MEDIA_GRANT_SECRET
pnpm exec wrangler secret put NUXT_AUTH_BOOTSTRAP_TOKEN
```

首次 Worker 尚不存在时，按 Wrangler 提示建立对应名称的 Worker；命令使用当前 `wrangler.jsonc` 的名称。部署完成后保留会话/媒体密钥，bootstrap token 仅初始化期间使用。密钥管理参见 [Cloudflare Secrets 文档](https://developers.cloudflare.com/workers/configuration/secrets/)。

## 5. 初始化数据库、构建并发布

先检查远程迁移，再应用；`--confirm-database` 必须与配置中的数据库名完全一致：

```bash
node scripts/db/d1.mjs --remote --confirm-database academic-cms --list
node scripts/db/d1.mjs --remote --confirm-database academic-cms
```

Windows 下若 Node 脚本调用 `pnpm.cmd` 出现启动错误，可直接运行锁定依赖中的 Wrangler 命令（先自行核对配置中的远程数据库ID）：

```powershell
pnpm exec wrangler d1 migrations list academic-cms --remote --config wrangler.jsonc
pnpm exec wrangler d1 migrations apply academic-cms --remote --config wrangler.jsonc
```

这些命令创建正式表结构，不自动填写演示教师、论文或账号。不要运行 `db:seed:sample` 或 Windows 示例初始化脚本去操作正式 D1。

Linux/macOS/WSL：

```bash
export FT_TEACHER_MODULE_ENABLED=false
pnpm run build:cloudflare
pnpm run deploy:cloudflare
```

PowerShell：

```powershell
$env:FT_TEACHER_MODULE_ENABLED = 'false'
pnpm run build:cloudflare
pnpm run deploy:cloudflare
```

配置变更必须在构建前完成；本项目启动/部署脚本会检查源码与构建是否一致。不要拿 Ubuntu 的 `.output` 发布到 Workers，也不要改完配置后沿用旧构建。

## 6. 创建首位高级管理员

先访问刚发布的 HTTPS 网站的 **`/zh/setup`**（英文为 `/en/setup`）。这是当前源码实际提供的“初始化管理员”页面。在表单中输入：

- 第4节保存的 `NUXT_AUTH_BOOTSTRAP_TOKEN`；
- 自定义管理员用户名、至少6位密码并再次确认；显示名称、邮箱是当前页面必填项。

提交后由网站现有 bootstrap 接口在 **D1** 中创建首位系统管理员并授予全模块权限。它不是普通注册用户；不要通过普通注册来代替高级管理员初始化。已存在管理员的数据库会拒绝重复初始化，不覆盖原密码。

成功后立即移除一次性 token：

```bash
pnpm exec wrangler secret delete NUXT_AUTH_BOOTSTRAP_TOKEN
```

然后刷新登录，以刚创建的账号访问 `/admin` 设置网站资料、导航、教师、媒体和权限。不要执行 `auth:bootstrap:sqlite`：那个命令只操作本地 SQLite，不能初始化远程 D1。Tweb 的终端交互初始化只适用于 Ubuntu/Debian 部署，Cloudflare 使用上述现有网页表单。

若页面未出现初始化入口，核对 `NUXT_AUTH_BOOTSTRAP_TOKEN` 是否设置、是否已有管理员、HTTPS地址是否在可信来源中，并查看 `pnpm exec wrangler tail` 的错误；不要临时开放无鉴权写库接口。

## 7. 域名、更新与验收

在 Cloudflare 控制台给 Worker 绑定自定义域名，确保域名与 vars 中的源地址一致。静态资源沿用 `ASSETS` 绑定。数据库和 R2 配置要保持稳定，更新源码不等于重建资源。

更新前用 D1 导出命令备份数据，再检查/执行新迁移、重新构建和发布：

```bash
pnpm exec wrangler d1 export academic-cms --remote --output before-update.sql
```

备份文件包含网站数据，保存在 Git 目录之外或明确忽略，妥善保护；R2 媒体另行备份。旧 Worker 代码与新数据库可能不兼容，不能只回滚代码就认定完成恢复。数据库管理命令及迁移含义见 [D1官方命令文档](https://developers.cloudflare.com/d1/wrangler-commands/)。

验收首页中英文、登录/退出、高级管理员权限、媒体上传/查看、富文本、列表筛选、留言及缓存；确认没有快传入口，没有误连接旧 D1。`/health` 返回正常不代表所有数据库与媒体功能均正常。教程依据源码与官方文档核对，本次未实际发布你的 Cloudflare 账号，需在目标账号完成验证。
