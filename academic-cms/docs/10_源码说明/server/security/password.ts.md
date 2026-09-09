# server / security / password.ts

## 文件定位

- **源码路径**：`server/security/password.ts`
- **文件类型**：程序模块
- **功能定位**：安全基础模块；处理身份、会话、权限、来源、密码、令牌或请求保护。
- **规模**：95 行，4507 字节
- **内容校验**：SHA-256 `c679a34e6a3561e09ed628be8a1cb2e2bf0df706c68c0f1b7f636523f42cf1fa`

## 直接依赖

- `./bytes`
- `./errors`

## 直接调用方

- `db/seeds/sample-data.ts`
- `scripts/auth/bootstrap-admin.ts`
- `scripts/db/seed-sample.ts`
- `scripts/release/seed-fixture.ts`
- `scripts/windows/initialize-local-demo.ts`
- `server/services/auth/account-service.ts`
- `server/services/auth/authentication-service.ts`
- `server/services/auth/bootstrap-service.ts`
- `server/services/auth/registration-service.ts`
- `server/services/complete-admin/password-bridge.ts`
- `server/utils/auth-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `WebCryptoPbkdf2Engine.constructor` | 构造方法，第 28 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/seeds/sample-data.ts`、`scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts` 等模块导入使用。 |
| `WebCryptoPbkdf2Engine.derive` | 类方法，第 30 行 | 封装 derive 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/seeds/sample-data.ts`、`scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts` 等模块导入使用。 |
| `normalizePasswordForHash` | 函数，第 37 行 | 规范化 Password For Hash，消除不安全或不一致的输入形式 | 由 `db/seeds/sample-data.ts`、`scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts` 等模块导入使用。 |
| `parsePasswordHash` | 函数，第 41 行 | 解析 Password Hash 的输入格式，并输出受约束的数据结构 | 由 `db/seeds/sample-data.ts`、`scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts` 等模块导入使用。 |
| `requiredDummyHash` | 函数，第 58 行 | 检查 Dummy Hash 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `PasswordService.constructor` | 构造方法，第 66 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/seeds/sample-data.ts`、`scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts` 等模块导入使用。 |
| `PasswordService.hash` | 类方法，第 71 行 | 检查 hash 是否满足业务、安全或类型约束 | 由 `db/seeds/sample-data.ts`、`scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts` 等模块导入使用。 |
| `PasswordService.verify` | 类方法，第 83 行 | Unknown hashes and oversized candidates still perform one bounded derivation. | 由 `db/seeds/sample-data.ts`、`scripts/auth/bootstrap-admin.ts`、`scripts/db/seed-sample.ts` 等模块导入使用。 |

### 调用签名

- `WebCryptoPbkdf2Engine.constructor`：`constructor(private readonly subtle: SubtleCrypto = globalThis.crypto.subtle)`
- `WebCryptoPbkdf2Engine.derive`：`async derive(password: Uint8Array, salt: Uint8Array, iterations: number, bytes: number): Promise<Uint8Array>`
- `normalizePasswordForHash`：`export function normalizePasswordForHash(password: string): string`
- `parsePasswordHash`：`export function parsePasswordHash(encoded: string): ParsedPasswordHash | null`
- `requiredDummyHash`：`function requiredDummyHash(): ParsedPasswordHash`
- `PasswordService.constructor`：`constructor( private readonly engine: Pbkdf2Engine = new WebCryptoPbkdf2Engine(), private readonly cryptoProvider: Pick<Crypto, 'getRandomValues'> = globalThis.crypto, )`
- `PasswordService.hash`：`async hash(normalizedPassword: string): Promise<string>`
- `PasswordService.verify`：`async verify(password: unknown, encoded: string): Promise<PasswordVerification>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PASSWORD_ALGORITHM` | 导出常量，第 4 行 | 提供 PASSWORD ALGORITHM 的共享配置或不可变数据 |
| `PASSWORD_ITERATIONS` | 导出常量，第 5 行 | 提供 PASSWORD ITERATIONS 的共享配置或不可变数据 |
| `PASSWORD_SALT_BYTES` | 导出常量，第 6 行 | 提供 PASSWORD SALT BYTES 的共享配置或不可变数据 |
| `PASSWORD_HASH_BYTES` | 导出常量，第 7 行 | 提供 PASSWORD HASH BYTES 的共享配置或不可变数据 |
| `PASSWORD_INPUT_MAX_BYTES` | 导出常量，第 8 行 | 提供 PASSWORD INPUT MAX BYTES 的共享配置或不可变数据 |
| `DUMMY_PASSWORD_HASH` | 导出常量，第 9 行 | 提供 DUMMY PASSWORD HASH 的共享配置或不可变数据 |
| `ParsedPasswordHash` | 接口，第 11 行 | 约束 Parsed Password Hash 的数据结构或可选值 |
| `PasswordVerification` | 接口，第 18 行 | 约束 Password Verification 的数据结构或可选值 |
| `Pbkdf2Engine` | 接口，第 23 行 | 约束 Pbkdf2 Engine 的数据结构或可选值 |
| `WebCryptoPbkdf2Engine` | 类，第 27 行 | 封装 Web Crypto Pbkdf2 Engine 的状态与业务行为 |
| `PasswordService` | 类，第 65 行 | 封装 Password Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
