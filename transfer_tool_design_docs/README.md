# web03 独立文件传输工具设计文档

本文档包用于规划一个独立于 web03 现有业务文件夹的文件传输小工具。目标是在不影响当前网站内容的前提下，新增可管控、可限流、可临时暂存、可局域网加速的文件和文件夹传输能力。

## 设计目标

- 功能代码独立成一个网站子应用，不与 web03 现有功能文件夹混用。
- 支持多文件、文件夹拖拽传输，并尽量保留目录结构。
- 优先局域网直连；不可直连时可按后台策略使用 web03 实时中转、云服务器中转、本机临时落盘或云端临时暂存。
- 实时中转默认不保存完整文件，避免 web03 磁盘被占满。
- 支持后台实时管控，包括启停、限速、限流、磁盘保护、临时文件有效期、远程关闭任务。
- 接入 web03 现有登录、用户组、权限和后台管理体系。
- 前台提供美观传输界面，支持链接、二维码、随机码连接，并实时显示进度、速度、连接方式和异常提示。

## 文档目录

- [文件路径规划](./file_layout.md)
- [功能架构](./architecture.md)
- [后台控制项](./control_panel.md)
- [权限设计](./permissions.md)
- [实时管控与资源保护](./realtime_governance.md)
- [临时落盘与云端暂存](./temporary_storage.md)
- [数据模型草案](./data_models.md)
- [接口与实时通道草案](./api_and_realtime.md)
- [前台界面规划](./frontend_ui.md)
- [运维与清理任务](./operations.md)
- [实施阶段建议](./implementation_plan.md)

## 推荐应用名称

建议 Django app 名称：

```text
transfer_site
```

建议前台访问入口：

```text
/transfer/
```

建议后台控制入口：

```text
/admin/transfer_site/transfercontrol/
```

建议文档目录：

```text
D:\Python\b01-website\web03\transfer_tool_design_docs\
```

建议未来代码目录：

```text
D:\Python\b01-website\web03\transfer_site\
```

建议未来运行数据目录：

```text
D:\Python\b01-website\web03\var\transfer_site\
```

## 核心原则

1. 现有 web03 功能不迁移、不重构、不混放。
2. 传输工具只通过 URL、后台导航按钮、权限系统与 web03 对接。
3. 大文件采用分片和流式传输，不要求服务器保存完整文件。
4. 临时暂存必须有容量上限、有效期、权限校验和清理机制。
5. 流量、带宽、磁盘、水位告警必须优先于用户传输任务，避免拖垮网站。
