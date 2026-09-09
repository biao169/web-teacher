# server / cache / generation-store.ts

## 文件定位

- **源码路径**：`server/cache/generation-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：58 行，3114 字节
- **内容校验**：SHA-256 `7d7afaedebe159dca8d61dcb6c3502357b986d53a64b28a4e31e7a0c3cf98270`

## 直接依赖

- `../../db/contracts`
- `../../db/query`
- `./contracts`
- `./errors`
- `./keys`

## 直接调用方

- `server/cache/invalidation-map.ts`
- `server/cache/public-cache.ts`
- `server/utils/cache-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `parseGeneration` | 函数，第 9 行 | 解析 Generation 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `CacheGenerationStore.constructor` | 构造方法，第 19 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/cache/invalidation-map.ts`、`server/cache/public-cache.ts`、`server/utils/cache-runtime.ts` 等模块导入使用。 |
| `CacheGenerationStore.read` | 类方法，第 21 行 | 读取或定位 read，向调用方返回匹配结果 | 由 `server/cache/invalidation-map.ts`、`server/cache/public-cache.ts`、`server/utils/cache-runtime.ts` 等模块导入使用。 |
| `CacheGenerationStore.bump` | 类方法，第 34 行 | 封装 bump 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/cache/invalidation-map.ts`、`server/cache/public-cache.ts`、`server/utils/cache-runtime.ts` 等模块导入使用。 |

### 调用签名

- `parseGeneration`：`function parseGeneration(row: RawRow):`
- `CacheGenerationStore.constructor`：`constructor(private readonly adapter: DatabaseAdapter)`
- `CacheGenerationStore.read`：`async read(tags: readonly string[]): Promise<CacheGenerationSnapshot>`
- `CacheGenerationStore.bump`：`async bump(tags: readonly string[], at = new Date().toISOString()): Promise<CacheGenerationSnapshot>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CacheGenerationStore` | 类，第 18 行 | 封装 Cache Generation Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
