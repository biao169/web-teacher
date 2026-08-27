# 实施阶段建议

## 第一阶段：基础框架

目标：

```text
建立 transfer_site 独立 app
接入 /transfer/ 路由
接入后台导航按钮
建立 TransferControl 单例表
接入 web03 权限体系
```

交付：

```text
前台首页
后台控制表
权限项
功能总开关
```

## 第二阶段：局域网直连和多文件界面

目标：

```text
支持多文件拖拽
支持文件夹拖拽
生成文件树
WebRTC 局域网直连
实时进度显示
随机码、链接、二维码连接
```

交付：

```text
发送页面
接收页面
局域网直连传输
基础错误提示
```

## 第三阶段：web03 实时中转

目标：

```text
WebSocket 分片中转
不完整落盘
带宽限制
任务进度
管理员可中断任务
```

交付：

```text
relay_enabled 控制
max_bandwidth 控制
实时任务监控
任务暂停和中断
```

## 第四阶段：临时落盘

目标：

```text
本机临时落盘
有效期控制
容量上限
自动清理
磁盘空间保护
```

交付：

```text
TransferTempObject
cleanup_expired_temp_objects
磁盘告警
磁盘不足阻断
管理员强制清理
```

## 第五阶段：云端暂存和云服务器中转

目标：

```text
云对象存储暂存
云服务器实时中转
云端容量统计
云端流量统计
签名下载链接
云端过期删除
```

交付：

```text
cloud_storage.py
cloud_relay.py
cloud_temp_storage_enabled
cloud_relay_enabled
sync_cloud_usage
```

## 第六阶段：完整实时管控

目标：

```text
日、周、月、年流量额度
单用户流量额度
流量接近上限提示
流量耗尽阻断
资源快照
后台监控面板
远程关闭功能
```

交付：

```text
TransferUsagePeriod
TransferResourceSnapshot
管理员监控页
quota warning/blocking
disk warning/blocking
feature disabled push
```

## 推荐先做顺序

最稳妥顺序：

```text
权限和控制表
局域网直连
web03 实时中转
本机临时落盘
实时管控
云端暂存和云中转
```

原因：

```text
先把权限和总开关做好，后续每个能力都能被后台控制。
先做局域网直连，可以最大限度减少服务器压力。
再做 web03 实时中转，解决不能直连的问题。
临时落盘和云端能力最后扩展，避免一开始就引入存储风险。
```
