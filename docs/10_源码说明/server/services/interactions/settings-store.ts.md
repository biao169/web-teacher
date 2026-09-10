# server / services / interactions / settings-store.ts

## 文件定位

- **源码路径**：`server/services/interactions/settings-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端持久化访问层；封装 SQL 查询和数据库读写，供业务服务调用。
- **规模**：56 行，2237 字节
- **内容校验**：SHA-256 `1de1659c727e376713259eeb8bc4a8f6b6b428ea436b5757ec2f39d452b2b961`

## 直接依赖

- `../../../db/contracts`
- `../../../db/query`
- `../../interactions/errors`

## 直接调用方

- `server/services/auth/registration-service.ts`
- `server/services/contact/contact-service.ts`
- `server/utils/interaction-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `flag` | 函数，第 12 行 | 封装 flag 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `optionalText` | 函数，第 17 行 | 封装 Text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `parse` | 函数，第 24 行 | 解析 parse 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `InteractionSettingsStore.constructor` | 构造方法，第 44 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/registration-service.ts`、`server/services/contact/contact-service.ts`、`server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `InteractionSettingsStore.current` | 类方法，第 46 行 | 封装 current 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/auth/registration-service.ts`、`server/services/contact/contact-service.ts`、`server/utils/interaction-runtime.ts` 等模块导入使用。 |

### 调用签名

- `flag`：`function flag(value: unknown, name: string): boolean`
- `optionalText`：`function optionalText(value: unknown, name: string): string | null`
- `parse`：`function parse(row: RawRow | undefined): InteractionSettings`
- `InteractionSettingsStore.constructor`：`constructor(private readonly adapter: DatabaseAdapter)`
- `InteractionSettingsStore.current`：`async current(): Promise<InteractionSettings>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `InteractionSettings` | 接口，第 5 行 | 约束 Interaction Settings 的数据结构或可选值 |
| `InteractionSettingsStore` | 类，第 43 行 | 封装 Interaction Settings Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
