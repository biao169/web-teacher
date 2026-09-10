# server / cache / memory-adapter.ts

## 文件定位

- **源码路径**：`server/cache/memory-adapter.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：117 行，4162 字节
- **内容校验**：SHA-256 `ef4e952af5932ba0a8693c4dc0b25158c5144d3f2c16853db653466b01e555bd`

## 直接依赖

- `./config`
- `./contracts`
- `./errors`

## 直接调用方

- `server/adapters/cache-node.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `cacheEtag` | 函数，第 19 行 | 封装 Etag 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `MemoryCacheAdapter.constructor` | 构造方法，第 37 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.time` | 类方法，第 49 行 | 封装 time 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.remove` | 类方法，第 57 行 | 移除或失效 remove，同时处理相关联状态 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.evict` | 类方法，第 65 行 | 封装 evict 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.get` | 类方法，第 74 行 | 读取或定位 get，向调用方返回匹配结果 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.put` | 类方法，第 88 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.delete` | 类方法，第 103 行 | 移除或失效 delete，同时处理相关联状态 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.clear` | 类方法，第 109 行 | 移除或失效 clear，同时处理相关联状态 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.size` | 类方法，第 114 行 | 封装 size 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |
| `MemoryCacheAdapter.bytes` | 类方法，第 115 行 | 封装 bytes 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/cache-node.ts` 等模块导入使用。 |

### 调用签名

- `cacheEtag`：`function cacheEtag(value: unknown): string | null`
- `MemoryCacheAdapter.constructor`：`constructor(options: MemoryCacheOptions =`
- `MemoryCacheAdapter.time`：`private time(): number`
- `MemoryCacheAdapter.remove`：`private remove(key: string): boolean`
- `MemoryCacheAdapter.evict`：`private evict(): void`
- `MemoryCacheAdapter.get`：`async get(key: string): Promise<RawCacheEntry | null>`
- `MemoryCacheAdapter.put`：`async put(key: string, entry: RawCacheEntry, retentionSeconds: number): Promise<void>`
- `MemoryCacheAdapter.delete`：`async delete(key: string): Promise<boolean>`
- `MemoryCacheAdapter.clear`：`clear(): void`
- `MemoryCacheAdapter.size`：`get size(): number`
- `MemoryCacheAdapter.bytes`：`get bytes(): number`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `StoredEntry` | 接口，第 5 行 | 约束 Stored Entry 的数据结构或可选值 |
| `MemoryCacheOptions` | 接口，第 12 行 | 约束 Memory Cache Options 的数据结构或可选值 |
| `MemoryCacheAdapter` | 类，第 27 行 | 封装 Memory Cache Adapter 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
