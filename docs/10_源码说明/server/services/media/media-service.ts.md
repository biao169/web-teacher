# server / services / media / media-service.ts

## 文件定位

- **源码路径**：`server/services/media/media-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：598 行，29020 字节
- **内容校验**：SHA-256 `c4752fd0055d6e2de39f67dd87d1e2b7c2f31e2041c7ca48969a037b57460d12`

## 直接依赖

- `../../../db/models`
- `../../../shared/contracts/media`
- `../../../shared/enums/auth`
- `../../../shared/enums/media`
- `../../../shared/utils/unicode`
- `../../cache/invalidation-map`
- `../../media/errors`
- `../../media/grants`
- `../../media/http`
- `../../media/object-key`
- `../../media/store`
- `../../security/bytes`
- `../../security/permissions`
- `../../security/visibility`
- `./media-catalog-store`

## 直接调用方

- `server/adapters/media-cloudflare.ts`
- `server/adapters/media-node.ts`
- `server/services/public/modules/courses.ts`
- `server/services/public/modules/news.ts`
- `server/services/public/modules/patents.ts`
- `server/services/public/modules/projects.ts`
- `server/services/public/modules/publications.ts`
- `server/services/public/modules/research.ts`
- `server/services/public/modules/students.ts`
- `server/services/public/modules/team.ts`
- `server/services/public/public-home-service.ts`
- `server/services/public/public-module-base.ts`
- `server/services/public/public-shell-service.ts`
- `server/utils/media-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `storeFor` | 函数，第 71 行 | 封装 For 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `defaultFileName` | 函数，第 77 行 | 封装 File Name 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `boundedText` | 函数，第 86 行 | 封装 Text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `dimension` | 函数，第 96 行 | 封装 dimension 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `boundedIdentifier` | 函数，第 102 行 | 封装 Identifier 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `validateProjectionRequest` | 函数，第 112 行 | 检查 Projection Request 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `expectedKind` | 函数，第 135 行 | 封装 Kind 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `missing` | 函数，第 142 行 | 封装 missing 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `projectionAllowed` | 函数，第 151 行 | 封装 Allowed 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `publicProjection` | 函数，第 159 行 | 封装 Projection 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `normalizedAssetKey` | 函数，第 163 行 | 规范化 Asset Key，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `mediaAssetRevision` | 函数，第 167 行 | 封装 Asset Revision 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts`、`server/adapters/media-node.ts`、`server/services/public/modules/courses.ts` 等模块导入使用。 |
| `generationVector` | 函数，第 173 行 | 封装 Vector 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `generationsMatch` | 函数，第 183 行 | 封装 Match 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `sameStoredObject` | 函数，第 187 行 | 封装 Stored Object 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `digestHex` | 函数，第 195 行 | 封装 Hex 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `checksumBody` | 函数，第 200 行 | 检查 Body 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `readExactBytes` | 函数，第 229 行 | 按已声明大小完整读取流并拒绝短读或超量数据 | 媒体备份及现有对象校验调用。 |
| `MediaService.readForBackup` | 类方法，第 288 行 | 稳定读取 Local/R2 对象，并核对目录元数据与 SHA-256 | 传输服务导出媒体快照时调用。 |
| `MediaService.restoreFromBackup` | 类方法，第 303 行 | 校验负载、复用同内容对象或写入目标 Local/R2 | 传输服务应用媒体快照时调用。 |
| `MediaService.rollbackBackupRestore` | 类方法，第 334 行 | 删除本次恢复新创建的对象 | 数据库恢复失败的补偿路径调用。 |
| `MediaService.constructor` | 构造方法，第 238 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts`、`server/adapters/media-node.ts`、`server/services/public/modules/courses.ts` 等模块导入使用。 |
| `MediaService.inspectStorage` | 类方法，第 250 行 | Checks catalog metadata against the configured Local/R2/static store without exposing storage paths. | 由 `server/adapters/media-cloudflare.ts`、`server/adapters/media-node.ts`、`server/services/public/modules/courses.ts` 等模块导入使用。 |
| `MediaService.project` | 类方法，第 319 行 | Projects an entire page's media, its policy and dependency vector in one catalog batch. | 由 `server/adapters/media-cloudflare.ts`、`server/adapters/media-node.ts`、`server/services/public/modules/courses.ts` 等模块导入使用。 |
| `MediaService.resolveView` | 类方法，第 404 行 | 读取或定位 View，向调用方返回匹配结果 | 由 `server/adapters/media-cloudflare.ts`、`server/adapters/media-node.ts`、`server/services/public/modules/courses.ts` 等模块导入使用。 |
| `MediaService.authorizeGrant` | 类方法，第 408 行 | 封装 Grant 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts`、`server/adapters/media-node.ts`、`server/services/public/modules/courses.ts` 等模块导入使用。 |
| `MediaService.deliver` | 类方法，第 414 行 | 封装 deliver 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts`、`server/adapters/media-node.ts`、`server/services/public/modules/courses.ts` 等模块导入使用。 |

### 调用签名

- `storeFor`：`function storeFor(stores: MediaStoreSet, kind: MediaStorageKind): MediaStore`
- `defaultFileName`：`function defaultFileName(asset: Row<'media_assets'>): string`
- `boundedText`：`function boundedText(value: string | null | undefined, fallback = ''): string`
- `dimension`：`function dimension(value: number | null | undefined): number | null`
- `boundedIdentifier`：`function boundedIdentifier(value: unknown, name: string, maxBytes = 256): string`
- `validateProjectionRequest`：`function validateProjectionRequest(request: MediaProjectionRequest): void`
- `expectedKind`：`function expectedKind(purpose: MediaPurpose): 'image' | 'pdf' | 'file'`
- `missing`：`function missing(request: MediaProjectionRequest): MissingMediaViewModel`
- `projectionAllowed`：`function projectionAllowed(request: MediaProjectionRequest, principal: AuthenticatedPrincipal | null): boolean`
- `publicProjection`：`function publicProjection(request: MediaProjectionRequest): boolean`
- `normalizedAssetKey`：`function normalizedAssetKey(asset: Row<'media_assets'>): string`
- `mediaAssetRevision`：`export function mediaAssetRevision(asset: Row<'media_assets'>): string`
- `generationVector`：`function generationVector(tags: readonly string[], source: ReadonlyMap<string, number>): Readonly<Record<string, number>>`
- `generationsMatch`：`function generationsMatch(claims: MediaGrantClaims, current: ReadonlyMap<string, number>): boolean`
- `sameStoredObject`：`function sameStoredObject(expected: StoredMediaHead, actual: StoredMediaHead): boolean`
- `digestHex`：`function digestHex(bytes: Uint8Array): Promise<string>`
- `checksumBody`：`async function checksumBody(body: ReadableStream<Uint8Array>, expectedSize: number): Promise<string>`
- `MediaService.constructor`：`constructor( private readonly catalog: MediaCatalogStore, private readonly stores: MediaStoreSet, private readonly grants: MediaGrantService, options: MediaServiceOptions =`
- `MediaService.inspectStorage`：`async inspectStorage(asset: Row<'media_assets'>, options:`
- `MediaService.project`：`async project(requests: readonly MediaProjectionRequest[], principal: AuthenticatedPrincipal | null): Promise<MediaViewModel[]>`
- `MediaService.resolveView`：`async resolveView(request: MediaProjectionRequest, principal: AuthenticatedPrincipal | null): Promise<MediaViewModel>`
- `MediaService.authorizeGrant`：`private async authorizeGrant(input: MediaRequestInput, resolvePrincipal: PrincipalResolver): Promise<MediaGrantClaims>`
- `MediaService.deliver`：`async deliver(input: MediaRequestInput, resolvePrincipal: PrincipalResolver): Promise<MediaResponsePlan>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `MediaStoreSet` | 接口，第 30 行 | 约束 Media Store Set 的数据结构或可选值 |
| `MediaRequestInput` | 接口，第 36 行 | 约束 Media Request Input 的数据结构或可选值 |
| `MediaResponsePlan` | 接口，第 45 行 | 约束 Media Response Plan 的数据结构或可选值 |
| `MediaStorageInspection` | 接口，第 51 行 | 约束 Media Storage Inspection 的数据结构或可选值 |
| `PrincipalResolver` | 类型，第 65 行 | 约束 Principal Resolver 的数据结构或可选值 |
| `MediaServiceOptions` | 接口，第 224 行 | 约束 Media Service Options 的数据结构或可选值 |
| `PreparedProjection` | 接口，第 228 行 | 约束 Prepared Projection 的数据结构或可选值 |
| `MediaService` | 类，第 235 行 | 封装 Media Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
