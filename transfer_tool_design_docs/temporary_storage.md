# 临时落盘与云端暂存

## 本机临时落盘

本机临时落盘是指文件临时保存到 web03 所在服务器硬盘。

建议目录：

```text
D:\Python\b01-website\web03\var\transfer_site\tmp\
```

优点：

```text
部署简单
不依赖外部云服务
文件不离开 web03 服务器
适合局域网或可信环境
```

风险：

```text
占用 web03 磁盘
大文件或高并发可能导致磁盘不足
外网下载速度受 web03 带宽限制
需要自动清理
```

## 云端临时暂存

云端临时暂存是指文件临时保存到云对象存储或云服务器。

可选服务：

```text
Cloudflare R2
Amazon S3
阿里云 OSS
腾讯云 COS
自建云服务器磁盘
```

优点：

```text
减少 web03 磁盘压力
适合大文件和跨公网传输
可使用云服务带宽
可通过签名 URL 控制下载有效期
```

风险：

```text
可能产生流量费和存储费
需要云服务密钥配置
文件会离开 web03 本机环境
需要更严格的访问控制和过期删除
```

## 有效期控制

临时文件必须有有效期。

建议支持两种模式：

```text
跟随随机码有效期
  临时文件 expires_at = 随机码 expires_at

单独设置有效期
  临时文件 expires_at = 创建时间 + temp_expire_minutes
```

后台控制项：

```text
temp_expire_follow_code
temp_expire_minutes
code_expire_minutes
```

## 暂存容量控制

本机暂存：

```text
local_temp_total_quota_gb
local_temp_per_session_quota_gb
local_temp_per_user_quota_gb
```

云端暂存：

```text
cloud_temp_total_quota_gb
cloud_temp_per_session_quota_gb
cloud_temp_per_user_quota_gb
```

超过额度时：

```text
不允许创建新的暂存任务
已有上传可按后台策略暂停或中断
前台提示容量不足
后台记录告警
```

## 清理规则

清理任务应定期执行：

```text
每 5 分钟扫描过期对象
删除本机临时文件
删除云端临时对象
更新数据库状态为 expired 或 deleted
释放会话占用额度
记录清理日志
```

强制清理时：

```text
只有拥有 can_force_cleanup 的管理员可以操作
清理前确认任务是否仍在传输
正在传输的任务必须先暂停或中断
```

## 文件安全

临时文件路径必须只允许相对路径：

```text
允许:
  docs/a.txt
  photos/2026/a.jpg

禁止:
  ../settings.py
  ..\settings.py
  C:\Windows\file.txt
  /etc/passwd
```

本机实际保存时建议使用内部对象 ID：

```text
tmp/session_id/object_id.part
tmp/session_id/object_id.data
```

原始文件名和目录结构只保存在数据库中，下载时再恢复。
