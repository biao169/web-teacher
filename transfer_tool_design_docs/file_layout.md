# 文件路径规划

## 当前新增文档目录

本次只新增设计文档目录：

```text
D:\Python\b01-website\web03\transfer_tool_design_docs\
```

这个目录仅保存规划文档，不包含运行代码，不影响现有 web03 功能。

## 未来代码目录

建议未来实现时新增独立 Django app：

```text
D:\Python\b01-website\web03\transfer_site\
```

建议结构：

```text
transfer_site\
  __init__.py
  apps.py
  urls.py
  models.py
  admin.py
  views.py
  consumers.py
  routing.py
  permissions.py
  tasks.py
  services\
    __init__.py
    bandwidth.py
    cleanup.py
    cloud_relay.py
    cloud_storage.py
    config.py
    local_storage.py
    quota.py
    relay.py
    sessions.py
    signaling.py
    usage_meter.py
  templates\
    transfer_site\
      base.html
      index.html
      room.html
      receive.html
      status.html
  static\
    transfer_site\
      css\
        transfer.css
      js\
        transfer-ui.js
        transfer-drop.js
        transfer-filesystem.js
        transfer-webrtc.js
        transfer-relay.js
        transfer-progress.js
```

## 未来运行数据目录

运行时数据不要放入代码目录。建议独立：

```text
D:\Python\b01-website\web03\var\transfer_site\
  tmp\
  logs\
  quarantine\
  metrics\
```

用途：

```text
tmp          本机临时落盘文件
logs         传输审计和系统日志
quarantine   异常文件隔离区，可选
metrics      流量、带宽、任务状态快照，可选
```

## 与 web03 的最小集成点

只建议修改这些现有项目位置：

```text
settings.py
  INSTALLED_APPS 增加 transfer_site
  如使用 WebSocket，配置 Channels

项目 urls.py
  path("transfer/", include("transfer_site.urls"))

后台导航与按钮配置
  增加“文件传输”按钮，链接到 /transfer/
```

除上述接入点外，所有功能代码、模板、静态资源、任务、服务类均放在 `transfer_site` 内。
