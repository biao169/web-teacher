# db / adapters / sqlite.ts

## 文件定位

- **源码路径**：`db/adapters/sqlite.ts`
- **文件类型**：程序模块
- **功能定位**：平台适配器；屏蔽 Node、Cloudflare 或数据库驱动差异，向上层提供统一接口。
- **规模**：65 行，3148 字节
- **内容校验**：SHA-256 `d7c12d4eebfddd67f747787cb7abfab9718da9c921b39ff443a9076a39876bef`

## 直接依赖

- `../contracts`
- `../errors`

## 直接调用方

- `db/runtime/node.ts`
- `tests/native/repository.spec.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `SqliteAdapter.constructor` | 构造方法，第 19 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/runtime/node.ts`、`tests/native/repository.spec.ts` 等模块导入使用。 |
| `SqliteAdapter.prepare` | 类方法，第 22 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/runtime/node.ts`、`tests/native/repository.spec.ts` 等模块导入使用。 |
| `SqliteAdapter.clearStatementCache` | 类方法，第 32 行 | 移除或失效 Statement Cache，同时处理相关联状态 | 由 `db/runtime/node.ts`、`tests/native/repository.spec.ts` 等模块导入使用。 |
| `SqliteAdapter.perform` | 类方法，第 33 行 | 执行 perform 所代表的完整处理流程 | 由 `db/runtime/node.ts`、`tests/native/repository.spec.ts` 等模块导入使用。 |
| `SqliteAdapter.execute` | 类方法，第 42 行 | 执行 execute 所代表的完整处理流程 | 由 `db/runtime/node.ts`、`tests/native/repository.spec.ts` 等模块导入使用。 |
| `SqliteAdapter.batch` | 类方法，第 48 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/runtime/node.ts`、`tests/native/repository.spec.ts` 等模块导入使用。 |

### 调用签名

- `SqliteAdapter.constructor`：`constructor(private readonly connection: SyncConnection, private readonly maxCachedStatements = 64)`
- `SqliteAdapter.prepare`：`private prepare(sql: string): SyncStatement`
- `SqliteAdapter.clearStatementCache`：`clearStatementCache(): void`
- `SqliteAdapter.perform`：`private perform(command: SqlCommand): QueryResult`
- `SqliteAdapter.execute`：`async execute(command: SqlCommand): Promise<QueryResult>`
- `SqliteAdapter.batch`：`async batch(commands: readonly SqlCommand[]): Promise<QueryResult[]>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `SyncStatement` | 接口，第 5 行 | Structural subset implemented by better-sqlite3; no native import in shared code. |
| `SyncConnection` | 接口，第 9 行 | 约束 Sync Connection 的数据结构或可选值 |
| `SqliteAdapter` | 类，第 15 行 | 封装 Sqlite Adapter 的状态与业务行为 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
