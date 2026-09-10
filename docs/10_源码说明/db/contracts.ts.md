# db / contracts.ts

## 文件定位

- **源码路径**：`db/contracts.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：83 行，3899 字节
- **内容校验**：SHA-256 `94bbc987e6b8fda9984837271807dd9dfd549b752d1ed512b8d1250632746a2e`

## 直接依赖

- `./errors`
- `./statement`

## 直接调用方

- `db/adapters/d1.ts`
- `db/adapters/sqlite.ts`
- `db/codec.ts`
- `db/context.ts`
- `db/query.ts`
- `db/read-plans.ts`
- `db/repository.ts`
- `db/seeds/sample-data.ts`
- `server/audit/commands.ts`
- `server/cache/generation-store.ts`
- `server/services/admin/content-service.ts`
- `server/services/admin/content-store.ts`
- `server/services/admin/dashboard-store.ts`
- `server/services/auth/auth-store.ts`
- `server/services/complete-admin/translation-service.ts`
- `server/services/contact/contact-store.ts`
- `server/services/i18n/translation-store.ts`
- `server/services/interactions/action-throttle-store.ts`
- `server/services/interactions/settings-store.ts`
- `server/services/media/media-catalog-store.ts`
- `server/services/public/modules/courses.ts`
- `server/services/public/modules/news.ts`
- `server/services/public/modules/patents.ts`
- `server/services/public/modules/projects.ts`
- `server/services/public/modules/publications.ts`
- `server/services/public/modules/research.ts`
- `server/services/public/modules/students.ts`
- `server/services/public/modules/team.ts`
- `server/services/public/public-content-store.ts`
- `server/services/public/public-home-service.ts`
- `server/services/public/public-home-store.ts`
- `server/services/public/public-page.ts`
- `server/services/public/public-row.ts`
- `server/services/public/public-shell-service.ts`
- `server/services/public/public-shell-store.ts`
- `server/utils/complete-admin/db.ts`
- `tests/contracts/repository-contract.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `validateCommand` | 函数，第 38 行 | 检查 Command 是否满足业务、安全或类型约束 | 由 `db/adapters/d1.ts`、`db/adapters/sqlite.ts`、`db/codec.ts` 等模块导入使用。 |
| `validateBatch` | 函数，第 60 行 | 检查 Batch 是否满足业务、安全或类型约束 | 由 `db/adapters/d1.ts`、`db/adapters/sqlite.ts`、`db/codec.ts` 等模块导入使用。 |
| `safeInteger` | 函数，第 64 行 | 封装 Integer 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/adapters/d1.ts`、`db/adapters/sqlite.ts`、`db/codec.ts` 等模块导入使用。 |
| `normalizeRows` | 函数，第 69 行 | 规范化 Rows，消除不安全或不一致的输入形式 | 由 `db/adapters/d1.ts`、`db/adapters/sqlite.ts`、`db/codec.ts` 等模块导入使用。 |

### 调用签名

- `validateCommand`：`export function validateCommand(command: SqlCommand): void`
- `validateBatch`：`export function validateBatch(commands: readonly SqlCommand[]): void`
- `safeInteger`：`export function safeInteger(value: unknown, field: string): number`
- `normalizeRows`：`export function normalizeRows(rows: unknown): RawRow[]`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SqlValue` | 类型，第 4 行 | 约束 Sql Value 的数据结构或可选值 |
| `RawRow` | 类型，第 5 行 | 约束 Raw Row 的数据结构或可选值 |
| `SqlCommand` | 接口，第 6 行 | 约束 Sql Command 的数据结构或可选值 |
| `QueryResult` | 接口，第 12 行 | 约束 Query Result 的数据结构或可选值 |
| `DatabaseMetrics` | 接口，第 17 行 | 约束 Database Metrics 的数据结构或可选值 |
| `DatabaseAdapter` | 接口，第 18 行 | 约束 Database Adapter 的数据结构或可选值 |
| `DATABASE_LIMITS` | 导出常量，第 25 行 | 提供 DATABASE LIMITS 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
