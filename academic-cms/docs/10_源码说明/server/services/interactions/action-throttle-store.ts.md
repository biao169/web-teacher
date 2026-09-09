# server / services / interactions / action-throttle-store.ts

## 文件定位

- **源码路径**：`server/services/interactions/action-throttle-store.ts`
- **文件类型**：程序模块
- **功能定位**：服务端持久化访问层；封装 SQL 查询和数据库读写，供业务服务调用。
- **规模**：137 行，6258 字节
- **内容校验**：SHA-256 `5318ed186a0d54325bdef9e236504aced1ae577553fbe4299d60803fefb511a4`

## 直接依赖

- `../../../db/contracts`
- `../../../db/query`
- `../../interactions/errors`

## 直接调用方

- `server/services/interactions/action-throttle-service.ts`
- `server/utils/interaction-runtime.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `required` | 函数，第 23 行 | 检查 required 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `text` | 函数，第 28 行 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `integer` | 函数，第 34 行 | 封装 integer 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `nullableTimestamp` | 函数，第 40 行 | 封装 Timestamp 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `parse` | 函数，第 49 行 | 解析 parse 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `PublicActionThrottleStore.constructor` | 构造方法，第 63 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/interactions/action-throttle-service.ts`、`server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `PublicActionThrottleStore.consume` | 类方法，第 65 行 | 封装 consume 相关逻辑，供本文件或上层模块按其参数调用 | 由 `server/services/interactions/action-throttle-service.ts`、`server/utils/interaction-runtime.ts` 等模块导入使用。 |
| `PublicActionThrottleStore.cleanupExpired` | 类方法，第 133 行 | 移除或失效 Expired，同时处理相关联状态 | 由 `server/services/interactions/action-throttle-service.ts`、`server/utils/interaction-runtime.ts` 等模块导入使用。 |

### 调用签名

- `required`：`function required(row: RawRow, name: string): string | number | null`
- `text`：`function text(row: RawRow, name: string): string`
- `integer`：`function integer(row: RawRow, name: string): number`
- `nullableTimestamp`：`function nullableTimestamp(row: RawRow, name: string): string | null`
- `parse`：`function parse(row: RawRow): PublicActionThrottleState`
- `PublicActionThrottleStore.constructor`：`constructor(private readonly adapter: DatabaseAdapter)`
- `PublicActionThrottleStore.consume`：`async consume( entries: readonly PublicActionThrottleEntry[], at: string, resetBefore: string, blockUntil: string, expiresAt: string, ): Promise<readonly PublicActionThrottleState…`
- `PublicActionThrottleStore.cleanupExpired`：`async cleanupExpired(at: string): Promise<number>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `PublicAction` | 类型，第 5 行 | 约束 Public Action 的数据结构或可选值 |
| `PublicActionScope` | 类型，第 6 行 | 约束 Public Action Scope 的数据结构或可选值 |
| `PublicActionThrottleEntry` | 接口，第 8 行 | 约束 Public Action Throttle Entry 的数据结构或可选值 |
| `PublicActionThrottleState` | 接口，第 15 行 | 约束 Public Action Throttle State 的数据结构或可选值 |
| `PublicActionThrottleStore` | 类，第 62 行 | 封装 Public Action Throttle Store 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
