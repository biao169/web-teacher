# server / interactions / errors.ts

## 文件定位

- **源码路径**：`server/interactions/errors.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：48 行，1731 字节
- **内容校验**：SHA-256 `a6dd608ee5afe803857d4ac97d08a2e508176422ba8094c43483f7e41620069e`

## 直接调用方

- `server/services/auth/registration-service.ts`
- `server/services/contact/contact-service.ts`
- `server/services/contact/contact-store.ts`
- `server/services/interactions/action-throttle-service.ts`
- `server/services/interactions/action-throttle-store.ts`
- `server/services/interactions/settings-store.ts`
- `server/utils/interaction-http.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `PublicInteractionError.constructor` | 构造方法，第 40 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/registration-service.ts`、`server/services/contact/contact-service.ts`、`server/services/contact/contact-store.ts` 等模块导入使用。 |

### 调用签名

- `PublicInteractionError.constructor`：`constructor(readonly code: PublicInteractionErrorCode, internalMessage: string, options: PublicInteractionErrorOptions =`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PublicInteractionErrorCode` | 类型，第 1 行 | 约束 Public Interaction Error Code 的数据结构或可选值 |
| `PublicInteractionErrorOptions` | 接口，第 30 行 | 约束 Public Interaction Error Options 的数据结构或可选值 |
| `PublicInteractionError` | 类，第 35 行 | 封装 Public Interaction Error 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
