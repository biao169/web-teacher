# server / media / local-store.ts

## 文件定位

- **源码路径**：`server/media/local-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：280 行，12912 字节
- **内容校验**：SHA-256 `1abefe3794d096bcfe7e9e80040e40982898ad86a4ce35a997419e913d124889`

## 直接依赖

- `./errors`
- `./object-key`
- `./store`
- `node:crypto`
- `node:fs`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `server/adapters/media-node.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `within` | 函数，第 24 行 | 封装 within 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `localEtag` | 函数，第 28 行 | 封装 Etag 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `isErrno` | 函数，第 36 行 | 检查 Errno 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `closeQuietly` | 函数，第 40 行 | 关闭 Quietly 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `LocalMediaStore.constructor` | 构造方法，第 52 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.root` | 类方法，第 62 行 | 封装 root 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.location` | 类方法，第 73 行 | 封装 location 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.ensureParent` | 类方法，第 81 行 | 检查 Parent 是否满足业务、安全或类型约束 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.assertExistingPath` | 类方法，第 94 行 | 检查 Existing Path 是否满足业务、安全或类型约束 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.openRead` | 类方法，第 105 行 | 打开 Read 对应的界面或交互状态 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.head` | 类方法，第 142 行 | 封装 head 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.read` | 类方法，第 149 行 | 读取或定位 read，向调用方返回匹配结果 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `close` | 函数变量，第 170 行 | 关闭 close 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 13 次。 |
| `pull` | 对象方法，第 176 行 | 封装 pull 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `cancel` | 对象方法，第 191 行 | 检查 cancel 是否满足业务、安全或类型约束 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `LocalMediaStore.put` | 类方法，第 196 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |
| `LocalMediaStore.delete` | 类方法，第 264 行 | 移除或失效 delete，同时处理相关联状态 | 由 `server/adapters/media-node.ts` 等模块导入使用。 |

### 调用签名

- `within`：`function within(root: string, candidate: string): boolean`
- `localEtag`：`function localEtag(info:`
- `isErrno`：`function isErrno(error: unknown, code: string): boolean`
- `closeQuietly`：`async function closeQuietly(handle:`
- `LocalMediaStore.constructor`：`constructor(private readonly configuredRoot: string, options: LocalStoreOptions =`
- `LocalMediaStore.root`：`private root(): Promise<string>`
- `LocalMediaStore.location`：`private async location(keyInput: string): Promise<`
- `LocalMediaStore.ensureParent`：`private async ensureParent(root: string, key: string, path: string): Promise<void>`
- `LocalMediaStore.assertExistingPath`：`private async assertExistingPath(root: string, key: string, path: string): Promise<void>`
- `LocalMediaStore.openRead`：`private async openRead(keyInput: string): Promise<`
- `LocalMediaStore.head`：`async head(key: string): Promise<StoredMediaHead | null>`
- `LocalMediaStore.read`：`async read(key: string, options:`
- `close`：`close = async () =>`
- `pull`：`async pull(controller)`
- `cancel`：`async cancel()`
- `LocalMediaStore.put`：`async put(inputValue: PutMediaInput): Promise<StoredMediaHead>`
- `LocalMediaStore.delete`：`async delete(keyInput: string): Promise<boolean>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `LocalStoreOptions` | 接口，第 18 行 | 约束 Local Store Options 的数据结构或可选值 |
| `LocalMediaStore` | 类，第 46 行 | 封装 Local Media Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
