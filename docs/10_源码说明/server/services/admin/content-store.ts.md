# server / services / admin / content-store.ts

## 文件定位

- **源码路径**：`server/services/admin/content-store.ts`
- **文件类型**：程序/脚本
- **功能定位**：服务端持久化访问层；封装 SQL 查询和数据库读写，供业务服务调用。
- **规模**：300 行，19669 字节
- **内容校验**：SHA-256 `466186970f74b08107dd9da9291ea8c885311a063103ca751e05c25caa456ab1`

## 直接依赖

- `../../audit/commands`
- `../../cache/invalidation-map`
- `../../../db/codec`
- `../../../db/contracts`
- `../../../db/models`
- `../../../db/query`
- `../../../shared/admin/content-modules`
- `../../../shared/contracts/admin-content`
- `../../../shared/admin/identity`
- `../../security/permissions`
- `./content-errors`
- `./content-query`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `requiredText` | 函数，第 24 行 | 检查 Text 是否满足业务、安全或类型约束 |
| `normalizedAt` | 函数，第 29 行 | 规范化 At，消除不安全或不一致的输入形式 |
| `valueForView` | 函数，第 34 行 | 封装 For View 相关逻辑，供本文件或上层模块按其参数调用 |
| `projectedValues` | 函数，第 40 行 | 封装 Values 相关逻辑，供本文件或上层模块按其参数调用 |
| `decodeProjectedRow` | 函数，第 50 行 | 解析 Projected Row 的输入格式，并输出受约束的数据结构 |
| `listItem` | 函数，第 71 行 | 收集 Item 对应的数据集合，并应用必要的范围或过滤规则 |
| `detailView` | 函数，第 80 行 | 封装 View 相关逻辑，供本文件或上层模块按其参数调用 |
| `facetCommand` | 函数，第 92 行 | 封装 Command 相关逻辑，供本文件或上层模块按其参数调用 |
| `parseFacetRows` | 函数，第 98 行 | 解析 Facet Rows 的输入格式，并输出受约束的数据结构 |
| `permissionsFor` | 函数，第 110 行 | 封装 For 相关逻辑，供本文件或上层模块按其参数调用 |
| `monotonicTimestampSql` | 函数，第 120 行 | 封装 Timestamp Sql 相关逻辑，供本文件或上层模块按其参数调用 |
| `createCommand` | 函数，第 124 行 | 创建 Command，并完成初始化或持久化处理 |
| `updateCommand` | 函数，第 131 行 | 更新 Command，并保持状态、校验与持久化结果一致 |
| `guardInsertCommand` | 函数，第 143 行 | 封装 Insert Command 相关逻辑，供本文件或上层模块按其参数调用 |
| `batchGuardInsertCommand` | 函数，第 149 行 | 封装 Guard Insert Command 相关逻辑，供本文件或上层模块按其参数调用 |
| `batchUpdateCommand` | 函数，第 161 行 | 封装 Update Command 相关逻辑，供本文件或上层模块按其参数调用 |
| `deleteCommand` | 函数，第 173 行 | 移除或失效 Command，同时处理相关联状态 |
| `generationCommand` | 函数，第 177 行 | 封装 Command 相关逻辑，供本文件或上层模块按其参数调用 |
| `cleanupGuardCommand` | 函数，第 187 行 | 移除或失效 Guard Command，同时处理相关联状态 |
| `guardCondition` | 函数，第 188 行 | 封装 Condition 相关逻辑，供本文件或上层模块按其参数调用 |
| `assertMutationResults` | 函数，第 190 行 | 检查 Mutation Results 是否满足业务、安全或类型约束 |
| `constructor` | 构造方法，第 207 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 |
| `list` | 方法，第 212 行 | 收集 list 对应的数据集合，并应用必要的范围或过滤规则 |
| `find` | 方法，第 231 行 | 读取或定位 find，向调用方返回匹配结果 |
| `create` | 方法，第 237 行 | 创建 create，并完成初始化或持久化处理 |
| `update` | 方法，第 252 行 | 更新 update，并保持状态、校验与持久化结果一致 |
| `delete` | 方法，第 269 行 | 移除或失效 delete，同时处理相关联状态 |
| `batchUpdate` | 方法，第 285 行 | 封装 Update 相关逻辑，供本文件或上层模块按其参数调用 |

### 调用签名

- `requiredText`：`function requiredText(value: unknown, field: string, maximum = 2048): string`
- `normalizedAt`：`function normalizedAt(value: Date): string`
- `valueForView`：`function valueForView(value: unknown, field: string): AdminContentValue`
- `projectedValues`：`function projectedValues(definition: AdminContentModuleDefinition, row: Record<string, unknown>, detail: boolean): AdminContentValues`
- `decodeProjectedRow`：`function decodeProjectedRow(definition: AdminContentModuleDefinition, raw: RawRow): Record<string, unknown>`
- `listItem`：`function listItem(definition: AdminContentModuleDefinition, record: Record<string, unknown>): AdminContentListItem`
- `detailView`：`function detailView(definition: AdminContentModuleDefinition, row: Row<AdminContentModuleDefinition['table']>, permissions: AdminContentDetailView['permissions']): AdminContentDetailView`
- `facetCommand`：`function facetCommand(definition: AdminContentModuleDefinition, field: string): SqlCommand`
- `parseFacetRows`：`function parseFacetRows(rows: readonly RawRow[], field: string): readonly AdminFacetOption[]`
- `permissionsFor`：`function permissionsFor(principal: AuthenticatedPrincipal, definition: AdminContentModuleDefinition): AdminContentDetailView['permissions']`
- `monotonicTimestampSql`：`function monotonicTimestampSql(): string`
- `createCommand`：`function createCommand(definition: AdminContentModuleDefinition, uid: string, values: Readonly<Record<string, AdminContentValue>>, at: string): SqlCommand`
- `updateCommand`：`function updateCommand(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, values: Readonly<Record<string, AdminContentValue>>, at: string, guardUid: string): SqlCommand`
- `guardInsertCommand`：`function guardInsertCommand(definition: AdminContentModuleDefinition, guardUid: string, targetUid: string, expectedUpdatedAt: string, at: string): SqlCommand`
- `batchGuardInsertCommand`：`function batchGuardInsertCommand(definition: AdminContentModuleDefinition, guardUid: string, uids: readonly string[], versions: Readonly<Record<string, string>>, at: string): SqlCommand`
- `batchUpdateCommand`：`function batchUpdateCommand(definition: AdminContentModuleDefinition, guardUid: string, uids: readonly string[], values: Readonly<Record<string, AdminContentValue>>, at: string): SqlCommand`
- `deleteCommand`：`function deleteCommand(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, guardUid: string): SqlCommand`
- `generationCommand`：`function generationCommand(tag: string, at: string, guardUid?: string): SqlCommand`
- `cleanupGuardCommand`：`function cleanupGuardCommand(guardUid: string): SqlCommand`
- `guardCondition`：`function guardCondition(guardUid: string): { sql: string; params: readonly SqlValue[] }`
- `assertMutationResults`：`function assertMutationResults(results: readonly QueryResult[], expectedCacheRows: number, guarded: boolean, expectedRows = 1): void`
- `constructor`：`constructor(private readonly adapter: DatabaseAdapter, options: AdminContentStoreOptions = {})`
- `list`：`async list(definition: AdminContentModuleDefinition, query: ParsedAdminContentQuery, principal: AuthenticatedPrincipal): Promise<{ items: readonly AdminContentListItem[] total: number facets: Readonly<Record<string, readonly AdminFacetOption[]>> permissions: AdminContentDetailView['permissions'] }>`
- `find`：`async find(definition: AdminContentModuleDefinition, uid: string, principal: AuthenticatedPrincipal): Promise<AdminContentDetailView | null>`
- `create`：`async create(definition: AdminContentModuleDefinition, values: Readonly<Record<string, AdminContentValue>>, principal: AuthenticatedPrincipal, requestedUid?: string): Promise<AdminContentDetailView>`
- `update`：`async update(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, values: Readonly<Record<string, AdminContentValue>>, principal: AuthenticatedPrincipal): Promise<AdminContentDetailView>`
- `delete`：`async delete(definition: AdminContentModuleDefinition, uid: string, expectedUpdatedAt: string, principal: AuthenticatedPrincipal): Promise<void>`
- `batchUpdate`：`async batchUpdate(definition: AdminContentModuleDefinition, uids: readonly string[], versions: Readonly<Record<string, string>>, values: Readonly<Record<string, AdminContentValue>>, principal: AuthenticatedPrincipal): Promise<number>`

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
