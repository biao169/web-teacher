# server / security / tokens.ts

## 文件定位

- **源码路径**：`server/security/tokens.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：104 行，4566 字节
- **内容校验**：SHA-256 `88e55e9a53631f322c0164d31fdea63354c1d02b8ff0a17f43a45919f12738e2`

## 直接依赖

- `./bytes`
- `./errors`

## 直接调用方

- `scripts/auth/bootstrap-admin.ts`
- `server/security/request-protection.ts`
- `server/services/auth/bootstrap-service.ts`
- `server/services/auth/session-service.ts`
- `server/services/auth/throttle-service.ts`
- `server/services/interactions/action-throttle-service.ts`
- `server/utils/auth-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `AuthTokenService.constructor` | 构造方法，第 17 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.key` | 类方法，第 25 行 | 封装 key 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.mac` | 类方法，第 30 行 | 封装 mac 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.newSessionToken` | 类方法，第 35 行 | 封装 Session Token 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.isSessionToken` | 类方法，第 39 行 | 检查 Session Token 是否满足业务、安全或类型约束 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.assertSessionToken` | 类方法，第 43 行 | 检查 Session Token 是否满足业务、安全或类型约束 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.sessionHash` | 类方法，第 48 行 | 封装 Hash 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.csrfToken` | 类方法，第 53 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.createSessionMaterial` | 类方法，第 58 行 | 创建 Session Material，并完成初始化或持久化处理 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.verifyCsrf` | 类方法，第 64 行 | 检查 Csrf 是否满足业务、安全或类型约束 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.throttleKey` | 类方法，第 70 行 | 封装 Key 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.actionThrottleKey` | 类方法，第 75 行 | 封装 Throttle Key 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.userAgentHash` | 类方法，第 87 行 | 封装 Agent Hash 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.sessionCorrelation` | 类方法，第 93 行 | 封装 Correlation 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |
| `AuthTokenService.verifyBootstrapToken` | 类方法，第 98 行 | 检查 Bootstrap Token 是否满足业务、安全或类型约束 | 由 `scripts/auth/bootstrap-admin.ts`、`server/security/request-protection.ts`、`server/services/auth/bootstrap-service.ts` 等模块导入使用。 |

### 调用签名

- `AuthTokenService.constructor`：`constructor( private readonly secret: string, private readonly subtle: SubtleCrypto = globalThis.crypto.subtle, private readonly cryptoProvider: Pick<Crypto, 'getRandomValues'> = …`
- `AuthTokenService.key`：`private key(): Promise<CryptoKey>`
- `AuthTokenService.mac`：`private async mac(domain: string, value: string): Promise<Uint8Array>`
- `AuthTokenService.newSessionToken`：`newSessionToken(): string`
- `AuthTokenService.isSessionToken`：`isSessionToken(value: unknown): value is string`
- `AuthTokenService.assertSessionToken`：`assertSessionToken(value: unknown): string`
- `AuthTokenService.sessionHash`：`async sessionHash(token: string): Promise<string>`
- `AuthTokenService.csrfToken`：`async csrfToken(sessionToken: string): Promise<string>`
- `AuthTokenService.createSessionMaterial`：`async createSessionMaterial(): Promise<SessionMaterial>`
- `AuthTokenService.verifyCsrf`：`async verifyCsrf(sessionToken: unknown, cookieToken: unknown, headerToken: unknown): Promise<boolean>`
- `AuthTokenService.throttleKey`：`async throttleKey(scope: 'account' | 'network', value: string): Promise<string>`
- `AuthTokenService.actionThrottleKey`：`async actionThrottleKey( action: 'registration' | 'contact', scope: 'identity' | 'network', value: string, ): Promise<string>`
- `AuthTokenService.userAgentHash`：`async userAgentHash(value: string | null | undefined): Promise<string | null>`
- `AuthTokenService.sessionCorrelation`：`async sessionCorrelation(token: string): Promise<string>`
- `AuthTokenService.verifyBootstrapToken`：`async verifyBootstrapToken(provided: unknown, expected: string | null): Promise<boolean>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SESSION_TOKEN_BYTES` | 导出常量，第 4 行 | 提供 SESSION TOKEN BYTES 的共享配置或不可变数据 |
| `SESSION_TOKEN_LENGTH` | 导出常量，第 5 行 | 提供 SESSION TOKEN LENGTH 的共享配置或不可变数据 |
| `SessionMaterial` | 接口，第 8 行 | 约束 Session Material 的数据结构或可选值 |
| `AuthTokenService` | 类，第 14 行 | 封装 Auth Token Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
