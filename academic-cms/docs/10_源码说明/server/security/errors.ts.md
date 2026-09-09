# server / security / errors.ts

## 文件定位

- **源码路径**：`server/security/errors.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：86 行，2996 字节
- **内容校验**：SHA-256 `74242664efdadb1be9973e1c54a37a88b75bb1407c115155126298b63e8a7e5c`

## 直接调用方

- `server/audit/commands.ts`
- `server/audit/sanitize.ts`
- `server/routes/api/v1/auth/logout.post.ts`
- `server/routes/api/v1/auth/password/change.post.ts`
- `server/routes/api/v1/auth/register.post.ts`
- `server/routes/api/v1/auth/session.get.ts`
- `server/routes/api/v1/auth/session/refresh.post.ts`
- `server/routes/api/v1/auth/sessions/revoke-all.post.ts`
- `server/security/account-input.ts`
- `server/security/body.ts`
- `server/security/bytes.ts`
- `server/security/config.ts`
- `server/security/cookies.ts`
- `server/security/headers.ts`
- `server/security/identity.ts`
- `server/security/origin.ts`
- `server/security/password-policy.ts`
- `server/security/password.ts`
- `server/security/permissions.ts`
- `server/security/request-protection.ts`
- `server/security/session-policy.ts`
- `server/security/tokens.ts`
- `server/services/admin/dashboard-store.ts`
- `server/services/auth/account-service.ts`
- `server/services/auth/auth-store.ts`
- `server/services/auth/authentication-service.ts`
- `server/services/auth/bootstrap-service.ts`
- `server/services/auth/registration-service.ts`
- `server/services/auth/session-service.ts`
- `server/services/auth/throttle-service.ts`
- `server/services/complete-admin/password-bridge.ts`
- `server/utils/admin-http.ts`
- `server/utils/auth-guard.ts`
- `server/utils/auth-http.ts`
- `server/utils/auth-runtime.ts`
- `server/utils/complete-admin/auth.ts`
- `server/utils/interaction-http.ts`
- `server/utils/media-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `SecurityError.constructor` | 构造方法，第 70 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/audit/commands.ts`、`server/audit/sanitize.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `isSecurityError` | 函数，第 79 行 | 检查 Security Error 是否满足业务、安全或类型约束 | 由 `server/audit/commands.ts`、`server/audit/sanitize.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |
| `securityError` | 函数，第 83 行 | 封装 Error 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/audit/commands.ts`、`server/audit/sanitize.ts`、`server/routes/api/v1/auth/logout.post.ts` 等模块导入使用。 |

### 调用签名

- `SecurityError.constructor`：`constructor(readonly code: SecurityErrorCode, internalMessage = PUBLIC_MESSAGES[code], options: SecurityErrorOptions =`
- `isSecurityError`：`export function isSecurityError(error: unknown): error is SecurityError`
- `securityError`：`export function securityError(error: unknown, fallback = 'Authentication subsystem failure'): SecurityError`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SecurityErrorCode` | 类型，第 1 行 | 约束 Security Error Code 的数据结构或可选值 |
| `SecurityErrorOptions` | 接口，第 60 行 | 约束 Security Error Options 的数据结构或可选值 |
| `SecurityError` | 类，第 65 行 | 封装 Security Error 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
