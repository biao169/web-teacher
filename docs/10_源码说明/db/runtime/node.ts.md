# db / runtime / node.ts

## 文件定位

- **源码路径**：`db/runtime/node.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：26 行，1574 字节
- **内容校验**：SHA-256 `15712d86b1df545b536994455952109d3f2d4bb1f7e9e55bb901a146397ecf93`

## 直接依赖

- `../adapters/sqlite`
- `../repository`
- `better-sqlite3`
- `drizzle-orm/better-sqlite3`
- `node:path`

## 直接调用方

- `scripts/auth/bootstrap-admin.ts`
- `scripts/db/seed-sample.ts`
- `scripts/release/seed-fixture.ts`
- `scripts/windows/initialize-local-demo.ts`
- `server/adapters/database-node.ts`
- `tests/native/runtime.spec.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `openNodeDatabase` | 函数，第 7 行 | 打开 Node Database 对应的界面或交互状态 | 由 `scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts`、`scripts/release/seed-fixture.ts` 等模块导入使用。 |
| `close` | 对象方法，第 22 行 | 关闭 close 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `openNodeDatabase`：`export function openNodeDatabase(path: string)`
- `close`：`close()`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
