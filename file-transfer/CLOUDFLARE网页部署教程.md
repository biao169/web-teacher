# 文件快传：Cloudflare 网页部署教程

本工具可单独部署，无需教师网站、Ubuntu 服务器或本地 Node 服务。使用 Cloudflare **Workers + Static Assets + Durable Objects（SQLite）+ 私有 R2**。不需要 D1；账号、规则、个人额度和云端账本由同一个 Durable Object 维护，避免跨数据库扣减不一致。

前台 `/zh/transfer`、英文 `/en/transfer`，发送与接收在同页切换；后台 `/transfer-admin/`。独立账号与教师账号不自动互通。教师网站原有本机集成方式仍可使用；此教程部署的是独立实例。

## 一、准备源码仓库和存储桶

1. 把源码上传到自己的 GitHub 或 GitLab 仓库。独立包可直接作为仓库根目录；整套教师源码中的工具放在 `file-transfer/`。
2. 选择要部署的分支，默认 `main`，也可以是 `release` 等其他分支。确保分支中有 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`wrangler.jsonc`、`cloudflare/`、`standalone/` 等目录。不要上传 `storage/data/`、`.dev.vars`、`.wrangler/`、密码或已有数据库。
3. 登录 Cloudflare 控制台 → R2 Object Storage → 创建存储桶，名称 `file-transfer-files`。保持私有：不启用公开访问，不配置公开自定义域名。若更换桶名，在 Git 网页编辑 `wrangler.jsonc` 的 `r2_buckets[0].bucket_name`。
4. 确认账户已开通 R2 和 Durable Objects 所需能力。不同套餐有资源上限和计费规则，按控制台当前说明选择。不要把 R2 无出口费理解为整个工具无费用。

## 二、通过网页连接 Git 并部署 Worker

Cloudflare 控制台 → Workers & Pages → 创建应用 → 导入/连接 Git 仓库，选择 **Worker**。页面名称可能随控制台版本略有变化。不要选择“上传静态文件”或仅部署 Pages：那样只有页面，没有账号、配对和文件暂存服务。

填写：

| 配置 | 值 |
|---|---|
| Worker 名称 | `file-transfer`（与 `wrangler.jsonc` 中 name 一致） |
| 生产分支 | 你的分支，默认 `main` |
| 根目录 | 独立仓库为 `/`；整套仓库为 `file-transfer` |
| 构建命令 | `pnpm install --frozen-lockfile && pnpm build` |
| 部署命令 | `pnpm exec wrangler deploy` |
| 构建环境变量 `NODE_VERSION` | `24.19.0` |
| 构建环境变量 `PNPM_VERSION` | `11.19.0` |

保存并部署。Wrangler 配置会创建名为 `TransferState` 的 SQLite Durable Object 类，绑定 `FT_STATE`；将私有桶绑定为 `FT_FILES`；将构建后的页面绑定为 `ASSETS`。无需在网页中手写 Worker 代码。

若显示 R2 桶不存在，检查桶名和当前 Cloudflare 账户；若名称不匹配，统一 Worker 名与配置文件。分支修改后，在构建设置中选择新的生产分支。建议关闭非生产分支的自动部署；测试实例应使用独立 Worker 名和独立 R2 桶，不能共用生产暂存桶。

## 三、初始化高级管理账号

1. Worker → Settings → Variables and Secrets，添加 **Secret**：`FT_SETUP_TOKEN`，值为自己生成并妥善保存的一段随机长字符串（建议至少 32 个随机字符）。这属于运行时 Secret，不是普通构建变量。
2. 保存并部署这一配置，打开 `https://你的Worker域名/setup`。
3. 输入初始化令牌、管理员名称和密码（至少 6 位），点击“创建并登录”。数据库为空时只允许创建一个首任管理员；初始化接口不会覆盖已有账号。
4. 完成后在 Cloudflare 中删除 `FT_SETUP_TOKEN` 并重新部署。账号保留在 Durable Object 数据库中，不会因删除令牌而消失。
5. 后台的“独立账号”区可以添加成员或其他管理员、禁用其他账号。`member` 和 `admin` 是角色 ID；账号 UID 可用于个人覆盖规则。管理权限与传输权限分别控制。

生产环境不要设置 `FT_LOCAL_TEST`；它只供本地隔离测试使用。Cookie 在生产采用 Secure、HttpOnly 和 SameSite=Strict；写操作同时核验来源，登录后核验 CSRF。

## 四、开放传输

新实例默认关闭传输和匿名权限，不会部署成功就自动消耗流量。

1. 在“开放与说明”中开放传输。
2. 配置“使用权限”：允许哪些成员发送、接收，允许使用哪些链路；按需设置角色、个人或匿名规则和共同匿名额度。
3. 局域网直连：填写真实网段并核验文件路由。可保持不限速，也可设置全局、角色或个人限速。不能验证候选地址时会停止，不会静默转中继。
4. 中继与临时分享：开启对应开关。必须核验**包括用户访问 Cloudflare 在内的完整文件链路**是否经过受限 VPN，再设置服务器链路确认。若经过受限 VPN，Cloudflare 版无法读取 VPN 网卡或运营商账单，不能提供 VPN 总流量硬保护；保持相关链路关闭，或改用支持服务器统计的 Node 部署。
5. 临时分享设置保存时间、领取次数和空间上限。R2 中保存分块文件对象和目录清单，下载恢复目录结构；浏览器不支持目录写入时沿用 ZIP 下载。
6. 云端应用流量保护默认开启：UTC 每日 1 GiB、每月 10 GiB。按申请的传输窗口保守计入上传＋下载，包含协议开销，失败不退还。剩余额度低于 256 KiB 安全余量时，界面提前显示限制说明并禁止新建相关链路；传输中的下一窗口也必须符合剩余额度。局域网直连不扣此额度。

云端应用额度不统计网页访问、信令、恶意请求、R2 操作次数或用户 VPN 总量，也不是 Cloudflare 账单硬封顶。请另外在 Cloudflare 配置用量通知并查看 Workers、Durable Objects、R2 账单。若网页本身通过 VPN 访问，局域网文件直连也不意味着全部网页流量为零。

## 五、域名、更新和恢复

- Worker → Settings → Domains & Routes，添加自定义域名；也可使用提供的 `workers.dev` HTTPS 地址。
- 在生产分支提交源码后自动构建部署。保留 Worker 名、Durable Object 类名、迁移记录和 R2 桶绑定；否则可能出现全新数据库或不可见的原有文件。
- 不要删除 `migrations` 中已部署的 `v1`。后续数据库升级应追加迁移，不能用重新建类替代更新。
- 普通前端更新不清除数据；部署重启可能断开正在传输的 WebSocket。客户端依照既有检查点机制重新配对/恢复，发送方需要保留源文件。
- 数据库恢复使用 Cloudflare Durable Object 的 SQLite 恢复功能；R2 对象需要单独备份。只回滚 Worker 代码不会回滚 R2 对象或数据。恢复前停止传输，确保数据库与对象来自相容时间点。
- 暂存到期会立即拒绝领取；小时级 Alarm 清理，每次最多 20 项，并可在后台手动继续清理。即使没有访问也有清理 Alarm。R2 存储可被平台和有权限的运维访问，不是端到端加密暂存。

## 六、容量边界与验收

该版本定位小团队：单个协调对象，同一实例最多 16 个 WebSocket 客户端；双人任务通常占两个连接。R2 写入缓冲约 4 MiB 分块（最多再加一个协议帧），不会一次把整个大文件放入内存。大文件转发仍经过 Worker/DO，受平台执行、连接和套餐额度限制。

当前复用标准 WebSocket 与现有中继协议，**未启用 WebSocket Hibernation**；活跃连接和定时检查可能产生 DO 持续运行费用。最后一个连接关闭后，空闲约 60 秒会关闭配对轮询，数据库与定时清理继续保留。不是 TURN 服务器，不提供“任意网络一定能直连”的保证。需要大规模公共传输时，应另行拆分房间协调对象和上传通道。

完成部署后分别测试：两个不同账号中继小文件；上传大于 4 MiB 的文件并稍后领取；含中文目录、空文件和空目录的文件夹；撤销分享；把云端日额度临时调小，确认提示和禁用；恢复额度后继续。真正的局域网/VPN 路由需要在自己的网络验收。

## 官方说明

- [Workers Git 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Workers 构建分支](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Durable Objects SQLite 存储](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [WebSocket 与休眠](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- [R2 创建桶](https://developers.cloudflare.com/r2/buckets/create-buckets/)
- [Cloudflare 产品定价](https://developers.cloudflare.com/workers/platform/pricing/)
