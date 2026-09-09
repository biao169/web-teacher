# server / security / identity.ts

## 文件定位

- **源码路径**：`server/security/identity.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：15 行，713 字节
- **内容校验**：SHA-256 `7567b179b64a313a171e30c459dce85835cec53b990945cac86a39001d126087`

## 直接依赖

- `./bytes`
- `./errors`

## 直接调用方

- `server/services/auth/account-service.ts`
- `server/services/auth/bootstrap-service.ts`
- `server/services/auth/registration-service.ts`
- `server/services/auth/session-service.ts`
- `server/services/auth/throttle-service.ts`
- `server/services/contact/contact-service.ts`
- `server/services/interactions/action-throttle-service.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `createSecurityUid` | 函数，第 6 行 | 创建 Security Uid，并完成初始化或持久化处理 | 由 `server/services/auth/account-service.ts`、`server/services/auth/bootstrap-service.ts`、`server/services/auth/registration-service.ts` 等模块导入使用。 |
| `canonicalNow` | 函数，第 11 行 | 规范化 Now，消除不安全或不一致的输入形式 | 由 `server/services/auth/account-service.ts`、`server/services/auth/bootstrap-service.ts`、`server/services/auth/registration-service.ts` 等模块导入使用。 |

### 调用签名

- `createSecurityUid`：`export function createSecurityUid(prefix: SecurityIdPrefix, cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string`
- `canonicalNow`：`export function canonicalNow(now: Date): string`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SecurityIdPrefix` | 类型，第 4 行 | 约束 Security Id Prefix 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
