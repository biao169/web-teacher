# 后台控制项

后台建议建立单例控制表 `TransferControl`，用于全局控制功能开关、传输策略、资源保护和权限策略。

## 总开关

```text
enabled
  功能总开关。
  关闭后前台不可创建新任务，已有任务按 shutdown_policy 处理。

shutdown_policy
  graceful: 不允许新任务，已有任务允许完成。
  immediate: 立即中断所有任务。
  admin_only: 仅管理员可用。
```

## 连接方式控制

```text
lan_acceleration_enabled
  是否启用局域网直连加速，默认开启。

relay_enabled
  是否允许 web03 服务器实时中转。

cloud_relay_enabled
  是否允许云服务器实时中转。

lan_only
  是否只允许局域网直连。

auto_fallback_enabled
  是否允许自动回退到中转模式。
```

## 临时暂存控制

```text
temp_storage_enabled
  是否允许临时暂存。

temp_storage_mode
  none: 不暂存。
  local: 仅本机临时落盘。
  cloud: 仅云端临时暂存。
  local_and_cloud: 本机和云端均可用。

temp_expire_follow_code
  临时文件有效期是否跟随随机码有效期。

temp_expire_minutes
  临时文件单独有效期。

code_expire_minutes
  随机码有效期。
```

## 带宽控制

```text
max_bandwidth_kbps
  全局总带宽限制。

max_bandwidth_per_session_kbps
  单任务带宽限制。

max_bandwidth_per_user_kbps
  单用户带宽限制。

throttle_strategy
  smooth: 平滑限速。
  burst: 允许短时突发。
  strict: 严格限速。
```

## 周期流量额度

支持按日、周、月、年设置总流量额度：

```text
daily_traffic_quota_gb
weekly_traffic_quota_gb
monthly_traffic_quota_gb
yearly_traffic_quota_gb
```

支持每用户额度：

```text
daily_traffic_quota_per_user_gb
weekly_traffic_quota_per_user_gb
monthly_traffic_quota_per_user_gb
yearly_traffic_quota_per_user_gb
```

支持超额策略：

```text
quota_exceeded_policy
  warn_only: 只提示。
  block_new: 阻止新任务。
  pause_active: 暂停活动任务。
  stop_active: 中断活动任务。
```

## 磁盘保护

```text
disk_monitor_enabled
  是否启用磁盘监控。

min_free_disk_gb
  最小可用磁盘空间。

min_free_disk_percent
  最小可用磁盘百分比。

local_temp_total_quota_gb
  本机临时落盘总容量上限。

local_temp_per_session_quota_gb
  单任务本机临时落盘上限。

disk_pressure_policy
  warn_only: 只提示。
  block_temp_storage: 禁止新的临时落盘。
  block_new_sessions: 禁止新任务。
  stop_temp_sessions: 中断临时落盘任务。
```

## 管理员实时管控

```text
admin_can_pause_session
  管理员是否可以暂停任务。

admin_can_stop_session
  管理员是否可以中断任务。

admin_can_force_cleanup
  管理员是否可以强制清理临时文件。

admin_can_disable_feature_remotely
  管理员是否可以远程关闭整个功能。
```

## 告警提示

```text
show_frontend_warnings
  前台是否显示额度、带宽、磁盘不足提示。

notify_admin_on_quota_warning
  流量接近额度时是否通知管理员。

notify_admin_on_disk_warning
  磁盘空间不足时是否通知管理员。

warning_threshold_percent
  告警阈值，例如 80。

critical_threshold_percent
  中断阈值，例如 95。
```
