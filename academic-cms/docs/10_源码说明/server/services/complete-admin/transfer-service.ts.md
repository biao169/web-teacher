# server / services / complete-admin / transfer-service.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/transfer-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：481 行，31098 字节
- **内容校验**：SHA-256 `a6123c68fbe32f6fa637cd489c7f47c1a07da83e70b6cc7f44b322fdeae326b9`

## 直接依赖

- `../../utils/complete-admin/auth`
- `../../utils/complete-admin/csv`
- `../../utils/complete-admin/db`
- `../../cache/invalidation-map`
- `h3`
- `~~/shared/complete-admin/core.mjs`
- `~~/shared/enums/auth`

## 直接调用方

- `server/api/v1/admin/complete/import-export/apply.post.ts`
- `server/api/v1/admin/complete/import-export/export.post.ts`
- `server/api/v1/admin/complete/import-export/preview.post.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `identifier` | 函数，第 47 行 | 封装 identifier 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 11 次。 |
| `base64Url` | 函数，第 51 行 | 封装 Url 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `fromBase64Url` | 函数，第 56 行 | 封装 Base64 Url 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `ownedBuffer` | 函数，第 64 行 | 封装 Buffer 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `modeValue` | 函数，第 69 行 | 封装 Value 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `deriveBackupKey` | 函数，第 74 行 | 封装 Backup Key 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `encryptBackup` | 函数，第 80 行 | 完成 Backup 的安全计算或凭据处理 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `decryptBackup` | 函数，第 89 行 | 完成 Backup 的安全计算或凭据处理 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `digest` | 函数，第 102 行 | 封装 digest 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `tableColumns` | 函数，第 106 行 | 封装 Columns 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `currentSchemaVersion` | 函数，第 110 行 | 封装 Schema Version 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `validateSchemaVersion` | 函数，第 116 行 | 检查 Schema Version 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `safeScalar` | 函数，第 122 行 | 封装 Scalar 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `summarizeEnvelope` | 函数，第 128 行 | 封装 Envelope 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `decodeInput` | 函数，第 141 行 | 解析 Input 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `decodeMediaObjects` | 函数，第 131 行 | 严格解码并限制加密信封中的媒体实体清单 | 由备份输入解码流程调用。 |
| `validateMediaObjectCatalog` | 函数，第 212 行 | 对照 `media_assets` 校验对象键、类型、大小与摘要 | 预检和正式恢复共同调用。 |
| `prepareTables` | 函数，第 162 行 | 校验恢复记录，并按备份内原始新旧顺序生成晚于目标库旧记录的更新时间，保证跨平台恢复后的有效配置一致 | 仅在恢复预检和正式提交阶段使用。 |
| `cacheTagsForRestoredTables` | 函数，第 202 行 | 将恢复表映射到统一缓存失效模块，生成前台与后台实际订阅的规范标签 | 正式提交前生成同事务缓存版本操作。 |
| `chunks` | 函数，第 181 行 | 封装 chunks 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `buildUpsert` | 函数，第 196 行 | 根据输入组装 Upsert 所需的结果对象或结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `audit` | 函数，第 209 行 | 封装 audit 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `rollbackRestoredMedia` | 函数，第 307 行 | 逆序补偿删除本次新创建对象，并显式报告补偿失败 | 媒体写入、SQL 组装或数据库批处理失败时调用。 |
| `previewAdminBackup` | 函数，第 213 行 | 封装 Admin Backup 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/import-export/apply.post.ts`、`server/api/v1/admin/complete/import-export/export.post.ts`、`server/api/v1/admin/complete/import-export/preview.post.ts` 等模块导入使用。 |
| `CompleteAdminTransferService.constructor` | 构造方法，第 240 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/import-export/apply.post.ts`、`server/api/v1/admin/complete/import-export/export.post.ts`、`server/api/v1/admin/complete/import-export/preview.post.ts` 等模块导入使用。 |
| `CompleteAdminTransferService.db` | 类方法，第 241 行 | 封装 db 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/import-export/apply.post.ts`、`server/api/v1/admin/complete/import-export/export.post.ts`、`server/api/v1/admin/complete/import-export/preview.post.ts` 等模块导入使用。 |
| `CompleteAdminTransferService.export` | 类方法，第 243 行 | 封装 export 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/import-export/apply.post.ts`、`server/api/v1/admin/complete/import-export/export.post.ts`、`server/api/v1/admin/complete/import-export/preview.post.ts` 等模块导入使用。 |
| `CompleteAdminTransferService.preview` | 类方法，第 283 行 | 封装 preview 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/api/v1/admin/complete/import-export/apply.post.ts`、`server/api/v1/admin/complete/import-export/export.post.ts`、`server/api/v1/admin/complete/import-export/preview.post.ts` 等模块导入使用。 |
| `CompleteAdminTransferService.apply` | 类方法，第 292 行 | 执行 apply 所代表的完整处理流程 | 由 `server/api/v1/admin/complete/import-export/apply.post.ts`、`server/api/v1/admin/complete/import-export/export.post.ts`、`server/api/v1/admin/complete/import-export/preview.post.ts` 等模块导入使用。 |

### 调用签名

- `identifier`：`function identifier(value: string): string`
- `base64Url`：`function base64Url(bytes: Uint8Array): string`
- `fromBase64Url`：`function fromBase64Url(value: string): Uint8Array`
- `ownedBuffer`：`function ownedBuffer(value: Uint8Array): ArrayBuffer`
- `modeValue`：`function modeValue(value: unknown): RestoreMode`
- `deriveBackupKey`：`async function deriveBackupKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey>`
- `encryptBackup`：`async function encryptBackup(value: unknown, passphrase: string): Promise<Record<string, unknown>>`
- `decryptBackup`：`async function decryptBackup(value: unknown, passphrase: string): Promise<unknown>`
- `digest`：`async function digest(value: unknown): Promise<string>`
- `tableColumns`：`async function tableColumns(db: SqlAdapter, table: string): Promise<string[]>`
- `currentSchemaVersion`：`async function currentSchemaVersion(db: SqlAdapter): Promise<string>`
- `validateSchemaVersion`：`function validateSchemaVersion(value: unknown, current: string): string`
- `safeScalar`：`function safeScalar(value: unknown): Scalar`
- `summarizeEnvelope`：`function summarizeEnvelope(envelope: BackupEnvelope):`
- `decodeInput`：`async function decodeInput(input: unknown): Promise<BackupEnvelope>`
- `prepareTables`：`async function prepareTables(db: SqlAdapter, envelope: BackupEnvelope, now: string): Promise<PreparedTable[]>`
- `cacheTagsForRestoredTables`：`async function cacheTagsForRestoredTables(tables: ReadonlySet<string>): Promise<string[]>`
- `chunks`：`function chunks(rows: Record<string, Scalar>[]): Record<string, Scalar>[][]`
- `buildUpsert`：`function buildUpsert(table: PreparedTable, mode: RestoreMode): SqlOperation[]`
- `audit`：`function audit(principal: AdminPrincipal, action: string, summary: string, detail: unknown, now: string): SqlOperation`
- `previewAdminBackup`：`export async function previewAdminBackup(db: SqlAdapter, envelope: BackupEnvelope, mode: RestoreMode): Promise<Record<string, unknown>>`
- `CompleteAdminTransferService.constructor`：`constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal)`
- `CompleteAdminTransferService.db`：`private async db(): Promise<SqlAdapter>`
- `CompleteAdminTransferService.export`：`async export(input: unknown): Promise<Record<string, unknown>>`
- `CompleteAdminTransferService.preview`：`async preview(input: unknown): Promise<Record<string, unknown>>`
- `CompleteAdminTransferService.apply`：`async apply(input: unknown): Promise<Record<string, unknown>>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `TRANSFER_TABLES` | 导出常量，第 7 行 | 提供 TRANSFER TABLES 的共享配置或不可变数据 |
| `RestoreMode` | 类型，第 22 行 | 约束 Restore Mode 的数据结构或可选值 |
| `Scalar` | 类型，第 23 行 | 约束 Scalar 的数据结构或可选值 |
| `JsonRecord` | 类型，第 24 行 | 约束 Json Record 的数据结构或可选值 |
| `BackupEnvelope` | 接口，第 26 行 | 约束 Backup Envelope 的数据结构或可选值 |
| `EncryptedBackupEnvelope` | 接口，第 34 行 | 约束 Encrypted Backup Envelope 的数据结构或可选值 |
| `PreparedTable` | 接口，第 41 行 | 约束 Prepared Table 的数据结构或可选值 |
| `CompleteAdminTransferService` | 类，第 239 行 | 封装 Complete Admin Transfer Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
- 配置恢复、数据写入、审计日志与缓存 generation 递增必须处于同一个数据库事务；禁止恢复成功后再异步补清缓存。
- 加密备份可选携带最多 100 个、合计 24 MiB 的 Local/R2 实体；`external`、`static` 与更大对象库仍由部署层同步。
- 媒体恢复与数据库事务之间采用补偿事务：只回滚本次新建对象，绝不删除恢复前已存在并复用的对象。
