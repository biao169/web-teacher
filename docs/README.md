# 文档索引

本文档集按功能组织，适合网站浏览者、内容维护者和管理员查询。

## 主文档

| 文档 | 内容 |
| --- | --- |
| [01_site_overview.md](01_site_overview.md) | 站点组成、已具备功能及数据对象 |
| [02_database_schema.md](02_database_schema.md) | 教师数据库完整字段字典 |
| [03_frontend_requirements.md](03_frontend_requirements.md) | 前台页面及交互用法 |
| [04_admin_requirements.md](04_admin_requirements.md) | 后台功能、入口、内容录入与管理 |

## 功能专题

| 文档 | 内容 |
| --- | --- |
| [05_input_assistance.md](05_input_assistance.md) | 历史建议、元数据查询、引用解析、差异回填与引用生成 |
| [06_rich_text_and_pdf.md](06_rich_text_and_pdf.md) | 正文格式、可视化编辑、图片、PDF 与实时预览 |
| [07_navigation_and_site_settings.md](07_navigation_and_site_settings.md) | 导航按钮、固定筛选入口、首页教师、学术数值和 HTML 页脚 |
| [08_translation.md](08_translation.md) | 服务配置、单批/连续翻译、重试及人工译文 |
| [09_media.md](09_media.md) | 媒体选择器、上传、裁剪、引用与回收站 |
| [10_accounts_and_messages.md](10_accounts_and_messages.md) | 账号、密码、角色权限、新闻留言与限流 |
| [11_data_backup.md](11_data_backup.md) | JSON/CSV、加密备份、预检及恢复 |
| [12_file_transfer_usage.md](12_file_transfer_usage.md) | 发送接收、文件夹保存、方式选择、额度、恢复与独立备份 |
| [13_file_transfer_admin.md](13_file_transfer_admin.md) | 匿名/用户规则、LAN 限速、VPN 保护及全部配置字段 |
| [14_file_transfer_database.md](14_file_transfer_database.md) | 快传数据库 12 表、70 字段 |

## 机器可读字段资源

| 资源 | 内容 |
| --- | --- |
| [teacher-schema.json](data/teacher-schema.json) | 教师数据库建表 SQL、字段、外键、索引 |
| [admin-form-fields.json](data/admin-form-fields.json) | 内容和配置模块的后台表单字段定义 |
| [transfer-schema.json](data/transfer-schema.json) | 快传独立数据库建表 SQL、字段、外键 |
| [transfer-settings.json](data/transfer-settings.json) | 快传全局配置与权限规则字段定义 |

字段资源描述结构，不包含实际业务数据。数据库可保存字段不一定是前台已启用功能；兼容字段的实际使用边界已在对应字典及专题中注明。
