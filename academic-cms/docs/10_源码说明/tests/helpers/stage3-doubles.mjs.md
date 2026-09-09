# tests / helpers / stage3-doubles.mjs

## 文件定位

- **源码路径**：`tests/helpers/stage3-doubles.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：214 行，7017 字节
- **内容校验**：SHA-256 `3096a884e1894c2b964c0a55d9cb580b2693e73c454b72e6dc2a05e73d120453`

## 直接依赖

- `node:crypto`

## 直接调用方

- `tests/stage3/adversarial-round2.spec.mjs`
- `tests/stage3/cache.spec.mjs`
- `tests/stage3/integration-hardening.spec.mjs`
- `tests/stage3/media-storage.spec.mjs`
- `tests/stage3/runtime-contract.spec.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `streamBytes` | 函数，第 3 行 | 封装 Bytes 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `bodyBytes` | 函数，第 7 行 | 封装 Bytes 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `sha256` | 函数，第 15 行 | 封装 sha256 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `R2BucketDouble.constructor` | 构造方法，第 20 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `R2BucketDouble.metadata` | 类方法，第 27 行 | 整理 metadata 的元数据，供展示或后续处理使用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `R2BucketDouble.head` | 类方法，第 40 行 | 封装 head 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `R2BucketDouble.get` | 类方法，第 46 行 | 读取或定位 get，向调用方返回匹配结果 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `R2BucketDouble.put` | 类方法，第 67 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `R2BucketDouble.delete` | 类方法，第 86 行 | 移除或失效 delete，同时处理相关联状态 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `CacheDouble.constructor` | 构造方法，第 93 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `CacheDouble.match` | 类方法，第 97 行 | 封装 match 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `CacheDouble.put` | 类方法，第 102 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `CacheDouble.delete` | 类方法，第 106 行 | 移除或失效 delete，同时处理相关联状态 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `InMemoryMediaStore.constructor` | 构造方法，第 113 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `InMemoryMediaStore.seed` | 类方法，第 119 行 | 创建 seed，并完成初始化或持久化处理 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `InMemoryMediaStore.headValue` | 类方法，第 129 行 | 封装 Value 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `InMemoryMediaStore.head` | 类方法，第 139 行 | 封装 head 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `InMemoryMediaStore.read` | 类方法，第 144 行 | 读取或定位 read，向调用方返回匹配结果 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `InMemoryMediaStore.put` | 类方法，第 159 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `InMemoryMediaStore.delete` | 类方法，第 166 行 | 移除或失效 delete，同时处理相关联状态 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `principal` | 函数，第 172 行 | 封装 principal 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |
| `seedMediaAsset` | 函数，第 193 行 | 创建 Media Asset，并完成初始化或持久化处理 | 由 `tests/stage3/adversarial-round2.spec.mjs`、`tests/stage3/cache.spec.mjs`、`tests/stage3/integration-hardening.spec.mjs` 等模块导入使用。 |

### 调用签名

- `streamBytes`：`export async function streamBytes(stream)`
- `bodyBytes`：`export async function bodyBytes(body)`
- `sha256`：`export function sha256(bytes)`
- `R2BucketDouble.constructor`：`constructor(now = () => new Date('2026-08-29T00:00:00.000Z'))`
- `R2BucketDouble.metadata`：`metadata(key, record, extra =`
- `R2BucketDouble.head`：`async head(key)`
- `R2BucketDouble.get`：`async get(key, options =`
- `R2BucketDouble.put`：`async put(key, body, options =`
- `R2BucketDouble.delete`：`async delete(keyOrKeys)`
- `CacheDouble.constructor`：`constructor()`
- `CacheDouble.match`：`async match(request)`
- `CacheDouble.put`：`async put(request, response)`
- `CacheDouble.delete`：`async delete(request)`
- `InMemoryMediaStore.constructor`：`constructor(kind = 'r2', now = () => new Date('2026-08-29T00:00:00.000Z'))`
- `InMemoryMediaStore.seed`：`seed(key, bytes,`
- `InMemoryMediaStore.headValue`：`headValue(key, record)`
- `InMemoryMediaStore.head`：`async head(key)`
- `InMemoryMediaStore.read`：`async read(key, options =`
- `InMemoryMediaStore.put`：`async put(input)`
- `InMemoryMediaStore.delete`：`async delete(key)`
- `principal`：`export function principal(overrides =`
- `seedMediaAsset`：`export function seedMediaAsset(db, input =`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `R2BucketDouble` | 类，第 19 行 | 封装 R2 Bucket Double 的状态与业务行为 |
| `CacheDouble` | 类，第 92 行 | 封装 Cache Double 的状态与业务行为 |
| `InMemoryMediaStore` | 类，第 112 行 | 封装 In Memory Media Store 的状态与业务行为 |

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
