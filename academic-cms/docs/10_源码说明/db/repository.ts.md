# db / repository.ts

## 文件定位

- **源码路径**：`db/repository.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：105 行，7419 字节
- **内容校验**：SHA-256 `488ecb3d1152951bd4e80ace86b458aa0f7b291e028a5abeb8b01b834731f781`

## 直接依赖

- `./codec`
- `./contracts`
- `./errors`
- `./models`
- `./query`

## 直接调用方

- `db/context.ts`
- `db/runtime/cloudflare.ts`
- `db/runtime/node.ts`
- `tests/contracts/repository-contract.ts`
- `tests/native/repository.spec.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `Repository.constructor` | 构造方法，第 15 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.clock` | 类方法，第 19 行 | 封装 clock 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.values` | 类方法，第 25 行 | 封装 values 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.insertCommand` | 类方法，第 34 行 | 创建 Command，并完成初始化或持久化处理 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.create` | 类方法，第 49 行 | 创建 create，并完成初始化或持久化处理 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.upsertByUid` | 类方法，第 54 行 | 封装 By Uid 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.findByUid` | 类方法，第 59 行 | 读取或定位 By Uid，向调用方返回匹配结果 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.findByUids` | 类方法，第 64 行 | 读取或定位 By Uids，向调用方返回匹配结果 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.lookup` | 类方法，第 67 行 | 读取或定位 lookup，向调用方返回匹配结果 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.list` | 类方法，第 75 行 | 收集 list 对应的数据集合，并应用必要的范围或过滤规则 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.updateByUid` | 类方法，第 82 行 | 更新 By Uid，并保持状态、校验与持久化结果一致 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.deleteByUid` | 类方法，第 96 行 | 移除或失效 By Uid，同时处理相关联状态 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |
| `Repository.mediaByKeys` | 类方法，第 102 行 | 封装 By Keys 相关逻辑，供本文件或上层模块按其参数调用 | 由 `db/context.ts`、`db/runtime/cloudflare.ts`、`db/runtime/node.ts` 等模块导入使用。 |

### 调用签名

- `Repository.constructor`：`constructor(readonly adapter: DatabaseAdapter, options: RepositoryOptions =`
- `Repository.clock`：`private clock(after?: string): string`
- `Repository.values`：`private values(table: TableName, data: Record<string, unknown>, mode: 'insert' | 'update'): Record<string, SqlValue>`
- `Repository.insertCommand`：`private insertCommand<T extends TableName>(table: T, data: Insert<T>, merge: boolean): SqlCommand`
- `Repository.create`：`async create<T extends TableName>(table: T, data: Insert<T>): Promise<Row<T>>`
- `Repository.upsertByUid`：`async upsertByUid<T extends TableName>(table: T, data: Insert<T> &`
- `Repository.findByUid`：`async findByUid<T extends TableName>(table: T, uid: string): Promise<Row<T> | null>`
- `Repository.findByUids`：`async findByUids<T extends TableName>(table: T, uids: readonly string[]): Promise<Row<T>[]>`
- `Repository.lookup`：`async lookup<T extends TableName>(table: T, field: string, keys: readonly string[]): Promise<Row<T>[]>`
- `Repository.list`：`async list<T extends TableName>(table: T, query: ListQuery =`
- `Repository.updateByUid`：`async updateByUid<T extends TableName>(table: T, uid: string, patch: Patch<T>, options: UpdateOptions =`
- `Repository.deleteByUid`：`async deleteByUid<T extends TableName>(table: T, uid: string): Promise<boolean>`
- `Repository.mediaByKeys`：`async mediaByKeys(keys: readonly string[]): Promise<Row<'media_assets'>[]>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `Page` | 接口，第 7 行 | 约束 Page 的数据结构或可选值 |
| `UpdateOptions` | 接口，第 8 行 | 约束 Update Options 的数据结构或可选值 |
| `RepositoryOptions` | 接口，第 9 行 | 约束 Repository Options 的数据结构或可选值 |
| `Repository` | 类，第 12 行 | Storage-only API. Module/record authorization belongs to the Service layer. |
| `DatabaseRecord` | 类型，第 104 行 | 约束 Database Record 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
