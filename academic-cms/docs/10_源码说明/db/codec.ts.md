# db / codec.ts

## 文件定位

- **源码路径**：`db/codec.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：113 行，6887 字节
- **内容校验**：SHA-256 `14d93c409f2af0689249a92bbef6248d497ac89d27bb6e7edd8c98ec4d984c6c`

## 直接依赖

- `./catalog`
- `./contracts`
- `./errors`
- `./models`
- `./schema-types`

## 直接调用方

- `db/query.ts`
- `db/read-plans.ts`
- `db/repository.ts`
- `server/services/admin/content-service.ts`
- `server/services/admin/content-store.ts`
- `server/services/admin/content-validation.ts`
- `server/services/media/media-catalog-store.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `tableSpec` | 函数，第 7 行 | 封装 Spec 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/query.ts`、`db/read-plans.ts`、`db/repository.ts` 等模块导入使用。 |
| `columnSpec` | 函数，第 11 行 | 封装 Spec 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/query.ts`、`db/read-plans.ts`、`db/repository.ts` 等模块导入使用。 |
| `identifier` | 函数，第 16 行 | 封装 identifier 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/query.ts`、`db/read-plans.ts`、`db/repository.ts` 等模块导入使用。 |
| `validDate` | 函数，第 20 行 | 封装 Date 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `timestamp` | 函数，第 23 行 | 封装 timestamp 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/query.ts`、`db/read-plans.ts`、`db/repository.ts` 等模块导入使用。 |
| `serializeJson` | 函数，第 28 行 | Validate before stringify: serialization must not silently discard application data. | 仅在本文件内部使用，标识符共出现 2 次。 |
| `visit` | 内部函数，第 31 行 | 封装 visit 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `encodeValue` | 函数，第 60 行 | 把 Value 转换为展示、传输或存储所需格式 | 由 `db/query.ts`、`db/read-plans.ts`、`db/repository.ts` 等模块导入使用。 |
| `decodeRow` | 函数，第 90 行 | 解析 Row 的输入格式，并输出受约束的数据结构 | 由 `db/query.ts`、`db/read-plans.ts`、`db/repository.ts` 等模块导入使用。 |

### 调用签名

- `tableSpec`：`export function tableSpec(table: TableName): TableSpec`
- `columnSpec`：`export function columnSpec(table: TableName, field: string): ColumnSpec`
- `identifier`：`export function identifier(value: string): string`
- `validDate`：`function validDate(value: string): boolean`
- `timestamp`：`export function timestamp(value: string): string`
- `serializeJson`：`function serializeJson(value: unknown): string`
- `visit`：`function visit(item: unknown, depth: number): void`
- `encodeValue`：`export function encodeValue(column: ColumnSpec, value: unknown): SqlValue`
- `decodeRow`：`export function decodeRow<T extends TableName>(table: T, raw: RawRow): Row<T>`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
