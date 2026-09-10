# server / security / body.ts

## 文件定位

- **源码路径**：`server/security/body.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：82 行，3256 字节
- **内容校验**：SHA-256 `c53a1b0743d5c7e6e313947c069d9c6eb7fad71c44a4bd64acb035aa96c08a75`

## 直接依赖

- `./errors`

## 直接调用方

- `server/utils/admin-write-handler.ts`
- `server/utils/bounded-json.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `validateContentEncoding` | 函数，第 6 行 | Authentication endpoints do not accept compressed request bodies. | 由 `server/utils/admin-write-handler.ts`、`server/utils/bounded-json.ts` 等模块导入使用。 |
| `assertLimit` | 函数，第 12 行 | 检查 Limit 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `validateContentLength` | 函数，第 18 行 | 检查 Content Length 是否满足业务、安全或类型约束 | 由 `server/utils/admin-write-handler.ts`、`server/utils/bounded-json.ts` 等模块导入使用。 |
| `parseBoundedJsonStream` | 函数，第 29 行 | Reads a request stream with a hard byte ceiling and strict UTF-8 decoding. | 由 `server/utils/admin-write-handler.ts`、`server/utils/bounded-json.ts` 等模块导入使用。 |

### 调用签名

- `validateContentEncoding`：`export function validateContentEncoding(value: string | null | undefined): void`
- `assertLimit`：`function assertLimit(maximumBytes: number): void`
- `validateContentLength`：`export function validateContentLength(value: string | null | undefined, maximumBytes = AUTH_JSON_BODY_LIMIT): number | null`
- `parseBoundedJsonStream`：`export async function parseBoundedJsonStream( stream: ReadableStream<Uint8Array> | null | undefined, contentLength: string | null | undefined, maximumBytes = AUTH_JSON_BODY_LIMIT,…`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AUTH_JSON_BODY_LIMIT` | 导出常量，第 3 行 | 提供 AUTH JSON BODY LIMIT 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
