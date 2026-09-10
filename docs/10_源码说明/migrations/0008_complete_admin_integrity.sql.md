# migrations / 0008_complete_admin_integrity.sql

## 文件定位

- **源码路径**：`migrations/0008_complete_admin_integrity.sql`
- **文件类型**：迁移
- **功能定位**：数据库迁移脚本；按版本创建或升级持久化结构。
- **规模**：29 行，1654 字节
- **内容校验**：SHA-256 `17bd4057cd817a354eafdf0dde63081136ae151fe7669ed5deaee560d5c977dd`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 数据库变更

- 新建表：`admin_mutation_guards`
- 新建索引：`ux_auth_permissions_role_module`、`ux_auth_users_username_nocase`、`ux_site_settings_single_active`、`idx_media_assets_admin_status_updated`、`idx_translation_cache_admin_status_updated`、`idx_auth_sessions_user_active_expiry`、`idx_operation_logs_module_created`、`idx_messages_status_created`、`idx_admin_mutation_guards_created`
- 新建触发器：无。
- 调整表：无。
- 用法：由迁移执行器按 `migrations/manifest.json` 的顺序执行，不应跳号或重复手工执行。

## 维护注意事项

- 已发布迁移保持不可变；后续结构调整应新增更高版本迁移。
