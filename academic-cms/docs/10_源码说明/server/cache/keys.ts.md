# server / cache / keys.ts

## 文件定位

- **源码路径**：`server/cache/keys.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：95 行，4712 字节
- **内容校验**：SHA-256 `ac0aec1194239cd7217c91a6a0de1274bd3b959baa1279ab29b149e1cbbdc545`

## 直接依赖

- `../view-model/serializer`
- `./contracts`
- `./errors`

## 直接调用方

- `server/cache/cloudflare-adapter.ts`
- `server/cache/config.ts`
- `server/cache/generation-store.ts`
- `server/cache/invalidation-map.ts`
- `server/cache/public-cache.ts`
- `server/media/grants.ts`
- `server/services/media/media-catalog-store.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `validateCacheTag` | 函数，第 10 行 | 检查 Cache Tag 是否满足业务、安全或类型约束 | 由 `server/cache/cloudflare-adapter.ts`、`server/cache/config.ts`、`server/cache/generation-store.ts` 等模块导入使用。 |
| `normalizeCacheTags` | 函数，第 15 行 | 规范化 Cache Tags，消除不安全或不一致的输入形式 | 由 `server/cache/cloudflare-adapter.ts`、`server/cache/config.ts`、`server/cache/generation-store.ts` 等模块导入使用。 |
| `validateDescriptor` | 函数，第 20 行 | 检查 Descriptor 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `prepareCacheKey` | 函数，第 44 行 | 封装 Cache Key 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/cache/cloudflare-adapter.ts`、`server/cache/config.ts`、`server/cache/generation-store.ts` 等模块导入使用。 |
| `sameGenerationVector` | 函数，第 70 行 | 封装 Generation Vector 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/cache/cloudflare-adapter.ts`、`server/cache/config.ts`、`server/cache/generation-store.ts` 等模块导入使用。 |
| `normalizeCacheOrigin` | 函数，第 77 行 | 规范化 Cache Origin，消除不安全或不一致的输入形式 | 由 `server/cache/cloudflare-adapter.ts`、`server/cache/config.ts`、`server/cache/generation-store.ts` 等模块导入使用。 |
| `cacheRequestUrl` | 函数，第 89 行 | 封装 Request Url 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/cache/cloudflare-adapter.ts`、`server/cache/config.ts`、`server/cache/generation-store.ts` 等模块导入使用。 |

### 调用签名

- `validateCacheTag`：`export function validateCacheTag(tag: string): string`
- `normalizeCacheTags`：`export function normalizeCacheTags(tags: readonly string[]): string[]`
- `validateDescriptor`：`function validateDescriptor(descriptor: PublicCacheDescriptor): Required<Pick<PublicCacheDescriptor, 'namespace' | 'resource' | 'tags' | 'schemaVersion'>> & Pick<PublicCacheDescri…`
- `prepareCacheKey`：`export async function prepareCacheKey(descriptor: PublicCacheDescriptor, snapshot: CacheGenerationSnapshot): Promise<PreparedCacheKey>`
- `sameGenerationVector`：`export function sameGenerationVector(prepared: PreparedCacheKey, snapshot: CacheGenerationSnapshot): boolean`
- `normalizeCacheOrigin`：`export function normalizeCacheOrigin(origin: string): string`
- `cacheRequestUrl`：`export function cacheRequestUrl(origin: string, physicalKey: string): string`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PreparedCacheKey` | 接口，第 37 行 | 约束 Prepared Cache Key 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
