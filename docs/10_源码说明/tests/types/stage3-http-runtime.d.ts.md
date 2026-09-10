# tests / types / stage3-http-runtime.d.ts

## 文件定位

- **源码路径**：`tests/types/stage3-http-runtime.d.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：20 行，954 字节
- **内容校验**：SHA-256 `6ac9443a2d66e2ea8f55abdef4447e795bb53e66eadbbd5d10497e7729ab4ad4`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `getQuery` | 内部函数，第 2 行 | 读取或定位 Query，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `getRouterParam` | 内部函数，第 3 行 | 读取或定位 Router Param，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `sendStream` | 内部函数，第 4 行 | 封装 Stream 相关逻辑，供本文件或上层模块按其参数调用 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `getPlatformMediaStores` | 内部函数，第 11 行 | 读取或定位 Platform Media Stores，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |
| `getPlatformCache` | 内部函数，第 18 行 | 读取或定位 Platform Cache，向调用方返回匹配结果 | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `getQuery`：`export function getQuery(event: H3Event): Record<string, string | string[] | undefined>`
- `getRouterParam`：`export function getRouterParam(event: H3Event, name: string, options?:`
- `sendStream`：`export function sendStream(event: H3Event, stream: ReadableStream<Uint8Array>): unknown`
- `getPlatformMediaStores`：`export function getPlatformMediaStores(event: H3Event, config: MediaRuntimeConfig): MediaStoreSet`
- `getPlatformCache`：`export function getPlatformCache(event: H3Event, config: CacheRuntimeConfig): RawCacheAdapter`

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
