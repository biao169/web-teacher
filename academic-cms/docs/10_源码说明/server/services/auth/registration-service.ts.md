# server / services / auth / registration-service.ts

## 文件定位

- **源码路径**：`server/services/auth/registration-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：113 行，4335 字节
- **内容校验**：SHA-256 `9df156c8198e23ed543fd9968795564c77f2a81c077b2ec40cdd00b7a206a3ac`

## 直接依赖

- `../../interactions/errors`
- `../../security/account-input`
- `../../security/errors`
- `../../security/identity`
- `../../security/password`
- `../../security/password-policy`
- `../interactions/action-throttle-service`
- `../interactions/settings-store`
- `./auth-store`

## 直接调用方

- `server/utils/interaction-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `RegistrationService.constructor` | 构造方法，第 39 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `RegistrationService.available` | 类方法，第 51 行 | 封装 available 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `RegistrationService.register` | 类方法，第 55 行 | 封装 register 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/interaction-runtime.ts` 等模块导入使用。 |

### 调用签名

- `RegistrationService.constructor`：`constructor( private readonly store: AuthStore, private readonly settings: InteractionSettingsStore, private readonly throttle: PublicActionThrottleService, private readonly passw…`
- `RegistrationService.available`：`async available(): Promise<boolean>`
- `RegistrationService.register`：`async register(input: PublicRegistrationInput): Promise<PublicRegistrationResult>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PublicRegistrationInput` | 接口，第 12 行 | 约束 Public Registration Input 的数据结构或可选值 |
| `PublicRegistrationResult` | 接口，第 22 行 | 约束 Public Registration Result 的数据结构或可选值 |
| `RegistrationServiceOptions` | 接口，第 27 行 | 约束 Registration Service Options 的数据结构或可选值 |
| `RegistrationService` | 类，第 34 行 | 封装 Registration Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
