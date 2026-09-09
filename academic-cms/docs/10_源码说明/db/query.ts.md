# db / query.ts

## 文件定位

- **源码路径**：`db/query.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：119 行，8058 字节
- **内容校验**：SHA-256 `0d1ab0b63986e6cead5713fc4eb9034af1c07e2d573f40c3f4194a5bebbadb47`

## 直接依赖

- `./codec`
- `./contracts`
- `./errors`
- `./models`
- `./schema-types`

## 直接调用方

- `db/read-plans.ts`
- `db/repository.ts`
- `db/seeds/sample-data.ts`
- `server/audit/commands.ts`
- `server/cache/generation-store.ts`
- `server/services/admin/content-query.ts`
- `server/services/admin/content-store.ts`
- `server/services/admin/dashboard-store.ts`
- `server/services/auth/auth-store.ts`
- `server/services/contact/contact-store.ts`
- `server/services/i18n/translation-store.ts`
- `server/services/interactions/action-throttle-store.ts`
- `server/services/interactions/settings-store.ts`
- `server/services/media/media-catalog-store.ts`
- `server/services/public/public-content-store.ts`
- `server/services/public/public-shell-store.ts`
- `server/utils/complete-admin/db.ts`
- `tests/contracts/repository-contract.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `read` | 函数，第 11 行 | 读取或定位 read，向调用方返回匹配结果 | 由 `db/read-plans.ts`、`db/repository.ts`、`db/seeds/sample-data.ts` 等模块导入使用。 |
| `write` | 函数，第 12 行 | 更新 write，并保持状态、校验与持久化结果一致 | 由 `db/read-plans.ts`、`db/repository.ts`、`db/seeds/sample-data.ts` 等模块导入使用。 |
| `comparableField` | 函数，第 15 行 | 封装 Field 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `comparableValue` | 函数，第 21 行 | 封装 Value 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `predicate` | 函数，第 27 行 | 封装 predicate 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `buildListPlan` | 函数，第 77 行 | 根据输入组装 List Plan 所需的结果对象或结构 | 由 `db/read-plans.ts`、`db/repository.ts`、`db/seeds/sample-data.ts` 等模块导入使用。 |
| `uniqueKeys` | 函数，第 105 行 | 封装 Keys 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/read-plans.ts`、`db/repository.ts`、`db/seeds/sample-data.ts` 等模块导入使用。 |
| `buildLookupCommands` | 函数，第 110 行 | 根据输入组装 Lookup Commands 所需的结果对象或结构 | 由 `db/read-plans.ts`、`db/repository.ts`、`db/seeds/sample-data.ts` 等模块导入使用。 |

### 调用签名

- `read`：`export function read(sql: string, params: readonly SqlValue[] = []): SqlCommand`
- `write`：`export function write(sql: string, params: readonly SqlValue[] = [], returning = false): SqlCommand`
- `comparableField`：`function comparableField(column: ColumnSpec, field: string): string`
- `comparableValue`：`function comparableValue(column: ColumnSpec, value: SqlValue): SqlValue`
- `predicate`：`function predicate(table: TableName, filters: readonly Filter[], search?: string):`
- `buildListPlan`：`export function buildListPlan(table: TableName, query: ListQuery =`
- `uniqueKeys`：`export function uniqueKeys(keys: readonly string[]): string[]`
- `buildLookupCommands`：`export function buildLookupCommands(table: TableName, field: string, keys: readonly string[]): SqlCommand[]`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `Filter` | 类型，第 7 行 | 约束 Filter 的数据结构或可选值 |
| `Sort` | 接口，第 8 行 | 约束 Sort 的数据结构或可选值 |
| `ListQuery` | 接口，第 9 行 | 约束 List Query 的数据结构或可选值 |
| `ListPlan` | 接口，第 10 行 | 约束 List Plan 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
