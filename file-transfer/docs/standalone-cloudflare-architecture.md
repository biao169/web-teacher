# 独立运行与 Cloudflare 运行说明

## 入口和职责

| 路径 | 职责 |
|---|---|
| `scripts/standalone.mjs` | Node HTTP/静态资源/WebSocket、运行锁、VPN 采集器 |
| `standalone/` | Vite 独立页面壳、路由与登录；复用 `web/` 的传输与后台组件 |
| `server/portable-http.mjs` | 独立版通用 API、来源和 CSRF 验证、权限分派 |
| `server/accounts.mjs` | 本地账号、初始化、会话、登录频率控制 |
| `server/storage-core.mjs` | 共用规则、权限、个人额度、恢复与 VPN 账本 |
| `server/pairing-core.mjs` | 共用配对状态机；Node `ws` 和 Cloudflare WebSocket 适配 |
| `cloudflare/worker.mjs` | Workers 静态资源、Durable Object、WebSocket 和清理 Alarm |
| `cloudflare/storage.mjs` | DO SQLite 适配、同步事务、云端日/月额度 |
| `cloudflare/r2-shares.mjs` | 私有 R2 分块写入、读取、检查点、撤销和清理 |
| `integration/teacher-site/` | 原有教师集成；独立版不依赖此目录 |

Node 版账号表与传输账本存放于同一个 SQLite 数据库。Cloudflare 版使用 DO SQLite；同步扣减通过 `transactionSync` 执行，多步失败整体回滚。异步 R2 写入完成后登记分块元数据，再提交恢复检查点；数据库事务不跨网络请求。

R2 对象使用服务生成的 UUID 和分块偏移命名，不以用户文件路径作为对象键；用户目录结构只保存在经校验的清单中。单次上传缓冲约 4 MiB，超过分块阈值后落盘，不在内存拼接整个文件。恢复前校验已完成的前缀，清理跳过在写入中的任务。部分失败对象仍归属分享前缀，分享清理时一起删除。

云端额度按 UTC 日/月保存于 `cloud_usage`，对发出的传输窗口保守扣减，重传再次计入，不退还已发出窗口。窗口是应用层数据上限，不能计量攻击者发来的所有无效流量或平台账单。

## 新增账号与云端数据表

| 表 | 字段/用途 |
|---|---|
| `local_accounts` | `uid` 主键、`name` 唯一账号名、`salt` 随机盐、`password` PBKDF2-SHA256 摘要、`role`、`disabled` |
| `local_sessions` | `token` 会话令牌 SHA-256、`uid`、`csrf`、`expires`；有效期 24 小时，新登录替换该账号旧会话 |
| `local_attempts` | `key`、`count`、`until`；15 分钟登录/初始化尝试窗口，过期清理 |
| `r2_parts` | `share`、`file`、`start` 联合主键，`size`、`key`；只在 Cloudflare 中使用 |
| `cloud_usage` | `period` UTC 日/月主键、`bytes` 十进制字符串；只在 Cloudflare 中使用 |

原有 `tool_settings`、`admin_grants`、`temporary_shares`、个人额度、VPN 账本和恢复表继续使用。Node 原有 schema 8 数据无需清空；新增账号表采用幂等创建。Cloudflare 是独立部署数据库，不自动搬迁教师账号或本机暂存文件。

## 身份与浏览器边界

初始化令牌只用于空账号库；首任管理员与授权在同一个事务创建。密码最少 6 位，以随机盐和 PBKDF2-SHA256 100000 轮保存；不保存明文密码。Cookie 采用 HttpOnly/SameSite=Strict，公网要求 HTTPS/Secure。写 API 必须同源，登录后还需匹配 CSRF。退出或禁用账号会使现有快传授权在下一次校验中失效。

独立页面使用自己的账号。原有教师桥接服务 `pnpm start` 不改为独立认证；`pnpm start:standalone` 与之是不同启动模式，不能并发使用同一个目录。

## 可用性边界

Cloudflare 为单个协调对象的小团队模式，最多 16 个 WebSocket 客户端；标准 WebSocket 不提供 Hibernation。无客户端后约 60 秒停用配对轮询，小时级 Alarm 保留清理。平台重启后依靠持久检查点恢复，需要客户端重新连接。未实现 TURN 服务。

应用账本不等于 VPN 账单或 Cloudflare 总费用。Cloudflare 无法读取用户网卡；未知/未经核验的受限 VPN 路由继续拒绝放行。默认关闭传输、匿名权限及中继/暂存链路，需管理员按真实网络配置。
