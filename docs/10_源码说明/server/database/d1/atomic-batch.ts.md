# server / database / d1 / atomic-batch.ts

## 文件定位

- **源码路径**：`server/database/d1/atomic-batch.ts`
- **文件类型**：程序模块
- **功能定位**：服务端领域基础模块；为对应领域提供契约、策略、存储或转换能力。
- **规模**：70 行，2594 字节
- **内容校验**：SHA-256 `653b6fbac299b85153d1939044f3a6fd1291e99288e8ef1fe206db1da3c7688b`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `assertExpectedChanges` | 函数，第 20 行 | 检查 Expected Changes 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `executeAtomicD1Commands` | 函数，第 32 行 | Execute mutations and their row-count assertions in one D1 batch. | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `assertExpectedChanges`：`function assertExpectedChanges(value: number | undefined): void`
- `executeAtomicD1Commands`：`export async function executeAtomicD1Commands<T = unknown>( database: D1DatabaseLike, commands: readonly AtomicD1Command[], now = new Date(), ): Promise<AtomicD1Result<T>>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `D1PreparedStatementLike` | 接口，第 1 行 | 约束 D1 Prepared Statement Like 的数据结构或可选值 |
| `D1DatabaseLike` | 接口，第 5 行 | 约束 D1 Database Like 的数据结构或可选值 |
| `AtomicD1Command` | 接口，第 10 行 | 约束 Atomic D1 Command 的数据结构或可选值 |
| `AtomicD1Result` | 接口，第 16 行 | 约束 Atomic D1 Result 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
