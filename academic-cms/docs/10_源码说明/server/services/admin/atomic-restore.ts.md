# server / services / admin / atomic-restore.ts

## 文件定位

- **源码路径**：`server/services/admin/atomic-restore.ts`
- **文件类型**：程序模块
- **功能定位**：服务端业务服务；执行校验、权限、事务和领域流程，并调用存储或适配器。
- **规模**：35 行，1214 字节
- **内容校验**：SHA-256 `435b6bcaf6dee0da44757836f0b77a50e776c38db3757555172bfc4d96a68bab`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `executeAtomicRestore` | 函数，第 19 行 | Build and execute a restore as one bounded transaction. | 作为模块公开能力导出；可由调用方按签名传参使用。 |

### 调用签名

- `executeAtomicRestore`：`export async function executeAtomicRestore( repository: AtomicRestoreRepository, plans: readonly RestoreTablePlan[], auditCommand: RestoreCommand, generationCommands: readonly Res…`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `RestoreCommand` | 接口，第 1 行 | 约束 Restore Command 的数据结构或可选值 |
| `AtomicRestoreRepository` | 接口，第 7 行 | 约束 Atomic Restore Repository 的数据结构或可选值 |
| `RestoreTablePlan` | 接口，第 11 行 | 约束 Restore Table Plan 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
