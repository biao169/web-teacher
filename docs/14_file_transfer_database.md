# 文件快传数据库字段字典

文件快传使用独立 SQLite 数据库，当前共有 **12 张表、70 个字段**。不写入教师数据库，不复用教师媒体库保存传输正文。

数据库使用 STRICT 表。配置与部分状态以 JSON 文本保存，大字节量以十进制字符串存储；时间字段按各表说明使用 ISO 文本或毫秒时间戳。下表“未声明”表示 SQL 未设置 DEFAULT，不等于运行时不赋值。

管理员 UID 引用教师身份，但没有跨数据库 SQL 外键。普通任务额度与恢复记录主要保存标识、摘要和状态；临时分享会保存清单，文件正文位于工具私有文件目录。恢复记录并不是文件正文备份。

完整 SQL、字段和外键见 [data/transfer-schema.json](data/transfer-schema.json)，配置 JSON 字段见 [13_file_transfer_admin.md](13_file_transfer_admin.md) 及 [data/transfer-settings.json](data/transfer-settings.json)。这些资源只含结构定义，没有真实用户、文件、令牌或密钥内容。

## 表索引

| 表 | 用途 | 字段数 |
| --- | --- | --- |
| `tool_settings` | 统一配置 | 5 |
| `admin_grants` | 工具管理员授权 | 3 |
| `settings_audit` | 配置操作记录 | 4 |
| `bridge_nonces` | 桥接请求防重放 | 2 |
| `service_meta` | 独立服务数据库状态 | 2 |
| `transfer_allowances` | 个人与匿名任务额度 | 10 |
| `vpn_state` | VPN 计量与预算状态 | 2 |
| `vpn_grants` | VPN 分块预算授权 | 12 |
| `vpn_audit` | VPN 校准与对账记录 | 5 |
| `temporary_shares` | 临时分享 | 12 |
| `recovery_tasks` | 任务恢复状态 | 9 |
| `recovery_members` | 恢复任务参与者 | 4 |

## tool_settings — 统一配置

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `id` | 固定单例主键 1；主键组成列 | `INTEGER` | 是 | 未声明 |
| `revision` | 配置版本，用于并发写入校验 | `INTEGER` | 否 | 未声明 |
| `document` | 所有传输设置与规则 JSON | `TEXT` | 否 | 未声明 |
| `updated_at` | 更新时间，文本 | `TEXT` | 否 | 未声明 |
| `updated_by` | 更新操作者 | `TEXT` | 否 | 未声明 |

## admin_grants — 工具管理员授权

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `user_uid` | 教师用户 UID；主键组成列 | `TEXT` | 否 | 未声明 |
| `granted_at` | 授权时间，文本 | `TEXT` | 否 | 未声明 |
| `granted_by` | 授权操作者 | `TEXT` | 否 | 未声明 |

## settings_audit — 配置操作记录

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `revision` | 配置版本/主键；主键组成列 | `INTEGER` | 是 | 未声明 |
| `changed_at` | 操作时间，文本 | `TEXT` | 否 | 未声明 |
| `changed_by` | 操作者 | `TEXT` | 否 | 未声明 |
| `action` | 配置动作 | `TEXT` | 否 | 未声明 |

## bridge_nonces — 桥接请求防重放

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `jti` | 已使用的桥接请求随机标识；主键组成列 | `TEXT` | 否 | 未声明 |
| `expires_at` | 到期时间，毫秒时间戳 | `INTEGER` | 否 | 未声明 |

## service_meta — 独立服务数据库状态

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `key` | 服务属性键，如归属和结构版本；主键组成列 | `TEXT` | 否 | 未声明 |
| `value` | 属性文本值 | `TEXT` | 否 | 未声明 |

## transfer_allowances — 个人与匿名任务额度

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `task` | 任务标识；主键组成列 | `TEXT` | 否 | 未声明 |
| `member` | 任务参与方向/成员标识；主键组成列 | `TEXT` | 否 | 未声明 |
| `identity_key` | 身份摘要键 | `TEXT` | 否 | 未声明 |
| `kind` | 身份类别 | `TEXT` | 否 | 未声明 |
| `bytes` | 授权文件字节数，十进制字符串 | `TEXT` | 否 | 未声明 |
| `created_at` | 预留创建时间，毫秒 | `INTEGER` | 否 | 未声明 |
| `authorized_at` | 首次授权时间，毫秒，可空 | `INTEGER` | 是 | 未声明 |
| `expires_at` | 授权租期到期时间，毫秒 | `INTEGER` | 否 | 未声明 |
| `finished_at` | 结束时间，毫秒，可空 | `INTEGER` | 是 | 未声明 |
| `outcome` | 结束结果，可空 | `TEXT` | 是 | 未声明 |

联合主键：`task`、`member`。

## vpn_state — VPN 计量与预算状态

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `id` | 固定单例主键 1；主键组成列 | `INTEGER` | 是 | 未声明 |
| `document` | VPN 观测、校准和预算状态 JSON | `TEXT` | 否 | 未声明 |

## vpn_grants — VPN 分块预算授权

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `token_hash` | 预算凭据摘要；主键组成列 | `TEXT` | 否 | 未声明 |
| `revision` | 绑定的配置版本 | `INTEGER` | 否 | 未声明 |
| `created_at` | 创建时间，毫秒 | `INTEGER` | 否 | 未声明 |
| `expires_at` | 预算有效期，毫秒 | `INTEGER` | 否 | 未声明 |
| `rx_max` | 接收预算上限，字节文本 | `TEXT` | 否 | 未声明 |
| `tx_max` | 发送预算上限，字节文本 | `TEXT` | 否 | 未声明 |
| `overhead` | 预留开销百分比 | `INTEGER` | 否 | 未声明 |
| `rx_issued` | 已发放接收窗口，字节文本 | `TEXT` | 否 | 未声明 |
| `tx_issued` | 已发放发送窗口，字节文本 | `TEXT` | 否 | 未声明 |
| `sequence` | 预算窗口序号 | `INTEGER` | 否 | 未声明 |
| `closed_at` | 关闭时间，毫秒，可空 | `INTEGER` | 是 | 未声明 |
| `reconciled_at` | 确认对账时间，毫秒，可空 | `INTEGER` | 是 | 未声明 |

## vpn_audit — VPN 校准与对账记录

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `id` | 日志主键；主键组成列 | `INTEGER` | 是 | 未声明 |
| `at` | 发生时间，毫秒 | `INTEGER` | 否 | 未声明 |
| `actor` | 操作者 | `TEXT` | 否 | 未声明 |
| `action` | 操作动作 | `TEXT` | 否 | 未声明 |
| `details` | 操作详情 JSON | `TEXT` | 否 | 未声明 |

## temporary_shares — 临时分享

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `id` | 临时分享标识；主键组成列 | `TEXT` | 否 | 未声明 |
| `owner` | 拥有者身份键 | `TEXT` | 否 | 未声明 |
| `secret_hash` | 领取秘密摘要，唯一 | `TEXT` | 否 | 未声明 |
| `summary` | 清单统计摘要 JSON | `TEXT` | 否 | 未声明 |
| `manifest` | 文件与目录清单 JSON，可空 | `TEXT` | 是 | 未声明 |
| `reserved_bytes` | 存储预留字节数，十进制文本 | `TEXT` | 否 | 未声明 |
| `state` | 分享状态 | `TEXT` | 否 | 未声明 |
| `created_at` | 创建时间，毫秒 | `INTEGER` | 否 | 未声明 |
| `expires_at` | 到期时间，毫秒 | `INTEGER` | 否 | 未声明 |
| `max_downloads` | 最大领取次数 | `INTEGER` | 否 | 未声明 |
| `downloads` | 已领取次数 | `INTEGER` | 否 | `0` |
| `note` | 发送备注 | `TEXT` | 否 | 未声明 |

唯一约束：`secret_hash`。

## recovery_tasks — 任务恢复状态

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `id` | 恢复任务标识；主键组成列 | `TEXT` | 否 | 未声明 |
| `transport` | 原传输方式 | `TEXT` | 否 | 未声明 |
| `summary` | 任务清单统计及摘要 JSON | `TEXT` | 否 | 未声明 |
| `note` | 任务备注 | `TEXT` | 否 | 未声明 |
| `point` | 已确认的检查点 JSON | `TEXT` | 否 | 未声明 |
| `extra` | 方式相关恢复状态 JSON | `TEXT` | 否 | 未声明 |
| `state` | 恢复任务状态 | `TEXT` | 否 | 未声明 |
| `expires_at` | 恢复到期时间，毫秒 | `INTEGER` | 否 | 未声明 |
| `updated_at` | 更新时间，毫秒 | `INTEGER` | 否 | 未声明 |

## recovery_members — 恢复任务参与者

| 字段 | 含义 | SQL 类型 | 可空 | SQL 默认值 |
| --- | --- | --- | --- | --- |
| `task` | 所属恢复任务 ID；主键组成列 | `TEXT` | 否 | 未声明 |
| `member` | 参与方向/成员标识；主键组成列 | `TEXT` | 否 | 未声明 |
| `identity_key` | 原始身份摘要键 | `TEXT` | 否 | 未声明 |
| `token_hash` | 恢复凭据摘要，唯一 | `TEXT` | 否 | 未声明 |

联合主键：`task`、`member`。

唯一约束：`token_hash`。

外键：`task` → `recovery_tasks.id`；删除 CASCADE。
