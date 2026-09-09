# server / security / account-input.ts

## 文件定位

- **源码路径**：`server/security/account-input.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：36 行，1989 字节
- **内容校验**：SHA-256 `169f677e58d0d5d9e0d32f57e2fcaa567bb719622e3ff012d7397be9118b06c3`

## 直接依赖

- `./bytes`
- `./errors`

## 直接调用方

- `server/services/auth/authentication-service.ts`
- `server/services/auth/bootstrap-service.ts`
- `server/services/auth/registration-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `normalizeLoginUsername` | 函数，第 7 行 | 规范化 Login Username，消除不安全或不一致的输入形式 | 由 `server/services/auth/authentication-service.ts`、`server/services/auth/bootstrap-service.ts`、`server/services/auth/registration-service.ts` 等模块导入使用。 |
| `validateNewUsername` | 函数，第 14 行 | 检查 New Username 是否满足业务、安全或类型约束 | 由 `server/services/auth/authentication-service.ts`、`server/services/auth/bootstrap-service.ts`、`server/services/auth/registration-service.ts` 等模块导入使用。 |
| `normalizeDisplayName` | 函数，第 20 行 | 规范化 Display Name，消除不安全或不一致的输入形式 | 由 `server/services/auth/authentication-service.ts`、`server/services/auth/bootstrap-service.ts`、`server/services/auth/registration-service.ts` 等模块导入使用。 |
| `normalizeEmail` | 函数，第 28 行 | 规范化 Email，消除不安全或不一致的输入形式 | 由 `server/services/auth/authentication-service.ts`、`server/services/auth/bootstrap-service.ts`、`server/services/auth/registration-service.ts` 等模块导入使用。 |

### 调用签名

- `normalizeLoginUsername`：`export function normalizeLoginUsername(value: unknown): string`
- `validateNewUsername`：`export function validateNewUsername(value: unknown): string`
- `normalizeDisplayName`：`export function normalizeDisplayName(value: unknown): string | null`
- `normalizeEmail`：`export function normalizeEmail(value: unknown): string | null`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
