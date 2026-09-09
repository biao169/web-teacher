# tests / native / repository.spec.ts

## 文件定位

- **源码路径**：`tests/native/repository.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：62 行，3484 字节
- **内容校验**：SHA-256 `74cec20ddc5c623916264a6c12e31ade3ac168289a50fd175fcd1d963846105b`

## 直接依赖

- `../../db/adapters/sqlite`
- `../../db/catalog`
- `../../db/repository`
- `../../db/schema`
- `../../db/schema-types`
- `../../scripts/db/migrations.mjs`
- `../contracts/repository-contract`
- `better-sqlite3`
- `drizzle-orm`
- `drizzle-orm/better-sqlite3`
- `drizzle-orm/sqlite-core`
- `node:url`
- `vitest`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `Migration` | 类型，第 15 行 | 约束 Migration 的数据结构或可选值 |

## 测试场景

- 第 27 行：`describe` — production better-sqlite3 Repository contract
- 第 31 行：`test` — all Drizzle table metadata matches the migrated SQLite schema
- 第 51 行：`test` — Drizzle and Repository agree on booleans, JSON, defaults and RETURNING

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
