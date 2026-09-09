# db / errors.ts

## 文件定位

- **源码路径**：`db/errors.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：34 行，1601 字节
- **内容校验**：SHA-256 `302be1d16f762f3bf44fb0ab26be82651cdbdbbaee59cd1722dc964a844fef83`

## 直接调用方

- `db/adapters/d1.ts`
- `db/adapters/sqlite.ts`
- `db/codec.ts`
- `db/contracts.ts`
- `db/query.ts`
- `db/read-plans.ts`
- `db/repository.ts`
- `db/statement.ts`
- `server/services/admin/content-service.ts`
- `server/services/auth/auth-store.ts`
- `server/services/contact/contact-store.ts`
- `server/services/media/media-catalog-store.ts`
- `server/utils/admin-http.ts`
- `tests/contracts/repository-contract.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `DatabaseError.constructor` | 构造方法，第 9 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/adapters/d1.ts`、`db/adapters/sqlite.ts`、`db/codec.ts` 等模块导入使用。 |
| `databaseError` | 函数，第 16 行 | 封装 Error 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/adapters/d1.ts`、`db/adapters/sqlite.ts`、`db/codec.ts` 等模块导入使用。 |

### 调用签名

- `DatabaseError.constructor`：`constructor(code: DatabaseErrorCode, message: string, options?: ErrorOptions)`
- `databaseError`：`export function databaseError(error: unknown): DatabaseError`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `DatabaseErrorCode` | 类型，第 1 行 | 约束 Database Error Code 的数据结构或可选值 |
| `DatabaseError` | 类，第 7 行 | Safe to map to API errors: messages contain no SQL or bound values. |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
