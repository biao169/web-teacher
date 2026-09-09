# server / services / public / public-row.ts

## 文件定位

- **源码路径**：`server/services/public/public-row.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：93 行，4416 字节
- **内容校验**：SHA-256 `2427e49989b8b6236689be2c73c6b296ccb7676732db5d068af65f088bc18edb`

## 直接依赖

- `../../../db/contracts`
- `../../../shared/enums/auth`
- `../../../shared/utils/unicode`
- `./errors`

## 直接调用方

- `server/services/public/public-home-store.ts`
- `server/services/public/public-page.ts`
- `server/services/public/public-shell-store.ts`
- `server/services/public/public-store-helpers.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `rowOwn` | 函数，第 9 行 | 封装 Own 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowText` | 函数，第 14 行 | 封装 Text 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowRequiredText` | 函数，第 24 行 | 封装 Required Text 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowOptionalText` | 函数，第 30 行 | 封装 Optional Text 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowVisibilityScope` | 函数，第 35 行 | 封装 Visibility Scope 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowInteger` | 函数，第 41 行 | 封装 Integer 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowBoolean` | 函数，第 50 行 | 封装 Boolean 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowTimestamp` | 函数，第 55 行 | 封装 Timestamp 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowDate` | 函数，第 64 行 | 封装 Date 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `rowCount` | 函数，第 73 行 | 封装 Count 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `oneRow` | 函数，第 78 行 | 响应 Row 相关事件，协调后续业务流程 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |
| `manyRows` | 函数，第 83 行 | 封装 Rows 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/public/public-home-store.ts`、`server/services/public/public-page.ts`、`server/services/public/public-shell-store.ts` 等模块导入使用。 |

### 调用签名

- `rowOwn`：`export function rowOwn(row: RawRow, field: string): string | number | null`
- `rowText`：`export function rowText(row: RawRow, field: string, maxBytes: number, nullable = false): string | null`
- `rowRequiredText`：`export function rowRequiredText(row: RawRow, field: string, maxBytes: number): string`
- `rowOptionalText`：`export function rowOptionalText(row: RawRow, field: string, maxBytes: number): string | null`
- `rowVisibilityScope`：`export function rowVisibilityScope(row: RawRow, field: string): VisibilityScope`
- `rowInteger`：`export function rowInteger(row: RawRow, field: string, minimum: number, maximum: number, nullable = false): number | null`
- `rowBoolean`：`export function rowBoolean(row: RawRow, field: string): boolean`
- `rowTimestamp`：`export function rowTimestamp(row: RawRow, field: string, nullable = false): string | null`
- `rowDate`：`export function rowDate(row: RawRow, field: string): string | null`
- `rowCount`：`export function rowCount(result: QueryResult, label: string): number`
- `oneRow`：`export function oneRow<T>(result: QueryResult, parse: (row: RawRow) => T, label: string): T | null`
- `manyRows`：`export function manyRows<T extends`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
