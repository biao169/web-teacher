# server / services / auth / account-service.ts

## 文件定位

- **源码路径**：`server/services/auth/account-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：98 行，4322 字节
- **内容校验**：SHA-256 `a25bf20d47f4d49ef0ea999f996fbb9e90dae263c0d00b92c925924d07d05d74`

## 直接依赖

- `../../security/errors`
- `../../security/identity`
- `../../security/password`
- `../../security/password-policy`
- `./auth-store`
- `./session-service`

## 直接调用方

- `server/utils/interaction-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `AccountService.constructor` | 构造方法，第 27 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `AccountService.now` | 类方法，第 38 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `AccountService.changePassword` | 类方法，第 44 行 | 更新 Password，并保持状态、校验与持久化结果一致 | 由 `server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `AccountService.revokeAllSessions` | 类方法，第 83 行 | 移除或失效 All Sessions，同时处理相关联状态 | 由 `server/utils/interaction-runtime.ts` 等模块导入使用。 |

### 调用签名

- `AccountService.constructor`：`constructor( private readonly store: AuthStore, private readonly passwords: PasswordService, private readonly sessions: SessionService, private readonly options: AccountServiceOpt…`
- `AccountService.now`：`private now(): Date`
- `AccountService.changePassword`：`async changePassword(active: ActiveSession, input: ChangePasswordRequest): Promise<ActiveSession>`
- `AccountService.revokeAllSessions`：`async revokeAllSessions(active: ActiveSession, requestId: string): Promise<number>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `ChangePasswordRequest` | 接口，第 9 行 | 约束 Change Password Request 的数据结构或可选值 |
| `AccountServiceOptions` | 接口，第 15 行 | 约束 Account Service Options 的数据结构或可选值 |
| `AccountService` | 类，第 22 行 | 封装 Account Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
