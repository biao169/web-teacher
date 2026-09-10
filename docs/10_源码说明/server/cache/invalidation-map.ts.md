# server / cache / invalidation-map.ts

## 文件定位

- **源码路径**：`server/cache/invalidation-map.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：73 行，3711 字节
- **内容校验**：SHA-256 `d4fd20e8f92dc9028200f333754bfe0fe6a1ffda7e4fef60ff5cf374d2bb4454`

## 直接依赖

- `../../shared/enums/auth`
- `../../shared/utils/unicode`
- `../view-model/serializer`
- `./contracts`
- `./errors`
- `./generation-store`
- `./keys`

## 直接调用方

- `server/services/admin/content-store.ts`
- `server/services/media/media-service.ts`
- `server/services/public/public-module-base.ts`
- `server/utils/cache-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `cacheRecordTag` | 函数，第 38 行 | 封装 Record Tag 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/admin/content-store.ts`、`server/services/media/media-service.ts`、`server/services/public/public-module-base.ts` 等模块导入使用。 |
| `cacheTagsForMutation` | 函数，第 47 行 | 封装 Tags For Mutation 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/admin/content-store.ts`、`server/services/media/media-service.ts`、`server/services/public/public-module-base.ts` 等模块导入使用。 |
| `CacheInvalidator.constructor` | 构造方法，第 68 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/admin/content-store.ts`、`server/services/media/media-service.ts`、`server/services/public/public-module-base.ts` 等模块导入使用。 |
| `CacheInvalidator.invalidate` | 类方法，第 69 行 | 移除或失效 invalidate，同时处理相关联状态 | 由 `server/services/admin/content-store.ts`、`server/services/media/media-service.ts`、`server/services/public/public-module-base.ts` 等模块导入使用。 |

### 调用签名

- `cacheRecordTag`：`export async function cacheRecordTag(module: AuthModule, uid: string): Promise<string>`
- `cacheTagsForMutation`：`export async function cacheTagsForMutation(mutation: CacheMutation): Promise<string[]>`
- `CacheInvalidator.constructor`：`constructor(private readonly generations: CacheGenerationStore)`
- `CacheInvalidator.invalidate`：`async invalidate(mutation: CacheMutation, at?: string): Promise<CacheGenerationSnapshot>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CacheMutation` | 接口，第 31 行 | 约束 Cache Mutation 的数据结构或可选值 |
| `CacheInvalidator` | 类，第 67 行 | 封装 Cache Invalidator 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
