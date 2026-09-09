# server / services / auth / bootstrap-service.ts

## 文件定位

- **源码路径**：`server/services/auth/bootstrap-service.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：96 行，3552 字节
- **内容校验**：SHA-256 `7c14ebd283b266616cb239128328d6407d751a93fa8bd6adf61a107bea4977a5`

## 直接依赖

- `../../../shared/enums/auth`
- `../../security/account-input`
- `../../security/errors`
- `../../security/identity`
- `../../security/password`
- `../../security/password-policy`
- `../../security/tokens`
- `./auth-store`

## 直接调用方

- `scripts/auth/bootstrap-admin.ts`
- `server/utils/auth-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `BootstrapService.constructor` | 构造方法，第 41 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/auth/bootstrap-admin.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |
| `BootstrapService.createInitialAdministrator` | 类方法，第 52 行 | 创建 Initial Administrator，并完成初始化或持久化处理 | 由 `scripts/auth/bootstrap-admin.ts`、`server/utils/auth-runtime.ts` 等模块导入使用。 |

### 调用签名

- `BootstrapService.constructor`：`constructor( private readonly store: AuthStore, private readonly passwords: PasswordService, private readonly tokens: AuthTokenService, private readonly options: BootstrapServiceO…`
- `BootstrapService.createInitialAdministrator`：`async createInitialAdministrator(input: BootstrapAdminRequest): Promise<BootstrapResult>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `BootstrapAdminRequest` | 接口，第 11 行 | 约束 Bootstrap Admin Request 的数据结构或可选值 |
| `BootstrapResult` | 接口，第 21 行 | 约束 Bootstrap Result 的数据结构或可选值 |
| `BootstrapServiceOptions` | 接口，第 29 行 | 约束 Bootstrap Service Options 的数据结构或可选值 |
| `BootstrapService` | 类，第 36 行 | 封装 Bootstrap Service 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
