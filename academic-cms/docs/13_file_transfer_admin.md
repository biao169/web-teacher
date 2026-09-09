# 文件快传管理与控制项

## 一个页面统一管理

管理入口为 `/transfer-admin/`，从教师后台侧栏进入，使用当前教师登录身份并检查工具管理员授权。页面集中维护开放说明、链路、规则、个人额度、VPN 预算、临时文件和恢复记录。

修改先进入当前页面草稿，统一保存才生效。保存时检查配置版本；发生冲突可保留草稿，明确读取最新配置后再调整。恢复默认只修改草稿，不会立即写入。未保存配置时部分校准或清理操作不可用，避免以旧规则执行维护。

教师后台账号与工具管理员名单独立，管理员权限本身不自动授予文件发送和接收权限。

## 匿名、角色和用户规则

规则匹配顺序为指定用户、所属角色、登录默认；匿名使用匿名规则。命中的规则完整替代对应默认权限，不是把多条允许项累加。匿名默认不允许发送和接收。

| 规则项 | 含义 |
| --- | --- |
| `kind`、`id` | 匿名、登录默认、角色或用户，以及适用标识 |
| `send`、`receive` | 分别允许发送和接收 |
| `links` | 允许 LAN 直连、WAN 直连、中继、临时分享中的哪些方式 |
| `lanRateKbps`、`wanRateKbps` | 局域网及其他链路速率；规则留空继承全局，显式值使用规则值 |
| `maxFileBytes`、`maxTaskBytes` | 单文件及单任务大小上限 |
| `dailyBytes`、`monthlyBytes` | 个人授权任务每日、每月总量 |
| `maxFiles` | 每任务文件数量上限 |
| `concurrency` | 同时活动任务数 |

总量留空表示不限制，零总量禁止新任务；速率必须为正数或留空。双方匹配到的规则与本次主动降速共同决定实际速率。所有匿名访客还可共用一个日/月总量和并发池，用于限制反复创建匿名身份的合计使用量。

个人额度计量按授权任务大小，VPN 预算按出口观测和保守预留，二者不能互相代替。细则见 [12_file_transfer_usage.md](12_file_transfer_usage.md)。

## 局域网与公网路径

LAN 需要配置实际私有 IPv4 网段并核验网段之间文件路由不经过受限 VPN；网络改变后重新核验。全局 LAN 速率留空时不限速。

WAN 直连需要允许的公网 IPv4 范围、真实绕行核验及可用连接；可配置 STUN。服务器链路另分未知、确认经过 VPN、确认绕开 VPN，核验范围包括教师代理与独立服务之间的实际文件路径。

启用某种链路只表示允许尝试，不会跳过身份权限、路径、容量和 VPN 条件检查。路径未知时当前策略阻止相关链路。

## VPN 预算与保护

可以设置日限额、月限额、安全余量、预警比例、计费方向、时区和 GB/GiB 单位。统计源包括本机接口或本地账单快照；接口采集支持适用的 Linux/Windows 环境。来源需核验覆盖实际受限流量，过期或不可信的统计不能当作足够预算。

| 状态或模式 | 行为 |
| --- | --- |
| 严格保护 | 当前没有可核验的运营商出口硬限额能力，因此受计费链路禁用 |
| 估算保护 | 结合观测、任务预留、待对账量和开销余量控制受管理的中继/临时分享预算窗口 |
| 余额不足或统计过期 | 显示限制原因，禁用相关链路或停止继续发放预算 |
| 未知网络路径 | 拒绝把不确定路径当成免费链路 |
| 已核验绕行的 LAN/WAN | 不纳入受限 VPN 文件路径预算，但仍受传输权限和个人规则约束 |

估算模式不是运营商硬限额保证：其他应用、其他设备和统计延迟可能产生未覆盖流量。安全余量用于提前停止应用内受控链路，不能替代出口网关的强制截断。

管理页显示当日/月观测、预留、待对账、剩余及最后采样时间，支持适用的初始用量校准、完成任务对账和审计查看。保存中的配置版本与实际操作必须一致。

## 临时文件与恢复维护

临时分享配置包括有效小时数、最大领取次数、总存储上限和清理周期；管理页查看最新分享、容量预留、状态、期限和领取次数，支持撤销及一批清理。

恢复期限为 1–72 小时，默认 24；检查点最小间隔为 1–16 MiB，默认 4；自动重试为 0–5 次，默认 3。可配置元信息记录及保留期，文件正文不写入普通传输元信息记录。

必要额度记录至少保留覆盖月度计量的时间范围，不因较短的可选记录保留期立刻删除。修改配置或身份授权后，旧任务需要满足当前规则才能继续。

## 配置字段表

下表描述配置文档中的现有字段。它们存储于 `tool_settings.document` 的 JSON 中，不是同名 SQL 列；大字节量使用十进制字符串，界面按对应单位输入或展示。默认值指新配置初始值，实际运行以已保存配置为准。

角色和用户规则另位于 `rules` 数组，管理员名单存于独立授权表。完整数据库说明见 [14_file_transfer_database.md](14_file_transfer_database.md)。

<!-- SETTINGS_TABLES -->

### 开放与说明

| 字段 | 含义 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| `enabled` | 允许开放传输 | `boolean` | `false` | 按类型校验 |
| `noticeZh` | 中文停用说明 | `text` | `"文件快传正在准备中。"` | 最大长度 500 |
| `noticeEn` | 英文停用说明 | `text` | `"File transfer is being prepared."` | 最大长度 500 |

### 链路与速率

| 字段 | 含义 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| `lanNetworks` | 已核验的局域网 IPv4 网段（每行一个，如 192.168.1.0/24） | `text` | `""` | 最大长度 1000 |
| `lanVerified` | 确认：上述网段间文件路由已核验不经过 VPN；变更网络后须重新核验 | `boolean` | `false` | 按类型校验 |
| `lanEnabled` | 局域网直连：同网更快，双方在线 | `boolean` | `true` | 按类型校验 |
| `wanEnabled` | 广域网直连：双方在线，尝试直接连接 | `boolean` | `true` | 按类型校验 |
| `relayEnabled` | 中继：直连失败时接力，计入出口流量 | `boolean` | `false` | 按类型校验 |
| `shareEnabled` | 临时分享：可稍后领取，占用服务器空间 | `boolean` | `false` | 按类型校验 |
| `lanRateKbps` | 局域网速率上限 · Kbit/s（留空不限速） | `integer` | 留空（null） | 最小 1；最大 1000000000；允许留空 |
| `wanRateKbps` | 其他链路速率上限 · Kbit/s（留空不限速） | `integer` | `10000` | 最小 1；最大 1000000000；允许留空 |
| `wanNetworks` | 允许远程直连的公网 IPv4 范围（每行 CIDR） | `text` | `""` | 最大长度 1000 |
| `wanVerified` | 已核验上述直连范围绕开受限 VPN | `boolean` | `false` | 按类型校验 |
| `stunUrls` | STUN 地址（可选，每行一个） | `text` | `""` | 最大长度 1000 |
| `serverVpnPath` | 服务器文件链路的 VPN 路径 | `select` | `"unknown"` | unknown=尚未确认；confirmed-vpn=经过受限 VPN；confirmed-outside-vpn=绕开受限 VPN |
| `serverOutsideVerified` | 已核验服务器及教师代理链路绕开受限出口 | `boolean` | `false` | 按类型校验 |

### 个人额度与匿名共享额度

| 字段 | 含义 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| `personalTimeZone` | 个人额度重置时区 | `timezone` | `"Asia/Shanghai"` | 最大 100 |
| `guestDailyBytes` | 所有匿名访客每日合计 · GB（留空不限制） | `bytes` | 留空（null） | 允许留空 |
| `guestMonthlyBytes` | 所有匿名访客每月合计 · GB（留空不限制） | `bytes` | 留空（null） | 允许留空 |
| `guestConcurrency` | 所有匿名访客同时任务数 | `integer` | `10` | 最小 1；最大 100 |

### VPN 流量防护

| 字段 | 含义 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| `vpnBudgetUnit` | 流量显示与输入单位 | `select` | `"GB"` | GB=GB · 十亿字节；GiB=GiB · 2³⁰ 字节 |
| `vpnProtectionMode` | 额度保护模式 | `select` | `"strict"` | strict=严格：没有出口断流能力不放行；estimate=估算：轮询统计与保守预留 |
| `vpnMeterSource` | 出口统计来源 | `select` | `"off"` | off=尚未接入；interface=本机网卡（Linux / Windows）；snapshot=外部账单／网关快照 |
| `vpnInterface` | 出口网卡完整名称（本机采集时填写） | `text` | `""` | 最大长度 200 |
| `vpnSourceId` | 出口／账户标识（须与快照一致） | `text` | `"vpn-main"` | 最大长度 100 |
| `vpnScopeVerified` | 已核验：统计覆盖该 VPN 账户的教师站、快传及其他共用流量 | `boolean` | `false` | 按类型校验 |
| `vpnPollSeconds` | 采集间隔 · 秒 | `integer` | `10` | 最小 2；最大 60 |
| `vpnStaleSeconds` | 统计失联判定 · 秒 | `integer` | `30` | 最小 6；最大 300 |
| `vpnOverheadPercent` | 受控传输协议开销预留 · % | `integer` | `10` | 最小 0；最大 100 |
| `vpnGuard` | 启用 VPN 额度保护 | `boolean` | `true` | 按类型校验 |
| `vpnDailyBytes` | 每日流量额度 · GB（留空：未配置） | `bytes` | 留空（null） | 允许留空 |
| `vpnMonthlyBytes` | 每月流量额度 · GB（留空：未配置） | `bytes` | 留空（null） | 允许留空 |
| `vpnReserveBytes` | 预留流量 · GB | `bytes` | `"1000000000"` | 按类型校验 |
| `vpnWarningPercent` | 剩余流量提醒阈值 · % | `integer` | `20` | 最小 1；最大 99 |
| `vpnTimeZone` | 额度重置时区（如 Asia/Shanghai） | `timezone` | `"Asia/Shanghai"` | 最大 100 |
| `vpnBilling` | VPN 计费方向 | `select` | `"both"` | both=上传 + 下载；outbound=仅上传出口；inbound=仅下载入口 |
| `vpnUnknownPath` | 无法确认是否经过 VPN 的路径 | `select` | `"block"` | block=禁用该路径；meter=按 VPN 流量保守计量 |

### 临时文件

| 字段 | 含义 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| `temporaryHours` | 默认保存时长 · 小时 | `integer` | `24` | 最小 1；最大 720 |
| `temporaryMaxDownloads` | 默认最多下载次数 | `integer` | `1` | 最小 1；最大 10000 |
| `temporaryStorageBytes` | 临时存储总量 · GB | `bytes` | `"10000000000"` | 按类型校验 |
| `temporaryCleanupMinutes` | 到期清理检查间隔 · 分钟 | `integer` | `15` | 最小 1；最大 1440 |

### 记录与维护

| 字段 | 含义 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| `recoveryHours` | 中断任务恢复期限 · 小时 | `integer` | `24` | 最小 1；最大 72 |
| `checkpointMiB` | 检查点最小间隔 · MiB | `integer` | `4` | 最小 1；最大 16 |
| `automaticRetries` | 连接中断自动重试次数 | `integer` | `3` | 最小 0；最大 5 |
| `recordTransfers` | 记录传输元信息（不记录文件正文） | `boolean` | `true` | 按类型校验 |
| `recordRetentionDays` | 传输记录保留天数 | `integer` | `30` | 最小 1；最大 365 |

### rules 内的权限与额度字段

以下是规则字段定义的初始值；生成的登录默认规则会把 `send` 与 `receive` 设为 true，匿名规则保持 false，初始 links 为 LAN/WAN 直连。总开关、核验和其他限制仍决定是否真正可用。

| 字段 | 含义 | 类型 | 默认值 | 范围/选项 |
| --- | --- | --- | --- | --- |
| `send` | 允许发送 | `boolean` | `false` | 按类型校验 |
| `receive` | 允许接收 | `boolean` | `false` | 按类型校验 |
| `lanRateKbps` | 局域网速率 · Kbit/s（留空继承） | `integer` | 留空（null） | 最小 1；最大 1000000000；允许留空 |
| `wanRateKbps` | 其他链路速率 · Kbit/s（留空继承） | `integer` | 留空（null） | 最小 1；最大 1000000000；允许留空 |
| `maxFileBytes` | 单文件上限 · GB（留空不限制） | `bytes` | 留空（null） | 允许留空 |
| `maxTaskBytes` | 单任务上限 · GB（留空不限制） | `bytes` | 留空（null） | 允许留空 |
| `dailyBytes` | 个人每日总量 · GB（留空不限制） | `bytes` | 留空（null） | 允许留空 |
| `monthlyBytes` | 个人每月总量 · GB（留空不限制） | `bytes` | 留空（null） | 允许留空 |
| `maxFiles` | 每任务文件数量上限 | `integer` | `1000` | 最小 1；最大 100000 |
| `concurrency` | 同时传输任务数 | `integer` | `2` | 最小 1；最大 32 |
