# server / media / errors.ts

## 文件定位

- **源码路径**：`server/media/errors.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：24 行，670 字节
- **内容校验**：SHA-256 `0c0fafc96384987d78c06b6f3db13f08e071cb52c3177cd78a3d33d7dddec595`

## 直接调用方

- `server/media/config.ts`
- `server/media/fetch-store.ts`
- `server/media/grants.ts`
- `server/media/http.ts`
- `server/media/local-store.ts`
- `server/media/object-key.ts`
- `server/media/r2-store.ts`
- `server/media/store.ts`
- `server/services/media/media-catalog-store.ts`
- `server/services/media/media-service.ts`
- `server/utils/media-http.ts`
- `server/utils/media-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `MediaError.constructor` | 构造方法，第 14 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/fetch-store.ts`、`server/media/grants.ts` 等模块导入使用。 |
| `mediaStorageError` | 函数，第 20 行 | 封装 Storage Error 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/media/config.ts`、`server/media/fetch-store.ts`、`server/media/grants.ts` 等模块导入使用。 |

### 调用签名

- `MediaError.constructor`：`constructor(readonly code: MediaErrorCode, message: string, options?: ErrorOptions)`
- `mediaStorageError`：`export function mediaStorageError(error: unknown): MediaError`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `MediaErrorCode` | 类型，第 1 行 | 约束 Media Error Code 的数据结构或可选值 |
| `MediaError` | 类，第 13 行 | 封装 Media Error 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
