# server / media / r2-store.ts

## 文件定位

- **源码路径**：`server/media/r2-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：184 行，8329 字节
- **内容校验**：SHA-256 `7f2163442a582072e38e22bf7d09de48bd77990b8bc66f0065ddc6649077189d`

## 直接依赖

- `./errors`
- `./object-key`
- `./store`

## 直接调用方

- `server/adapters/media-cloudflare.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `checksumOf` | 函数，第 38 行 | 检查 Of 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `objectEtag` | 函数，第 45 行 | 封装 Etag 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `contentTypeOf` | 函数，第 57 行 | 根据 Type Of 返回对应的展示类型或颜色语义 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `normalizeObject` | 函数，第 66 行 | 规范化 Object，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `assertBucket` | 函数，第 81 行 | 检查 Bucket 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `R2MediaStore.constructor` | 构造方法，第 93 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts` 等模块导入使用。 |
| `R2MediaStore.rollbackCreatedObject` | 类方法，第 101 行 | 封装 Created Object 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts` 等模块导入使用。 |
| `R2MediaStore.head` | 类方法，第 107 行 | 封装 head 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts` 等模块导入使用。 |
| `R2MediaStore.read` | 类方法，第 116 行 | 读取或定位 read，向调用方返回匹配结果 | 由 `server/adapters/media-cloudflare.ts` 等模块导入使用。 |
| `R2MediaStore.put` | 类方法，第 137 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-cloudflare.ts` 等模块导入使用。 |
| `R2MediaStore.delete` | 类方法，第 174 行 | 移除或失效 delete，同时处理相关联状态 | 由 `server/adapters/media-cloudflare.ts` 等模块导入使用。 |

### 调用签名

- `checksumOf`：`function checksumOf(object: R2ObjectLike): string | null`
- `objectEtag`：`function objectEtag(object: R2ObjectLike): string`
- `contentTypeOf`：`function contentTypeOf(object: R2ObjectLike): string | null`
- `normalizeObject`：`function normalizeObject(object: R2ObjectLike, expectedKey: string, maxObjectBytes: number): StoredMediaHead`
- `assertBucket`：`function assertBucket(bucket: R2BucketLike): void`
- `R2MediaStore.constructor`：`constructor(private readonly bucket: R2BucketLike, options:`
- `R2MediaStore.rollbackCreatedObject`：`private async rollbackCreatedObject(key: string, created: R2ObjectLike): Promise<void>`
- `R2MediaStore.head`：`async head(keyInput: string): Promise<StoredMediaHead | null>`
- `R2MediaStore.read`：`async read(keyInput: string, options:`
- `R2MediaStore.put`：`async put(inputValue: PutMediaInput): Promise<StoredMediaHead>`
- `R2MediaStore.delete`：`async delete(keyInput: string): Promise<boolean>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `R2ObjectLike` | 接口，第 14 行 | 约束 R2 Object Like 的数据结构或可选值 |
| `R2ObjectBodyLike` | 接口，第 24 行 | 约束 R2 Object Body Like 的数据结构或可选值 |
| `R2Conditional` | 类型，第 25 行 | 约束 R2 Conditional 的数据结构或可选值 |
| `R2BucketLike` | 接口，第 26 行 | 约束 R2 Bucket Like 的数据结构或可选值 |
| `R2MediaStore` | 类，第 89 行 | 封装 R2 Media Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
