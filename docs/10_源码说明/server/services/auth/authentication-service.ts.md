# server / services / auth / authentication-service.ts

## 文件定位

- **源码路径**：`server/services/auth/authentication-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：69 行，2894 字节
- **内容校验**：SHA-256 `6fdef25b30bf25fce862ef4c8aedc1bf13e65a688d10265978862037ed237fa9`

## 直接依赖

- `../../security/account-input`
- `../../security/errors`
- `../../security/password`
- `./auth-store`
- `./session-service`
- `./throttle-service`

## 直接调用方

- `server/utils/auth-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `AuthenticationService.constructor` | 构造方法，第 20 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/auth-runtime.ts` 等模块导入使用。 |
| `AuthenticationService.login` | 类方法，第 27 行 | 封装 login 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/utils/auth-runtime.ts` 等模块导入使用。 |

### 调用签名

- `AuthenticationService.constructor`：`constructor( private readonly store: AuthStore, private readonly passwords: PasswordService, private readonly sessions: SessionService, private readonly throttle: LoginThrottleSer…`
- `AuthenticationService.login`：`async login(input: LoginInput): Promise<CreatedSession>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `LoginInput` | 接口，第 8 行 | 约束 Login Input 的数据结构或可选值 |
| `AuthenticationService` | 类，第 19 行 | 封装 Authentication Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
