# Workers 初始地址与自定义域名切换

适用 v0.15.119，补丁 cloudflare-domain-step4。所有配置均在 deploy 内，业务代码与数据库结构保持不变。

## 一、先使用 workers.dev

Cloudflare Workers & Pages → 目标 Worker → Settings → Domains & Routes 查看默认地址。账号子域名是 `<worker>.<账号子域名>.workers.dev` 中间那一段，不是账号 ID。

Build Variables 保持 D1、R2、SKIP_DEPENDENCY_INSTALL 等原配置，域名任选一种填写方式：

| 方式 | 配置 |
| --- | --- |
| 沿用旧配置 | `TEACHER_ORIGIN=https://实际Worker.实际账号子域名.workers.dev` |
| 自动拼接 | 删除或清空 `TEACHER_ORIGIN`，设置 `TEACHER_WORKERS_SUBDOMAIN=实际账号子域名` |

自动拼接使用 `TEACHER_WORKER_NAME`，不会查询或猜测账号子域名。不需要改源码，不需要事先购买域名。`TEACHER_WORKERS_DEV` 默认 true；初始阶段不要关闭。

网页构建设置保持：根目录 `deploy/cloudflare`；构建命令 `python build.py check`；部署命令 `python build.py deploy`；分支 `web-py`。

## 二、改为自己的域名（推荐由构建配置管理）

1. 将域名所在 Zone 加入同一 Cloudflare 账号并激活。确认目标主机名没有冲突的 DNS/Worker 绑定；不要直接删除不属于本站的记录。
2. 设置构建变量 `TEACHER_CUSTOM_DOMAIN=faculty.your-real-domain.com`，只填写域名，不带 https、斜杠、通配符。国际域名使用 punycode。
3. 删除或清空旧 `TEACHER_ORIGIN`，脚本自动得到 `https://faculty.your-real-domain.com`。也可显式填写相同新地址；若两者不一致会停止，避免只改绑定却漏改登录地址。
4. 可设 `TEACHER_WORKERS_DEV=false` 关闭默认入口；默认 true 仍会保留平台入口，但业务系统仅接受新的主地址，旧地址并不会自动成为可登录别名，也不会自动重定向。
5. 重新部署。生成的 Wrangler 配置包含 `routes: [{pattern: 新域名, custom_domain: true}]`，由 Cloudflare 建立 Custom Domain。构建凭据需有管理该域名所需的账号/Zone 权限；D1、R2 权限仍需保留。
6. 在控制台确认域名/证书已就绪，再访问新域名检查首页、登录、媒体、快传和 `/robots.txt`、`/sitemap.xml`。

该模式声明一个由脚本管理的自定义域名。若已有多个 Custom Domains/复杂 Routes，请先核对 Wrangler 提示及路由清单，不要直接套用单域名配置覆盖多站路由。

## 三、仅通过网页绑定域名

也可在 Worker → Settings → Domains & Routes → Add → Custom Domain 添加域名。此时保持 `TEACHER_CUSTOM_DOMAIN` 未设置；把构建变量 `TEACHER_ORIGIN` 改为新 HTTPS 地址后重新部署。

绑定域名和修改应用主地址是两件事，必须一致。不要只改 Worker 运行时变量却不改构建变量：下次 Git 构建仍会使用构建变量，可能恢复旧地址。`workers.dev` 开关同理，设置 `TEACHER_WORKERS_DEV` 才能在后续部署中保持选择。

## 四、切换的影响与验收

- 数据库、管理员账号和 R2 文件保留，地址切换不会重新初始化已有数据库。
- 登录 Cookie 限当前主机，新域名需要重新登录，这是正常行为；无需重建管理员。
- robots 与 sitemap 复用原 `r.config.origin`，随新主地址生成绝对链接。媒体路径仍复用现有相对地址与存储方法。
- 数据库正文、导航或第三方服务中手工填写的旧绝对链接不会批量替换，需在后台逐项核对；外部 OAuth/API 回调、书签、分享链接也应同步检查。
- 初始域名与自定义域名不同时登录，不开放任意 Host/Origin；保留现有 CSRF 同源校验。
- R2 无需公开桶、无需 chmod；D1 表结构与目录前缀不因域名改变。
- `/setup` 仅用于尚未建立管理员的新站。改域名后不要再次设置初始化密钥来重建账号。

回到默认域名：清空 `TEACHER_CUSTOM_DOMAIN`，设置默认地址对应的 `TEACHER_ORIGIN`（或账号子域名），将 `TEACHER_WORKERS_DEV=true` 后部署。旧自定义域名是否解绑请在控制台明确核对；本脚本不删除你的 Zone 或 DNS 记录。

官方参考：
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
