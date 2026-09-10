# db / context.ts

## 文件定位

- **源码路径**：`db/context.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：8 行，419 字节
- **内容校验**：SHA-256 `1d857cb830bedcba5b2dd9eafc1e4e62d24506e071b9b5d20e57f068bdd4edc3`

## 直接依赖

- `./contracts`
- `./repository`

## 直接调用方

- `server/adapters/database-cloudflare.ts`
- `server/adapters/database-node.ts`
- `server/types/h3.d.ts`
- `server/utils/database.ts`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `DatabaseContext` | 接口，第 5 行 | Only portable storage capabilities cross into application Services. |
| `DatabaseRequest` | 接口，第 7 行 | Structural request subset: importing this type never loads H3 or a native driver. |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
