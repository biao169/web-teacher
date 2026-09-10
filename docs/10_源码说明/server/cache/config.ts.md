# server / cache / config.ts

## 文件定位

- **源码路径**：`server/cache/config.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：43 行，2014 字节
- **内容校验**：SHA-256 `4922b5af89e716dd97732f6b6f1209a162b2f032cdcef619597f2abc43759923`

## 直接依赖

- `./errors`
- `./keys`

## 直接调用方

- `server/adapters/cache-cloudflare.ts`
- `server/adapters/cache-node.ts`
- `server/cache/cloudflare-adapter.ts`
- `server/cache/memory-adapter.ts`
- `server/cache/public-cache.ts`
- `server/utils/cache-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `integer` | 函数，第 16 行 | 封装 integer 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `parseCacheConfig` | 函数，第 26 行 | 解析 Cache Config 的输入格式，并输出受约束的数据结构 | 由 `server/adapters/cache-cloudflare.ts`、`server/adapters/cache-node.ts`、`server/cache/cloudflare-adapter.ts` 等模块导入使用。 |

### 调用签名

- `integer`：`function integer(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number`
- `parseCacheConfig`：`export function parseCacheConfig(raw: Record<string, unknown>): CacheRuntimeConfig`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CACHE_ENVELOPE_HEADROOM_BYTES` | 导出常量，第 4 行 | 提供 CACHE ENVELOPE HEADROOM BYTES 的共享配置或不可变数据 |
| `MAX_PUBLIC_CACHE_PAYLOAD_BYTES` | 导出常量，第 5 行 | 提供 MAX PUBLIC CACHE PAYLOAD BYTES 的共享配置或不可变数据 |
| `MAX_CACHE_RETENTION_SECONDS` | 导出常量，第 6 行 | 提供 MAX CACHE RETENTION SECONDS 的共享配置或不可变数据 |
| `CacheRuntimeConfig` | 接口，第 8 行 | 约束 Cache Runtime Config 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
