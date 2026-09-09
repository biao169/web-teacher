# 共用协议 v1

实现：`shared/contracts.mjs`（运行时常量、状态与字节数校验）；`shared/protocol.d.ts`（后续业务类型）。
当前基础服务、身份桥接与工具管理授权接口已实现。局域网准入、个人授权额度和 VPN 估算预算引擎已实现；已核验 WAN、服务器中继与临时分享也已接入。
后续业务入口必须同时实现服务端校验、存储、失败处理及测试后才能开放。

## 身份和权限

前台使用教师已验证会话，工具端接收短时、限受众的授权；不接受浏览器自报 UID、角色或管理标记。
`VerifiedIdentity` 约定签发方、受众、主体、角色、权限、签发/过期时间、令牌 ID 和会话版本。
权限为 `transfer.send`、`transfer.receive`、`transfer.manage`。匿名有独立身份和规则，不能继承已登录者设置。
第 2 步已实现每请求的 Ed25519 签名授权、路径/方法绑定、30 秒期限、一次性 nonce、最新教师会话复核及首个管理员本机授权。实际客户端响应类型见 `shared/client.ts`，桥接字段和校验见 `server/bridge-token.mjs`。第 3 步增加 GET/PUT 配置接口、浏览器同源与 CSRF 防护、签名正文摘要绑定及版本冲突保护。详见 `docs/settings.md`。
管理员以工具明确授予权限为准，不把教师后台任意“查看”权限或角色等级自动转换为工具管理员。

当前配置按单角色教师账号匹配：个人完整规则 → 角色完整规则 → 登录用户默认，匿名单独匹配。`rules` 前两项固定为匿名和登录用户；覆盖项使用教师用户／角色 UID，不使用角色名称。每条规则完整替代使用权限，两个速率字段留空时继承全局默认。闭合链路、工具总开关与 VPN 预算是独立限制，不能被个人规则绕过。
局域网默认速率 `null`（不限速），可按全局、角色或用户设置。当前公开响应只含当前身份的预设规则，不含其他用户、角色或管理账号；第 5 步已执行局域网方向/任务大小/并发准入与客户端节流，第 6 步已接入个人授权额度、匿名共享上限和任务限速，第 7 步已接入采样出口量与独立预算。`shared/protocol.d.ts` 是早期业务设计草案；当前运行配置以 `shared/settings.mjs` 和 `shared/client.ts` 为准，多角色合并等尚未实现。

## 链路与 VPN 计费

传输方式：`lan-direct`、`wan-direct`、`server-relay`、`temporary-share`。
另记录出口判断：`confirmed-outside-vpn`、`confirmed-vpn`、`unknown`。
直连和非计费是不同概念；VPN 可能承载 P2P，不能仅按 WebRTC、同公网 IP 或局域网地址排除计费。
严格模式下出口不明或计量不可用，受影响链路禁止使用。
只有经确认绕开受限出口的可用链路才可继续；不暗中退回受限中继。

## 数量和速率

字节值通过 JSON 使用十进制字符串，范围 `0..9223372036854775807`，防止大整数精度丢失。
个人字节限值 `null` 表示不限，`"0"` 表示不允许；VPN 日/月额度 `null` 表示未配置，不能当成无限额度。当前配置速率使用 Kbit/s（1000 bit/s），局域网传输器转换为 bytes/s，不与日/月累计流量混用。
GB = 1,000,000,000 字节；GiB = 1,073,741,824 字节。VPN 管理字段可切换 GB／GiB，显示分别最多 9／30 位小数，切换不改变字节值；输入不足一个字节部分向下取整。个人与临时文件字段继续使用 GB。
账本区分用户有效载荷、服务器入口/出口流量、VPN 实际计费量和已预留预算。
失败重试和多次领取可能继续消耗网络流量，不按成功文件大小推断 VPN 消耗。

VPN 预算约定日/月上限、IANA 时区、计费方向、余量、预警阈值、计数源及断流能力。
本版读取接口计数或本地账单快照，未核验时显示“待核验”。`server/vpn-budget.mjs` 实现 SQLite 原子预算，`server/metered-copy.mjs` 提供内部有界字节复制适配器，`server/traffic-gate.mjs` 将预算接入中继／暂存；文件经过已有鉴权 WebSocket 的有界封装，不开放裸上传／下载或 TURN 凭证接口。
预留合计入口／出口上限 1 MiB、最长 2 秒，同时受统计过期与日/月边界限制。每块读前预扣，传输中复核并通过 AbortSignal 终止协作 I/O。取消只释放未发出部分；已发出量保留待管理员核对，详见 `vpn-budget.md`。预留令牌只保存哈希、绑定当前配置版本，不能跨配置或过期后复用。
只有实时受控出口断流与安全余量配合才能作硬上限；手工录入、周期采样只算估算模式。
客户端 P2P 限速属于协作执行，修改客户端可绕过；需要硬限速时使用受控出口并记录流量。

## 文件与任务

`ManifestEntry` 预留文件/目录、相对路径、字节大小及时间戳；空文件大小为 `"0"`。
第 4 步已实现路径校验、文件采集、本机预览和流式保存，具体契约见 `shared/files.ts`、`shared/manifest.mjs` 和 `docs/files.md`。第 5 步已接入配对与数据通道，第 9 步已接入检查点和续传。
目录下载需要浏览器能力；不支持时以保留相对结构的 ZIP 兼容，不承诺任意大文件内存打包。
用户侧发送／接收切换保留任务；语言切换不重复创建传输。

## 错误与可用性

基础 API 统一 JSON。无文件或身份内容进入公共缓存。
`FT_NOT_IMPLEMENTED` 对应尚未开放，不能解释为“已用完额度”。
实际个人、匿名和 VPN 错误码见以下现行契约。响应显示受影响链路、原因和账期重置时间；没有可推断的故障恢复时间时不编造时间。

第 5 步现行配对契约见 `shared/lan.mjs`、`server/pairing.mjs` 和 `docs/lan-transfer.md`。未知路径使用 `FT_ROUTE_UNKNOWN`，地址隐藏使用 `FT_LAN_ADDRESS_HIDDEN`，个人额度不足分别使用 `FT_QUOTA_DAILY` / `FT_QUOTA_MONTHLY`；匿名共享上限为 `FT_GUEST_POOL_DAILY` / `FT_GUEST_POOL_MONTHLY` / `FT_GUEST_POOL_CONCURRENCY`。实际字段和口径见 `access-allowance.md`。

## 第 7 步出口管理接口

- `GET /transfer-api/v1/admin/vpn`：管理员统计、配置版本、计数源及最近审计。
- `PUT /transfer-api/v1/admin/vpn/calibrate`：`{revision,dailyBytes,monthlyBytes}`，本机接口初始校准／计数器重置后恢复。
- `PUT /transfer-api/v1/admin/vpn/reconcile`：`{revision,observedAt,confirm:true}`，最新统计核对完成任务后的预留。
- `GET /transfer-api/v1/session` 的 `policy.vpn`：公开汇总，不含接口名称、源 ID、原始计数与审计操作者。

两个写接口沿用教师实时会话、工具明确授权、同源、CSRF、正文签名绑定和事务内版本检查。实际错误见 `shared/vpn.mjs`；`FT_VPN_DAILY`／`FT_VPN_MONTHLY` 为预算不足，`FT_METER_*` 为采集／核验异常，`FT_VPN_HARD_GATE_REQUIRED` 表示严格模式缺少硬限额。本版 `hardLimitAvailable:false` 固定为真实能力声明。

## 第 8 步传输与暂存接口

票据请求增加 `transport`，省略时保留 LAN 兼容；票据续期必须保持身份、角色、方式和当前配置版本。在线接收码在同一种方式内配对。WebSocket 新增 `relay`、`share-create`、`share-info`、`share-claim`、`share-data` 等消息；中继／暂存使用 `shared/wire.mjs` 和 `server/pull-guard.mjs` 的有界连续拉取协议，清单最多 256 KiB。

- `PUT /transfer-api/v1/share-action`：`{id}`，发送者本人撤销分享；沿用 CSRF 和当前身份复核。
- `GET /transfer-api/v1/admin/shares`：工具管理者读取最近分享和空间统计，不包含领取凭据、散列、服务器目录或所有者身份。
- `PUT /transfer-api/v1/admin/shares/action`：`{action:'revoke',id}` 或 `{action:'cleanup'}`，管理权限及 CSRF 校验。

`capabilities` 如实区分互联网直连、受控中继、临时分享和硬出口限制。`policy.links[].accessReasons` 以当前选择的方式和方向给出原因，不用 LAN 禁用原因覆盖可用中继。错误与配置见 `shared/network.mjs`，行为、隐私、迁移见 [广域网与临时分享](network-sharing.md)。

## 第 9 步恢复协议

获准连接时返回身份独立的 `recovery` 信息：任务、43 字符恢复凭据、原方式、统计、期限、检查点和恢复配置。新增 WebSocket 控制消息 `checkpoint`、`pause`、`resume-info`、`resume-attach`、`resume-discard`；文件仍使用原有单个待响应的拉取协议。每次恢复取得新教师会话票据，并匹配原身份、角色方向、方式及配置版本。

检查点是固定字段的 `{fileIndex,offset,bytes,chain,root,chunkBytes}`。只在校验和磁盘提交后请求服务端确认；中继／暂存对照服务端已验证帧状态。接收新清单仍验证原摘要，文件读取从已确认偏移继续，完成摘要链必须一致。检查点摘要不代表底层 VPN 路由证明。

任务恢复沿用原授权记录；后台配置变化、权限撤销、过期或取消不能凭恢复令牌绕过。具体兼容限制、磁盘写入、个人／VPN 口径和本机记录说明见 [续传与任务恢复](recovery.md)。
