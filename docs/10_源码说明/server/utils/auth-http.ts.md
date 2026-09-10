# server / utils / auth-http.ts

## 文件定位

- **源码路径**：`server/utils/auth-http.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：126 行，5165 字节
- **内容校验**：SHA-256 `5a0cdae5c4556d4415af26adf06dfbd9c81c294a2693dcabd3979cedc1d0dd42`

## 直接依赖

- `#imports`
- `../security/cookies`
- `../security/errors`
- `../security/origin`
- `../security/request-protection`
- `../services/auth/session-service`
- `./auth-runtime`
- `h3`
- `zod`

## 直接调用方

- `server/routes/api/v1/auth/bootstrap.post.ts`
- `server/routes/api/v1/auth/login.post.ts`
- `server/routes/api/v1/auth/logout.post.ts`
- `server/routes/api/v1/auth/password/change.post.ts`
- `server/routes/api/v1/auth/register.post.ts`
- `server/routes/api/v1/auth/registration.get.ts`
- `server/routes/api/v1/auth/session.get.ts`
- `server/routes/api/v1/auth/session/refresh.post.ts`
- `server/routes/api/v1/auth/sessions/revoke-all.post.ts`
- `server/routes/api/v1/public/contact.get.ts`
- `server/routes/api/v1/public/contact.post.ts`
- `server/utils/admin-content-handler.ts`
- `server/utils/admin-write-handler.ts`
- `server/utils/interaction-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `bearerToken` | 函数，第 22 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `protectJsonWrite` | 函数，第 30 行 | Run before consuming an unsafe JSON body or resolving a database session. | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `setSessionCookies` | 函数，第 54 行 | 更新 Session Cookies，并保持状态、校验与持久化结果一致 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `refreshCsrfCookie` | 函数，第 60 行 | Restore a missing CSRF cookie without extending it beyond session expiry. | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `clearSessionCookies` | 函数，第 75 行 | 移除或失效 Session Cookies，同时处理相关联状态 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `requestNetwork` | 函数，第 88 行 | 封装 Network 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `applyPrivateNoStore` | 函数，第 100 行 | 执行 Private No Store 所代表的完整处理流程 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `authFailure` | 函数，第 106 行 | 封装 Failure 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |

### 调用签名

- `bearerToken`：`export function bearerToken(event: H3Event): string | null`
- `protectJsonWrite`：`export async function protectJsonWrite( event: H3Event, runtime: AuthRuntime, mode: JsonWriteProtectionMode = 'anonymous', ): Promise<void>`
- `setSessionCookies`：`export function setSessionCookies(event: H3Event, runtime: AuthRuntime, session: CreatedSession): void`
- `refreshCsrfCookie`：`export function refreshCsrfCookie( event: H3Event, runtime: AuthRuntime, csrfToken: string, expiresAt: string, ): void`
- `clearSessionCookies`：`export function clearSessionCookies(event: H3Event, runtime: AuthRuntime): void`
- `requestNetwork`：`export function requestNetwork(event: H3Event, runtime: AuthRuntime): string | null`
- `applyPrivateNoStore`：`export function applyPrivateNoStore(event: H3Event): void`
- `authFailure`：`export function authFailure(event: H3Event, error: unknown):`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `JsonWriteProtectionMode` | 类型，第 20 行 | 约束 Json Write Protection Mode 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
