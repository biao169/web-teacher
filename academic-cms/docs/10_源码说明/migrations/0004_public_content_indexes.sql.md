# migrations / 0004_public_content_indexes.sql

## 文件定位

- **源码路径**：`migrations/0004_public_content_indexes.sql`
- **文件类型**：迁移
- **功能定位**：数据库迁移脚本；按版本创建或升级持久化结构。
- **规模**：12 行，492 字节
- **内容校验**：SHA-256 `5f7ddb5022d8cdf245f898b4fa1bef862028ea640581fc8427f89722293c2caa`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 数据库变更

- 新建表：无。
- 新建索引：`idx_profiles_visibility_active_sort`、`idx_projects_visibility_start_date`、`idx_courses_visibility_semester`
- 新建触发器：无。
- 调整表：无。
- 用法：由迁移执行器按 `migrations/manifest.json` 的顺序执行，不应跳号或重复手工执行。

## 维护注意事项

- 已发布迁移保持不可变；后续结构调整应新增更高版本迁移。
