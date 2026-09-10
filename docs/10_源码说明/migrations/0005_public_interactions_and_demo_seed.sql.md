# migrations / 0005_public_interactions_and_demo_seed.sql

## 文件定位

- **源码路径**：`migrations/0005_public_interactions_and_demo_seed.sql`
- **文件类型**：迁移
- **功能定位**：数据库迁移脚本；按版本创建或升级持久化结构。
- **规模**：48 行，3030 字节
- **内容校验**：SHA-256 `c325f78e907a10911006019ad2ad6cc0d03fc1cddffc1785741aeb1149ce1909`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 数据库变更

- 新建表：`public_action_throttles`、`demo_seed_state`
- 新建索引：`idx_public_action_throttles_expiry`、`idx_public_action_throttles_action_scope`、`idx_global_settings_updated`
- 新建触发器：无。
- 调整表：无。
- 用法：由迁移执行器按 `migrations/manifest.json` 的顺序执行，不应跳号或重复手工执行。

## 维护注意事项

- 已发布迁移保持不可变；后续结构调整应新增更高版本迁移。
