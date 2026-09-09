# server / services / auth / session-service.ts

## 文件定位

- **源码路径**：`server/services/auth/session-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：192 行，6985 字节
- **内容校验**：SHA-256 `e6e3626155a91c2621282372839b7c4b5546fe55695cb0c48a93e242075ffc18`

## 直接依赖

- `../../../shared/contracts/auth`
- `../../security/errors`
- `../../security/identity`
- `../../security/permissions`
- `../../security/session-policy`
- `../../security/tokens`
- `./auth-store`

## 直接调用方

- `server/services/auth/account-service.ts`
- `server/services/auth/authentication-service.ts`
- `server/services/contact/contact-service.ts`
- `server/types/h3.d.ts`
- `server/utils/admin-content-handler.ts`
- `server/utils/admin-read-handler.ts`
- `server/utils/admin-write-handler.ts`
- `server/utils/auth-guard.ts`
- `server/utils/auth-http.ts`
- `server/utils/auth-runtime.ts`
- `server/utils/interaction-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `SessionService.constructor` | 构造方法，第 57 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts`、`server/services/contact/contact-service.ts` 等模块导入使用。 |
| `SessionService.now` | 类方法，第 68 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts`、`server/services/contact/contact-service.ts` 等模块导入使用。 |
| `SessionService.createForCredential` | 类方法，第 74 行 | 创建 For Credential，并完成初始化或持久化处理 | 由 `server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts`、`server/services/contact/contact-service.ts` 等模块导入使用。 |
| `SessionService.resolve` | 类方法，第 122 行 | 读取或定位 resolve，向调用方返回匹配结果 | 由 `server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts`、`server/services/contact/contact-service.ts` 等模块导入使用。 |
| `SessionService.logout` | 类方法，第 165 行 | 封装 logout 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts`、`server/services/contact/contact-service.ts` 等模块导入使用。 |
| `SessionService.toView` | 类方法，第 181 行 | 根据输入组装 View 所需的结果对象或结构 | 由 `server/services/auth/account-service.ts`、`server/services/auth/authentication-service.ts`、`server/services/contact/contact-service.ts` 等模块导入使用。 |

### 调用签名

- `SessionService.constructor`：`constructor( private readonly store: AuthStore, private readonly tokens: AuthTokenService, options: SecurityRuntimeOptions =`
- `SessionService.now`：`private now(): Date`
- `SessionService.createForCredential`：`async createForCredential(credential: CredentialRecord, input: CreateSessionInput): Promise<CreatedSession>`
- `SessionService.resolve`：`async resolve(rawSessionToken: string | null | undefined): Promise<ActiveSession | null>`
- `SessionService.logout`：`async logout(active: ActiveSession | null, requestId: string): Promise<void>`
- `SessionService.toView`：`toView(active: ActiveSession | null): SessionView`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SecurityRuntimeOptions` | 接口，第 21 行 | 约束 Security Runtime Options 的数据结构或可选值 |
| `ActiveSession` | 接口，第 28 行 | 约束 Active Session 的数据结构或可选值 |
| `CreatedSession` | 接口，第 37 行 | 约束 Created Session 的数据结构或可选值 |
| `CreateSessionInput` | 接口，第 43 行 | 约束 Create Session Input 的数据结构或可选值 |
| `SessionService` | 类，第 51 行 | 封装 Session Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
