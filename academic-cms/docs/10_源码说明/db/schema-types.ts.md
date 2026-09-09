# db / schema-types.ts

## 文件定位

- **源码路径**：`db/schema-types.ts`
- **文件类型**：程序模块
- **功能定位**：数据库 Schema 定义；声明表、字段、索引或 Schema 派生结构。
- **规模**：25 行，1123 字节
- **内容校验**：SHA-256 `b7870666d09d521944407d0928a0bbec15542df8f9b6f7a6a07c3a43bf2a808f`

## 直接调用方

- `db/catalog.ts`
- `db/codec.ts`
- `db/models.ts`
- `db/query.ts`
- `db/schema.ts`
- `server/audit/sanitize.ts`
- `tests/native/repository.spec.ts`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `JsonValue` | 类型，第 2 行 | Storage metadata. This module must stay free of Node and ORM imports. |
| `Visibility` | 类型，第 3 行 | 约束 Visibility 的数据结构或可选值 |
| `ColumnSpec` | 接口，第 4 行 | 约束 Column Spec 的数据结构或可选值 |
| `IndexColumn` | 接口，第 22 行 | 约束 Index Column 的数据结构或可选值 |
| `IndexSpec` | 接口，第 23 行 | 约束 Index Spec 的数据结构或可选值 |
| `TableSpec` | 接口，第 24 行 | 约束 Table Spec 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
