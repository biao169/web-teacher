# migrations / 0002_auth_security.sql

## 文件定位

- **源码路径**：`migrations/0002_auth_security.sql`
- **文件类型**：迁移
- **功能定位**：数据库迁移脚本；按版本创建或升级持久化结构。
- **规模**：74 行，5257 字节
- **内容校验**：SHA-256 `0e0bbea058b8a638beba12df8d30ab7e9ada1b9560ab1392e3f2dffffb935d1e`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 数据库变更

- 新建表：`auth_bootstrap_state`、`auth_sessions`、`auth_login_throttles`
- 新建索引：`idx_auth_sessions_token_hash`、`idx_auth_sessions_user_active`、`idx_auth_sessions_expiry`、`idx_auth_sessions_revoked`、`idx_auth_login_throttles_expiry`
- 新建触发器：无。
- 调整表：无。
- 用法：由迁移执行器按 `migrations/manifest.json` 的顺序执行，不应跳号或重复手工执行。

## 维护注意事项

- 已发布迁移保持不可变；后续结构调整应新增更高版本迁移。
