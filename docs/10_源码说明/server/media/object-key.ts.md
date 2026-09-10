# server / media / object-key.ts

## 文件定位

- **源码路径**：`server/media/object-key.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：66 行，3542 字节
- **内容校验**：SHA-256 `49b211698d339fc97b6f4ff89e4419ed7490e5b86b2728997a43ac2c304812fd`

## 直接依赖

- `../../shared/utils/unicode`
- `./errors`

## 直接调用方

- `server/media/fetch-store.ts`
- `server/media/grants.ts`
- `server/media/local-store.ts`
- `server/media/r2-store.ts`
- `server/media/store.ts`
- `server/services/admin/content-validation.ts`
- `server/services/media/media-service.ts`
- `server/utils/media-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `bytes` | 函数，第 14 行 | 封装 bytes 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `normalizeManagedObjectKey` | 函数，第 17 行 | Canonical portable key for local files and R2 objects. | 由 `server/media/fetch-store.ts`、`server/media/grants.ts`、`server/media/local-store.ts` 等模块导入使用。 |
| `encodeObjectKeyPath` | 函数，第 37 行 | 把 Object Key Path 转换为展示、传输或存储所需格式 | 由 `server/media/fetch-store.ts`、`server/media/grants.ts`、`server/media/local-store.ts` 等模块导入使用。 |
| `decodeObjectKeyPath` | 函数，第 41 行 | 解析 Object Key Path 的输入格式，并输出受约束的数据结构 | 由 `server/media/fetch-store.ts`、`server/media/grants.ts`、`server/media/local-store.ts` 等模块导入使用。 |
| `normalizeExternalMediaUrl` | 函数，第 52 行 | 规范化 External Media Url，消除不安全或不一致的输入形式 | 由 `server/media/fetch-store.ts`、`server/media/grants.ts`、`server/media/local-store.ts` 等模块导入使用。 |

### 调用签名

- `bytes`：`function bytes(value: string): number`
- `normalizeManagedObjectKey`：`export function normalizeManagedObjectKey(input: string): string`
- `encodeObjectKeyPath`：`export function encodeObjectKeyPath(key: string): string`
- `decodeObjectKeyPath`：`export function decodeObjectKeyPath(path: string): string`
- `normalizeExternalMediaUrl`：`export function normalizeExternalMediaUrl(input: string): string`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `MEDIA_KEY_LIMITS` | 导出常量，第 4 行 | 提供 MEDIA KEY LIMITS 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
