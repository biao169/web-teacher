# migrations / 0007_admin_content_management.sql

## 文件定位

- **源码路径**：`migrations/0007_admin_content_management.sql`
- **文件类型**：迁移
- **功能定位**：数据库迁移脚本；按版本创建或升级持久化结构。
- **规模**：33 行，1698 字节
- **内容校验**：SHA-256 `67ec9978b6723d347ef4a7a6f65e4feb021fc9030b8572543eec320d8759508d`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 数据库变更

- 新建表：`admin_mutation_guards`
- 新建索引：`idx_admin_mutation_guards_created_at`、`idx_profiles_admin_updated`、`idx_publications_admin_updated`、`idx_projects_admin_updated`、`idx_patents_admin_updated`、`idx_students_admin_updated`、`idx_news_admin_updated`、`idx_courses_admin_updated`、`idx_messages_admin_status_created`
- 新建触发器：无。
- 调整表：无。
- 用法：由迁移执行器按 `migrations/manifest.json` 的顺序执行，不应跳号或重复手工执行。

## 维护注意事项

- 已发布迁移保持不可变；后续结构调整应新增更高版本迁移。
