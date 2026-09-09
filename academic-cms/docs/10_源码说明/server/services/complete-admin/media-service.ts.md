# server / services / complete-admin / media-service.ts

## 文件定位

- **源码路径**：`server/services/complete-admin/media-service.ts`
- **文件类型**：程序/脚本
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：553 行，34153 字节
- **内容校验**：SHA-256 `855bc830ca1339aae80ca3e573e4d00a042117e3d65349a5f5516b8b2239665f`

## 直接依赖

- `h3`
- `~~/shared/complete-admin/core.mjs`
- `../../../db/models`
- `../../utils/complete-admin/auth`
- `../../utils/auth-runtime`
- `../../utils/media-runtime`
- `../../utils/complete-admin/db`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `usageAdminPath` | 函数，第 50 行 | 封装 Admin Path 相关逻辑，供本文件或上层模块按其参数调用 |
| `r2FromEvent` | 函数，第 65 行 | 封装 From Event 相关逻辑，供本文件或上层模块按其参数调用 |
| `localRoot` | 函数，第 75 行 | 封装 Root 相关逻辑，供本文件或上层模块按其参数调用 |
| `localPath` | 函数，第 83 行 | 封装 Path 相关逻辑，供本文件或上层模块按其参数调用 |
| `putLocal` | 函数，第 92 行 | 封装 Local 相关逻辑，供本文件或上层模块按其参数调用 |
| `deleteLocal` | 函数，第 108 行 | 移除或失效 Local，同时处理相关联状态 |
| `digestHex` | 函数，第 114 行 | 封装 Hex 相关逻辑，供本文件或上层模块按其参数调用 |
| `identifier` | 函数，第 120 行 | 仅允许白名单格式的 SQL 标识符，再用双引号引用。 |
| `audit` | 函数，第 125 行 | 封装 audit 相关逻辑，供本文件或上层模块按其参数调用 |
| `moveLocal` | 函数，第 130 行 | 封装 Local 相关逻辑，供本文件或上层模块按其参数调用 |
| `moveR2` | 函数，第 139 行 | 封装 R2 相关逻辑，供本文件或上层模块按其参数调用 |
| `cacheGeneration` | 函数，第 152 行 | 封装 Generation 相关逻辑，供本文件或上层模块按其参数调用 |
| `constructor` | 构造方法，第 157 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 |
| `upload` | 方法，第 159 行 | 封装 upload 相关逻辑，供本文件或上层模块按其参数调用 |
| `media` | 方法，第 217 行 | 封装 media 相关逻辑，供本文件或上层模块按其参数调用 |
| `stats` | 方法，第 225 行 | 封装 stats 相关逻辑，供本文件或上层模块按其参数调用 |
| `usage` | 方法，第 251 行 | 封装 usage 相关逻辑，供本文件或上层模块按其参数调用 |
| `usageSummary` | 方法，第 280 行 | 文件内部的 `usageSummary` 实现；按下方完整调用签名传入参数，参与本文件“服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。”所述流程。 |
| `check` | 方法，第 311 行 | 检查 check 是否满足业务、安全或类型约束 |
| `scan` | 方法，第 317 行 | 收集 scan 对应的数据集合，并应用必要的范围或过滤规则 |
| `previews` | 方法，第 330 行 | 封装 previews 相关逻辑，供本文件或上层模块按其参数调用 |
| `previewsByObjectKeys` | 方法，第 356 行 | 文件内部的 `previewsByObjectKeys` 实现；按下方完整调用签名传入参数，参与本文件“服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。”所述流程。 |
| `preview` | 方法，第 382 行 | 文件内部的 `preview` 实现；按下方完整调用签名传入参数，参与本文件“服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。”所述流程。 |
| `setStatus` | 方法，第 387 行 | 更新 Status，并保持状态、校验与持久化结果一致 |
| `updateMetadata` | 方法，第 412 行 | 整理 Metadata 的元数据，供展示或后续处理使用 |
| `normalize` | 函数变量，第 420 行 | 规范化 normalize，消除不安全或不一致的输入形式 |
| `batchStatus` | 方法，第 440 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 |
| `purge` | 方法，第 485 行 | 移除或失效 purge，同时处理相关联状态 |
| `cleanupExpired` | 方法，第 530 行 | 移除或失效 Expired，同时处理相关联状态 |

### 调用签名

- `usageAdminPath`：`function usageAdminPath(table: string, uidValue: unknown, richText = false): string | null`
- `r2FromEvent`：`function r2FromEvent(event: H3Event): R2BucketLike | null`
- `localRoot`：`async function localRoot(event: H3Event): Promise<string>`
- `localPath`：`async function localPath(event: H3Event, objectKey: string): Promise<string>`
- `putLocal`：`async function putLocal(event: H3Event, objectKey: string, bytes: Uint8Array): Promise<void>`
- `deleteLocal`：`async function deleteLocal(event: H3Event, objectKey: string): Promise<void>`
- `digestHex`：`async function digestHex(bytes: Uint8Array): Promise<string>`
- `identifier`：`function identifier(value: string): string`
- `audit`：`function audit(principal: AdminPrincipal, action: string, targetUid: string, summary: string, detail: unknown, now: string): SqlOperation`
- `moveLocal`：`async function moveLocal(event: H3Event, sourceKey: string, targetKey: string): Promise<void>`
- `moveR2`：`async function moveR2(bucket: R2BucketLike, sourceKey: string, targetKey: string): Promise<void>`
- `cacheGeneration`：`function cacheGeneration(now: string): SqlOperation`
- `constructor`：`constructor(private readonly event: H3Event, private readonly principal: AdminPrincipal)`
- `upload`：`async upload(): Promise<Record<string, unknown>>`
- `media`：`private async media(uidValue: unknown): Promise<Row<'media_assets'>>`
- `stats`：`async stats(): Promise<Record<string, unknown>>`
- `usage`：`async usage(uidValue: unknown): Promise<Record<string, unknown>>`
- `usageSummary`：`async usageSummary(uidValues: readonly unknown[]): Promise<Record<string, unknown>>`
- `check`：`async check(uidValue: unknown, deep = false): Promise<Record<string, unknown>>`
- `scan`：`async scan(uidValues: readonly unknown[], deep = false): Promise<Record<string, unknown>>`
- `previews`：`async previews(uidValues: readonly unknown[]): Promise<Record<string, unknown>>`
- `previewsByObjectKeys`：`async previewsByObjectKeys(keyValues: readonly unknown[]): Promise<Record<string, unknown>>`
- `preview`：`async preview(uidValue: unknown, rangeHeader?: string | null)`
- `setStatus`：`async setStatus(uidValue: unknown, statusValue: unknown, expectedUpdatedAt: unknown): Promise<Record<string, unknown>>`
- `updateMetadata`：`async updateMetadata(uidValue: unknown, body: unknown): Promise<Record<string, unknown>>`
- `normalize`：`normalize = (value: unknown, maximum: number): string | null => …`
- `batchStatus`：`async batchStatus(body: unknown): Promise<{ updated: number }>`
- `purge`：`async purge(uidValue: unknown, expectedUpdatedAt: unknown): Promise<{ purged: true }>`
- `cleanupExpired`：`async cleanupExpired(limitValue: unknown): Promise<Record<string, unknown>>`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
