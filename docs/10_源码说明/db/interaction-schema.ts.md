# db / interaction-schema.ts

## 文件定位

- **源码路径**：`db/interaction-schema.ts`
- **文件类型**：程序模块
- **功能定位**：数据库 Schema 定义；声明表、字段、索引或 Schema 派生结构。
- **规模**：42 行，3321 字节
- **内容校验**：SHA-256 `6ba4f971958145a7ce19eea850700f32ac2a0b60e7b573c1b3748ff2e8f2677c`

## 直接依赖

- `drizzle-orm`
- `drizzle-orm/sqlite-core`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `publicActionThrottles` | 导出常量，第 5 行 | Stage-6 public interaction throttles. Keys are server-side HMAC digests. |
| `demoSeedState` | 导出常量，第 29 行 | Singleton marker for the explicitly invoked development demonstration dataset. |
| `interactionSchema` | 导出常量，第 41 行 | 提供 interaction Schema 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
