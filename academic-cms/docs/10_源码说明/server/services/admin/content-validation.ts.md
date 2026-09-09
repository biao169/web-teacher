# server / services / admin / content-validation.ts

## 文件定位

- **源码路径**：`server/services/admin/content-validation.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：209 行，10165 字节
- **内容校验**：SHA-256 `4e787dfde1a391c07aa14a7ed4df1a9d983e1c6104a2ade2f976bc7f174ef0e8`

## 直接依赖

- `../../../db/codec`
- `../../../shared/admin/content-modules`
- `../../media/object-key`
- `./content-errors`

## 直接调用方

- `server/services/admin/content-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `isPlainObject` | 函数，第 14 行 | 检查 Plain Object 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `canonicalDate` | 函数，第 20 行 | 规范化 Date，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `canonicalTimestamp` | 函数，第 26 行 | 规范化 Timestamp，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `canonicalUrl` | 函数，第 32 行 | 规范化 Url，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `canonicalEmail` | 函数，第 41 行 | 规范化 Email，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `normalizeText` | 函数，第 46 行 | 规范化 Text，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `normalizeField` | 函数，第 54 行 | 规范化 Field，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `orcidValid` | 函数，第 116 行 | 封装 Valid 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `normalizeDoi` | 函数，第 125 行 | 规范化 Doi，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `dateOrder` | 函数，第 130 行 | 封装 Order 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `validateCombined` | 函数，第 136 行 | 检查 Combined 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `normalizeAdminContentValues` | 函数，第 161 行 | 规范化 Admin Content Values，消除不安全或不一致的输入形式 | 由 `server/services/admin/content-service.ts` 等模块导入使用。 |

### 调用签名

- `isPlainObject`：`function isPlainObject(value: unknown): value is Record<string, unknown>`
- `canonicalDate`：`function canonicalDate(value: string): string | null`
- `canonicalTimestamp`：`function canonicalTimestamp(value: string): string | null`
- `canonicalUrl`：`function canonicalUrl(value: string): string | null`
- `canonicalEmail`：`function canonicalEmail(value: string): string | null`
- `normalizeText`：`function normalizeText(field: AdminFieldDefinition, value: string): string | null`
- `normalizeField`：`function normalizeField(field: AdminFieldDefinition, input: unknown): AdminContentValue`
- `orcidValid`：`function orcidValid(value: string): boolean`
- `normalizeDoi`：`function normalizeDoi(value: string): string | null`
- `dateOrder`：`function dateOrder(errors: Record<string, string>, values: Readonly<Record<string, AdminContentValue>>, start: string, end: string, message: string): void`
- `validateCombined`：`function validateCombined(definition: AdminContentModuleDefinition, values: Record<string, AdminContentValue>, errors: Record<string, string>, enforceRequired: boolean): void`
- `normalizeAdminContentValues`：`export function normalizeAdminContentValues( definition: AdminContentModuleDefinition, input: unknown, mode: 'create' | 'update' | 'batch', existing?: Readonly<Record<string, Admi…`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `NormalizedAdminContentValues` | 接口，第 157 行 | 约束 Normalized Admin Content Values 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
