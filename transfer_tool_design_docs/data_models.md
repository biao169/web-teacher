# 数据模型草案

以下是规划草案，实际字段可根据当前 web03 技术栈调整。

## TransferControl

全局控制表，建议只保留一条记录。

```text
enabled
shutdown_policy

lan_acceleration_enabled
relay_enabled
cloud_relay_enabled
lan_only
auto_fallback_enabled

temp_storage_enabled
temp_storage_mode
temp_expire_follow_code
temp_expire_minutes
code_expire_minutes

max_bandwidth_kbps
max_bandwidth_per_session_kbps
max_bandwidth_per_user_kbps

daily_traffic_quota_gb
weekly_traffic_quota_gb
monthly_traffic_quota_gb
yearly_traffic_quota_gb

daily_traffic_quota_per_user_gb
weekly_traffic_quota_per_user_gb
monthly_traffic_quota_per_user_gb
yearly_traffic_quota_per_user_gb

disk_monitor_enabled
min_free_disk_gb
min_free_disk_percent
local_temp_total_quota_gb
local_temp_per_session_quota_gb
cloud_temp_total_quota_gb
cloud_temp_per_session_quota_gb

warning_threshold_percent
critical_threshold_percent
quota_exceeded_policy
disk_pressure_policy

allow_anonymous_by_code
require_receiver_confirm
```

## TransferSession

传输任务表。

```text
id
room_id
access_code
created_by
status
mode
requested_mode
effective_mode
sender_ip
receiver_ip
total_bytes
transferred_bytes
traffic_counted_bytes
created_at
updated_at
expires_at
code_expires_at
stopped_by
stop_reason
```

状态建议：

```text
waiting
connected
transferring
paused
done
failed
expired
stopped
```

## TransferObject

单个文件或文件夹节点记录。

```text
session
object_type
relative_path
display_name
size_bytes
checksum
status
transferred_bytes
created_at
updated_at
```

object_type：

```text
file
directory
```

## TransferTempObject

临时暂存对象。

```text
session
transfer_object
storage_backend
temp_key
size_bytes
checksum
status
created_at
expires_at
deleted_at
owner_user
```

storage_backend：

```text
local
cloud
```

## TransferUsagePeriod

周期流量统计。

```text
period_type
period_start
period_end
user
total_bytes
relay_bytes
cloud_relay_bytes
local_temp_bytes
cloud_temp_bytes
direct_estimated_bytes
updated_at
```

period_type：

```text
day
week
month
year
```

## TransferResourceSnapshot

资源快照表，可选。用于后台监控页和历史排查。

```text
active_sessions
total_upload_kbps
total_download_kbps
free_disk_bytes
free_disk_percent
local_temp_used_bytes
cloud_temp_used_bytes
daily_traffic_bytes
weekly_traffic_bytes
monthly_traffic_bytes
yearly_traffic_bytes
created_at
```

## TransferAuditLog

审计日志。

```text
actor
action
session
object_id
ip_address
message
metadata_json
created_at
```

典型 action：

```text
session_created
session_started
session_paused
session_resumed
session_stopped
quota_warning
quota_blocked
disk_warning
disk_blocked
temp_object_deleted
admin_disabled_feature
```
