# db / security-schema.ts

## 文件定位

- **源码路径**：`db/security-schema.ts`
- **文件类型**：程序模块
- **功能定位**：数据库 Schema 定义；声明表、字段、索引或 Schema 派生结构。
- **规模**：46 行，2183 字节
- **内容校验**：SHA-256 `4e1bf6ef11e8b720255dfe694ad41931ca44b7a4e848b918caf037693fc047e2`

## 直接依赖

- `./schema`
- `drizzle-orm`
- `drizzle-orm/sqlite-core`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `authBootstrapState` | 导出常量，第 5 行 | 提供 auth Bootstrap State 的共享配置或不可变数据 |
| `authSessions` | 导出常量，第 13 行 | 提供 auth Sessions 的共享配置或不可变数据 |
| `authLoginThrottles` | 导出常量，第 33 行 | 提供 auth Login Throttles 的共享配置或不可变数据 |
| `securitySchema` | 导出常量，第 45 行 | 提供 security Schema 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
