# server / services / auth / throttle-service.ts

## 文件定位

- **源码路径**：`server/services/auth/throttle-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：90 行，3391 字节
- **内容校验**：SHA-256 `c9affc2f02b9d90ae00a7a76c7ea593119c198b33017340f6fc8ee54d7b1f272`

## 直接依赖

- `../../security/errors`
- `../../security/identity`
- `../../security/tokens`
- `./auth-store`

## 直接调用方

- `server/services/auth/authentication-service.ts`
- `server/utils/auth-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `validPositiveInteger` | 函数，第 27 行 | 封装 Positive Integer 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `LoginThrottleService.constructor` | 构造方法，第 34 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/authentication-service.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |
| `LoginThrottleService.keys` | 类方法，第 50 行 | 封装 keys 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/authentication-service.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |
| `LoginThrottleService.window` | 类方法，第 57 行 | 封装 window 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/authentication-service.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |
| `LoginThrottleService.retryAfter` | 类方法，第 72 行 | 封装 After 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/authentication-service.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |
| `LoginThrottleService.recordFailure` | 类方法，第 82 行 | 封装 Failure 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/authentication-service.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |

### 调用签名

- `validPositiveInteger`：`function validPositiveInteger(value: number, minimum: number, maximum: number): boolean`
- `LoginThrottleService.constructor`：`constructor( private readonly store: AuthStore, private readonly tokens: AuthTokenService, private readonly policy: LoginThrottlePolicy, clock: (() => Date) | undefined = undefine…`
- `LoginThrottleService.keys`：`async keys(username: string, network: string | null): Promise<LoginThrottleKeys>`
- `LoginThrottleService.window`：`window(): LoginThrottleWindow`
- `LoginThrottleService.retryAfter`：`retryAfter(states: readonly ThrottleState[], now: Date): number`
- `LoginThrottleService.recordFailure`：`async recordFailure(keys: LoginThrottleKeys, window: LoginThrottleWindow): Promise<readonly ThrottleState[]>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `LoginThrottlePolicy` | 接口，第 6 行 | 约束 Login Throttle Policy 的数据结构或可选值 |
| `LoginThrottleKeys` | 接口，第 14 行 | 约束 Login Throttle Keys 的数据结构或可选值 |
| `LoginThrottleWindow` | 接口，第 19 行 | 约束 Login Throttle Window 的数据结构或可选值 |
| `LoginThrottleService` | 类，第 31 行 | 封装 Login Throttle Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
