# 运维与清理任务

## 定时任务

建议至少配置以下定时任务：

```text
cleanup_expired_temp_objects
  每 5 分钟执行，删除过期本机临时文件和云端临时对象。

refresh_resource_snapshot
  每 30 秒或 1 分钟执行，刷新磁盘、流量、活动任务状态。

rollup_usage_periods
  每 5 分钟执行，汇总日、周、月、年流量。

mark_expired_sessions
  每 1 分钟执行，标记随机码过期或会话过期。

sync_cloud_usage
  每 5 到 15 分钟执行，拉取云端暂存容量和云中转流量。
```

## 启动前检查

功能启动前检查：

```text
TransferControl.enabled 是否开启
本机临时目录是否存在且可写
磁盘剩余空间是否大于 min_free_disk_gb
云存储配置是否有效
云服务器中转配置是否有效
WebSocket 服务是否可用
后台权限是否已创建
```

## 关闭策略

管理员关闭功能时：

```text
graceful:
  不允许新任务，已有任务继续完成。

pause_active:
  不允许新任务，活动任务暂停。

immediate:
  不允许新任务，活动任务立即中断。
```

建议默认：

```text
graceful
```

当磁盘 critical 时建议强制：

```text
block_new_sessions
stop_temp_sessions
```

## 日志

建议记录：

```text
任务创建
任务开始
任务完成
任务失败
任务暂停
任务中断
管理员关闭功能
管理员强制清理
流量告警
磁盘告警
权限拒绝
随机码错误
```

日志中不要记录：

```text
文件完整内容
随机码明文长期留存
云存储密钥
用户敏感 token
```

## 备份策略

不建议备份临时文件。

建议备份：

```text
TransferControl 配置
审计日志
流量统计
任务元数据
```

不建议备份：

```text
tmp 临时文件
分片缓存
过期云端对象
```

## 故障处理

流量额度误触发：

```text
管理员检查 TransferUsagePeriod。
确认统计口径。
必要时调整 quota 或重算周期统计。
```

磁盘空间不足：

```text
立即关闭本机临时落盘。
运行过期清理。
检查 tmp 目录是否有孤儿文件。
必要时管理员强制清理。
```

云端暂存异常：

```text
关闭 cloud_temp_storage_enabled。
关闭 cloud_relay_enabled。
保留局域网直连和 web03 实时中转。
检查云服务凭据、额度和网络。
```

WebSocket 异常：

```text
禁用实时中转。
保留临时暂存下载。
检查 ASGI、反向代理和超时配置。
```
