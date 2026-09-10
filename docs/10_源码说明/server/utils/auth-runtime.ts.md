# server / utils / auth-runtime.ts

## 文件定位

- **源码路径**：`server/utils/auth-runtime.ts`
- **文件类型**：程序模块
- **功能定位**：服务端通用工具；封装请求解析、运行时解析、HTTP 响应或安全辅助逻辑。
- **规模**：99 行，3911 字节
- **内容校验**：SHA-256 `c837f1d713e6f7fea5f79e6824fdf2a0182382839687858666ba4c370c5923e0`

## 直接依赖

- `#imports`
- `../security/config`
- `../security/cookies`
- `../security/errors`
- `../security/password`
- `../security/tokens`
- `../services/auth/auth-store`
- `../services/auth/authentication-service`
- `../services/auth/bootstrap-service`
- `../services/auth/session-service`
- `../services/auth/throttle-service`
- `./database`
- `h3`

## 直接调用方

- `server/routes/api/v1/auth/bootstrap.post.ts`
- `server/routes/api/v1/auth/login.post.ts`
- `server/routes/api/v1/auth/logout.post.ts`
- `server/routes/api/v1/auth/password/change.post.ts`
- `server/routes/api/v1/auth/register.post.ts`
- `server/routes/api/v1/auth/session.get.ts`
- `server/routes/api/v1/auth/session/refresh.post.ts`
- `server/routes/api/v1/auth/sessions/revoke-all.post.ts`
- `server/routes/api/v1/public/contact.post.ts`
- `server/services/complete-admin/media-service.ts`
- `server/types/h3.d.ts`
- `server/utils/admin-content-handler.ts`
- `server/utils/admin-write-handler.ts`
- `server/utils/auth-guard.ts`
- `server/utils/auth-http.ts`
- `server/utils/complete-admin/auth.ts`
- `server/utils/interaction-http.ts`
- `server/utils/interaction-runtime.ts`
- `server/utils/media-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `tokenService` | 函数，第 31 行 | 根据输入组装 Service 所需的结果对象或结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `rawConfig` | 函数，第 41 行 | 封装 Config 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `useAuthRuntime` | 函数，第 45 行 | 封装 Runtime 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `resolveOptionalSession` | 函数，第 92 行 | 读取或定位 Optional Session，向调用方返回匹配结果 | 由 `server/routes/api/v1/auth/bootstrap.post.ts`、`server/routes/api/v1/auth/login.post.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |

### 调用签名

- `tokenService`：`function tokenService(secret: string): AuthTokenService`
- `rawConfig`：`function rawConfig(event: H3Event): Record<string, unknown>`
- `useAuthRuntime`：`export function useAuthRuntime(event: H3Event): AuthRuntime`
- `resolveOptionalSession`：`export function resolveOptionalSession(event: H3Event): Promise<ActiveSession | null>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `AuthRuntime` | 接口，第 16 行 | 约束 Auth Runtime 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
