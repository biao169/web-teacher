# 权限设计

本工具应接入 web03 现有权限管理，不另建独立账号体系。

## 推荐权限项

```text
transfer_site.can_use_transfer
  可以访问文件传输前台。

transfer_site.can_create_session
  可以创建传输任务。

transfer_site.can_send_files
  可以发送文件和文件夹。

transfer_site.can_receive_files
  可以接收文件和文件夹。

transfer_site.can_use_lan
  可以使用局域网直连。

transfer_site.can_use_relay
  可以使用 web03 实时中转。

transfer_site.can_use_cloud_relay
  可以使用云服务器实时中转。

transfer_site.can_use_temp_storage
  可以使用本机临时落盘。

transfer_site.can_use_cloud_storage
  可以使用云端临时暂存。

transfer_site.can_manage_transfer
  可以进入后台控制表。

transfer_site.can_monitor_sessions
  可以查看实时任务、流量、磁盘和告警。

transfer_site.can_stop_sessions
  可以暂停或中断传输任务。

transfer_site.can_force_cleanup
  可以强制删除临时文件。
```

## 匿名用户策略

匿名用户默认不能创建任务。

可选允许：

```text
allow_anonymous_by_code
  匿名用户凭有效随机码进入接收页。
```

匿名用户限制：

```text
不能创建任务
不能查看任务列表
不能使用后台控制
不能绕过流量和有效期限制
只能访问随机码绑定的会话
```

## 登录用户策略

登录用户访问前台时需要同时满足：

```text
TransferControl.enabled = true
用户拥有 can_use_transfer
目标传输方式未被后台禁用
用户拥有对应传输方式权限
流量额度未耗尽
磁盘保护未触发阻断
```

## 管理员策略

管理员可在后台：

```text
启停整个功能
调整带宽和流量额度
关闭局域网、web03 中转、云中转、临时暂存
查看活动任务
暂停任务
中断任务
强制清理临时文件
查看资源告警
```

## 导航入口显示规则

后台“导航与按钮”编辑界面中添加文件传输入口后，前台显示建议按以下规则：

```text
功能关闭:
  普通用户不显示入口，管理员可看到“已关闭”状态。

用户无 can_use_transfer:
  不显示入口。

用户有 can_use_transfer:
  显示入口。

磁盘或流量进入告警:
  显示入口，但传输页顶部提示当前限制。

磁盘或流量进入阻断:
  显示入口或维护提示页，不允许创建新任务。
```
