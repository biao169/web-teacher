# server / view-model / serializer.ts

## 文件定位

- **源码路径**：`server/view-model/serializer.ts`
- **文件类型**：程序模块
- **功能定位**：项目支持文件；为工程运行、依赖锁定或开发工具提供配置。
- **规模**：214 行，9759 字节
- **内容校验**：SHA-256 `899cb14bc187d1b64eaee9cc7ba17609bbe6059dc9fa3cb6ed9d1f3c3094745d`

## 直接依赖

- `../../shared/contracts/view-model`
- `../../shared/utils/unicode`
- `../security/bytes`

## 直接调用方

- `db/seeds/sample-data.ts`
- `server/cache/invalidation-map.ts`
- `server/cache/keys.ts`
- `server/cache/public-cache.ts`
- `server/i18n/fingerprint.ts`
- `server/media/grants.ts`
- `server/serialization/view-model.ts`
- `server/services/public/public-home-service.ts`
- `server/services/public/public-result.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `ViewModelError.constructor` | 构造方法，第 13 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/seeds/sample-data.ts`、`server/cache/invalidation-map.ts`、`server/cache/keys.ts` 等模块导入使用。 |
| `byteLength` | 函数，第 57 行 | 封装 Length 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `normalizedKey` | 函数，第 58 行 | 规范化 Key，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `sensitiveKey` | 函数，第 59 行 | 封装 Key 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `compareKeys` | 函数，第 74 行 | 封装 Keys 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `resolvedLimits` | 函数，第 76 行 | 读取或定位 Limits，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `normalize` | 函数，第 86 行 | 规范化 normalize，消除不安全或不一致的输入形式 | 仅在本文件内部使用，标识符共出现 9 次。 |
| `normalizeViewModel` | 函数，第 157 行 | 规范化 View Model，消除不安全或不一致的输入形式 | 由 `db/seeds/sample-data.ts`、`server/cache/invalidation-map.ts`、`server/cache/keys.ts` 等模块导入使用。 |
| `stringifyViewModel` | 函数，第 161 行 | 把 View Model 转换为展示、传输或存储所需格式 | 由 `db/seeds/sample-data.ts`、`server/cache/invalidation-map.ts`、`server/cache/keys.ts` 等模块导入使用。 |
| `parseViewModel` | 函数，第 168 行 | 解析 View Model 的输入格式，并输出受约束的数据结构 | 由 `db/seeds/sample-data.ts`、`server/cache/invalidation-map.ts`、`server/cache/keys.ts` 等模块导入使用。 |
| `sha256Hex` | 函数，第 179 行 | 封装 Hex 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/seeds/sample-data.ts`、`server/cache/invalidation-map.ts`、`server/cache/keys.ts` 等模块导入使用。 |
| `publicLimits` | 函数，第 190 行 | 封装 Limits 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `stablePublicJson` | 函数，第 196 行 | 封装 Public Json 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/seeds/sample-data.ts`、`server/cache/invalidation-map.ts`、`server/cache/keys.ts` 等模块导入使用。 |
| `parsePublicJson` | 函数，第 208 行 | 解析 Public Json 的输入格式，并输出受约束的数据结构 | 由 `db/seeds/sample-data.ts`、`server/cache/invalidation-map.ts`、`server/cache/keys.ts` 等模块导入使用。 |

### 调用签名

- `ViewModelError.constructor`：`constructor(readonly code: ViewModelErrorCode, message: string, options?: ErrorOptions)`
- `byteLength`：`function byteLength(value: string): number`
- `normalizedKey`：`function normalizedKey(value: string): string`
- `sensitiveKey`：`function sensitiveKey(value: string): boolean`
- `compareKeys`：`function compareKeys(left: string, right: string): number`
- `resolvedLimits`：`function resolvedLimits(overrides: Partial<ViewModelLimits> =`
- `normalize`：`function normalize(value: unknown, state: NormalizeState, depth: number): ViewModelValue`
- `normalizeViewModel`：`export function normalizeViewModel(value: unknown, overrides: Partial<ViewModelLimits> =`
- `stringifyViewModel`：`export function stringifyViewModel(value: unknown, overrides: Partial<ViewModelLimits> =`
- `parseViewModel`：`export function parseViewModel(serialized: string, overrides: Partial<ViewModelLimits> =`
- `sha256Hex`：`export async function sha256Hex(value: string | Uint8Array, cryptoProvider: Pick<Crypto, 'subtle'> = globalThis.crypto): Promise<string>`
- `publicLimits`：`function publicLimits(input: PublicViewModelLimitOverrides | undefined): Partial<ViewModelLimits>`
- `stablePublicJson`：`export function stablePublicJson( input: unknown, options:`
- `parsePublicJson`：`export function parsePublicJson( input: string, options:`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ViewModelErrorCode` | 类型，第 5 行 | 约束 View Model Error Code 的数据结构或可选值 |
| `ViewModelError` | 类，第 12 行 | 封装 View Model Error 的状态与业务行为 |
| `ViewModelLimits` | 接口，第 19 行 | 约束 View Model Limits 的数据结构或可选值 |
| `DEFAULT_VIEW_MODEL_LIMITS` | 导出常量，第 30 行 | 提供 DEFAULT VIEW MODEL LIMITS 的共享配置或不可变数据 |
| `NormalizeState` | 接口，第 50 行 | 约束 Normalize State 的数据结构或可选值 |
| `PublicViewModelLimitOverrides` | 类型，第 188 行 | 约束 Public View Model Limit Overrides 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
