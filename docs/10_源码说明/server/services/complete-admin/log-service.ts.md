# server / services / complete-admin / log-service.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/log-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：233 行，12084 字节
- **内容校验**：SHA-256 `4f873dcebb67edfd96c9638d868a3e59f785fc807b2a6189690778d79d1ad30c`

## 直接依赖

- `../../utils/complete-admin/auth`
- `../../utils/complete-admin/csv`
- `../../utils/complete-admin/db`
- `h3`
- `~~/shared/complete-admin/core.mjs`

## 直接调用方

- `server/api/v1/admin/complete/logs/[uid].get.ts`
- `server/api/v1/admin/complete/logs/export.post.ts`
- `server/api/v1/admin/complete/logs/index.get.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `hasControlCharacter` | 函数，第 28 行 | 检查 Control Character 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `scalar` | 函数，第 40 行 | 封装 scalar 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `boundedText` | 函数，第 45 行 | 封装 Text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 11 次。 |
| `normalizeFilters` | 函数，第 51 行 | 规范化 Filters，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `normalizeListQuery` | 函数，第 66 行 | 规范化 List Query，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `sqlLike` | 函数，第 76 行 | 封装 Like 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `whereClause` | 函数，第 80 行 | 封装 Clause 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `safeDetail` | 函数，第 112 行 | 封装 Detail 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `requestIdFrom` | 函数，第 123 行 | 封装 Id From 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `publicFilters` | 函数，第 128 行 | 封装 Filters 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `CompleteAdminLogService.constructor` | 构造方法，第 133 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/logs/[uid].get.ts`、`server/api/v1/admin/complete/logs/export.post.ts`、`server/api/v1/admin/complete/logs/index.get.ts` 等模块导入使用。 |
| `CompleteAdminLogService.db` | 类方法，第 135 行 | 封装 db 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/logs/[uid].get.ts`、`server/api/v1/admin/complete/logs/export.post.ts`、`server/api/v1/admin/complete/logs/index.get.ts` 等模块导入使用。 |
| `CompleteAdminLogService.list` | 类方法，第 137 行 | 收集 list 对应的数据集合，并应用必要的范围或过滤规则 | 由 `server/api/v1/admin/complete/logs/[uid].get.ts`、`server/api/v1/admin/complete/logs/export.post.ts`、`server/api/v1/admin/complete/logs/index.get.ts` 等模块导入使用。 |
| `CompleteAdminLogService.get` | 类方法，第 177 行 | 读取或定位 get，向调用方返回匹配结果 | 由 `server/api/v1/admin/complete/logs/[uid].get.ts`、`server/api/v1/admin/complete/logs/export.post.ts`、`server/api/v1/admin/complete/logs/index.get.ts` 等模块导入使用。 |
| `CompleteAdminLogService.export` | 类方法，第 188 行 | 封装 export 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/logs/[uid].get.ts`、`server/api/v1/admin/complete/logs/export.post.ts`、`server/api/v1/admin/complete/logs/index.get.ts` 等模块导入使用。 |

### 调用签名

- `hasControlCharacter`：`function hasControlCharacter(value: string): boolean`
- `scalar`：`function scalar(value: unknown, code: string): unknown`
- `boundedText`：`function boundedText(value: unknown, maxLength: number, code: string): string`
- `normalizeFilters`：`function normalizeFilters(input: Record<string, unknown>): LogFilters`
- `normalizeListQuery`：`function normalizeListQuery(input: Record<string, unknown>): LogQuery`
- `sqlLike`：`function sqlLike(value: string): string`
- `whereClause`：`function whereClause(filters: LogFilters):`
- `safeDetail`：`function safeDetail(raw: unknown): Record<string, unknown>`
- `requestIdFrom`：`function requestIdFrom(detail: Record<string, unknown>): string | null`
- `publicFilters`：`function publicFilters(filters: LogFilters): Record<string, string>`
- `CompleteAdminLogService.constructor`：`constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal)`
- `CompleteAdminLogService.db`：`private async db(): Promise<SqlAdapter>`
- `CompleteAdminLogService.list`：`async list(): Promise<Record<string, unknown>>`
- `CompleteAdminLogService.get`：`async get(uid: string): Promise<Record<string, unknown> | null>`
- `CompleteAdminLogService.export`：`async export(input: unknown): Promise<Record<string, unknown>>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `LogFilters` | 接口，第 15 行 | 约束 Log Filters 的数据结构或可选值 |
| `LogQuery` | 接口，第 35 行 | 约束 Log Query 的数据结构或可选值 |
| `CompleteAdminLogService` | 类，第 132 行 | 封装 Complete Admin Log Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
