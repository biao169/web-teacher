# shared / complete-admin / core.d.ts

## 文件定位

- **源码路径**：`shared/complete-admin/core.d.ts`
- **文件类型**：程序模块
- **功能定位**：前后端共享模块；提供跨运行时复用的类型、工具或后台定义。
- **规模**：27 行，1955 字节
- **内容校验**：SHA-256 `05e39b0e6e1339e3a0801e1e4e471f29fb7bbbba3d1c5e98cc97c8d2b55c0332`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `getResource` | 函数，第 7 行 | 读取或定位 Resource，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `assertPlainObject` | 函数，第 8 行 | 检查 Plain Object 是否满足业务、安全或类型约束 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizeUid` | 函数，第 9 行 | 规范化 Uid，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizeObjectKey` | 函数，第 10 行 | 规范化 Object Key，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizePage` | 函数，第 11 行 | 规范化 Page，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizePageSize` | 函数，第 12 行 | 规范化 Page Size，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizeSearch` | 函数，第 13 行 | 规范化 Search，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizeDirection` | 函数，第 14 行 | 规范化 Direction，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizeFieldValue` | 函数，第 15 行 | 规范化 Field Value，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizeRecordInput` | 函数，第 16 行 | 规范化 Record Input，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `validateNavigation` | 函数，第 17 行 | 检查 Navigation 是否满足业务、安全或类型约束 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `detectMediaSignature` | 函数，第 18 行 | 封装 Media Signature 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `detectImageDimensions` | 函数，第 19 行 | 封装 Image Dimensions 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `validateRichTextDocument` | 函数，第 20 行 | 检查 Rich Text Document 是否满足业务、安全或类型约束 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `renderRichTextDocument` | 函数，第 21 行 | 把 Rich Text Document 转换为展示、传输或存储所需格式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `normalizeBatchRequest` | 函数，第 22 行 | 规范化 Batch Request，消除不安全或不一致的输入形式 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `createBackupEnvelope` | 函数，第 23 行 | 创建 Backup Envelope，并完成初始化或持久化处理 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `parseBackupEnvelope` | 函数，第 24 行 | 解析 Backup Envelope 的输入格式，并输出受约束的数据结构 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `redactSensitive` | 函数，第 25 行 | 封装 Sensitive 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `buildTranslationProviderRequest` | 函数，第 26 行 | 根据输入组装 Translation Provider Request 所需的结果对象或结构 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `getResource`：`export function getResource(key: string): any;`
- `assertPlainObject`：`export function assertPlainObject(value: unknown, code?: string): Record<string, any>;`
- `normalizeUid`：`export function normalizeUid(value: unknown): string;`
- `normalizeObjectKey`：`export function normalizeObjectKey(value: unknown): string;`
- `normalizePage`：`export function normalizePage(value: unknown): number;`
- `normalizePageSize`：`export function normalizePageSize(value: unknown): number;`
- `normalizeSearch`：`export function normalizeSearch(value: unknown): string;`
- `normalizeDirection`：`export function normalizeDirection(value: unknown): 'asc'|'desc';`
- `normalizeFieldValue`：`export function normalizeFieldValue(field: any, value: unknown, mode?: string): unknown;`
- `normalizeRecordInput`：`export function normalizeRecordInput(resourceKey: string, body: unknown, mode?: string):`
- `validateNavigation`：`export function validateNavigation(values: Record<string, unknown>): Record<string, unknown>;`
- `detectMediaSignature`：`export function detectMediaSignature(bytes: Uint8Array):`
- `detectImageDimensions`：`export function detectImageDimensions(bytes: Uint8Array, mime: string):`
- `validateRichTextDocument`：`export function validateRichTextDocument(input: unknown): any;`
- `renderRichTextDocument`：`export function renderRichTextDocument(input: unknown, mediaUrl?: (key: string) => string): string;`
- `normalizeBatchRequest`：`export function normalizeBatchRequest(resourceKey: string, input: unknown): any;`
- `createBackupEnvelope`：`export function createBackupEnvelope(tables: Record<string, unknown[]>, options?: Record<string, unknown>): any;`
- `parseBackupEnvelope`：`export function parseBackupEnvelope(input: unknown): any;`
- `redactSensitive`：`export function redactSensitive(value: unknown): unknown;`
- `buildTranslationProviderRequest`：`export function buildTranslationProviderRequest(provider: string, config: Record<string, unknown>, texts: string[], sourceLang?: string, targetLang?: string): any;`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PAGE_SIZES` | 导出常量，第 1 行 | 提供 PAGE SIZES 的共享配置或不可变数据 |
| `MAX_BATCH` | 导出常量，第 2 行 | 提供 MAX BATCH 的共享配置或不可变数据 |
| `MAX_EXPORT_ROWS` | 导出常量，第 3 行 | 提供 MAX EXPORT ROWS 的共享配置或不可变数据 |
| `MAX_BACKUP_BYTES` | 导出常量，第 4 行 | 提供 MAX BACKUP BYTES 的共享配置或不可变数据 |
| `MAX_UPLOAD_BYTES` | 导出常量，第 5 行 | 提供 MAX UPLOAD BYTES 的共享配置或不可变数据 |
| `RESOURCE_CATALOG` | 导出常量，第 6 行 | 提供 RESOURCE CATALOG 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
