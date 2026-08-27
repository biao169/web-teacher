# 接口与实时通道草案

## HTTP 页面

```text
GET /transfer/
  传输首页。

GET /transfer/r/<room_id>/
  传输房间。

GET /transfer/receive/<room_id>/
  接收页面。

GET /transfer/status/
  当前用户可见的功能状态。
```

## HTTP API

```text
POST /transfer/api/sessions/
  创建传输任务。

POST /transfer/api/sessions/<room_id>/join/
  通过随机码或登录权限加入任务。

POST /transfer/api/sessions/<room_id>/stop/
  停止任务。

POST /transfer/api/sessions/<room_id>/pause/
  暂停任务。

POST /transfer/api/sessions/<room_id>/resume/
  恢复任务。

GET /transfer/api/sessions/<room_id>/objects/
  获取文件树。

GET /transfer/api/quota/
  获取当前用户和全局额度状态。

GET /transfer/api/admin/sessions/
  管理员查看活动任务。

POST /transfer/api/admin/sessions/<room_id>/stop/
  管理员远程中断任务。

POST /transfer/api/admin/feature/disable/
  管理员远程关闭功能。
```

## WebSocket 通道

```text
ws://host/transfer/ws/signaling/<room_id>/
  WebRTC 信令、连接协商、随机码状态。

ws://host/transfer/ws/relay/<room_id>/
  web03 实时中转数据通道。

ws://host/transfer/ws/progress/<room_id>/
  进度、速度、告警、管理员控制消息。

ws://host/transfer/ws/admin/monitor/
  管理员实时监控所有任务。
```

## 实时消息类型

```text
session.status
peer.joined
peer.left
file.tree
file.chunk
file.chunk_ack
file.done
progress.update
quota.warning
quota.blocked
disk.warning
disk.blocked
admin.pause
admin.resume
admin.stop
feature.disabled
error
```

## 资源保护消息

流量不足：

```json
{
  "type": "quota.blocked",
  "message": "当前传输流量额度不足，系统已停止创建新的传输任务。",
  "period": "day",
  "used_bytes": 107374182400,
  "quota_bytes": 107374182400
}
```

磁盘不足：

```json
{
  "type": "disk.blocked",
  "message": "服务器临时存储空间不足，系统已暂停需要暂存的传输。",
  "free_disk_bytes": 5368709120,
  "min_free_disk_bytes": 10737418240
}
```

管理员关闭：

```json
{
  "type": "feature.disabled",
  "message": "文件传输功能已由管理员暂时关闭。当前任务已停止，请稍后再试。"
}
```

## 分片传输建议

```text
默认 chunk 大小: 1 MB 到 4 MB
弱网环境: 256 KB 到 1 MB
局域网: 4 MB 到 8 MB
```

每个 chunk 应包含：

```text
session_id
object_id
chunk_index
offset
size
checksum
payload
```

## 断点续传

建议第一版预留字段，第二版实现完整断点续传。

第一版可实现：

```text
失败后重新开始单个文件
已完成文件不重复传
```

第二版实现：

```text
按 chunk 断点续传
接收端返回已完成 chunk bitmap
发送端只补传缺失 chunk
```
