# db / statement.ts

## 文件定位

- **源码路径**：`db/statement.ts`
- **文件类型**：程序模块
- **功能定位**：数据库核心模块；封装查询计划、仓储、编码、上下文或运行时数据库能力。
- **规模**：42 行，2408 字节
- **内容校验**：SHA-256 `547cd333074280d77d2b880f3f9b5687edad777555ad86abfcb05a8ab609acca`

## 直接依赖

- `./errors`

## 直接调用方

- `db/adapters/d1.ts`
- `db/contracts.ts`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `normalizeSingleStatement` | 函数，第 5 行 | 规范化 Single Statement，消除不安全或不一致的输入形式 | 由 `db/adapters/d1.ts`、`db/contracts.ts` 等模块导入使用。 |
| `validateSingleStatement` | 函数，第 41 行 | 检查 Single Statement 是否满足业务、安全或类型约束 | 由 `db/adapters/d1.ts`、`db/contracts.ts` 等模块导入使用。 |

### 调用签名

- `normalizeSingleStatement`：`export function normalizeSingleStatement(sql: string): string`
- `validateSingleStatement`：`export function validateSingleStatement(sql: string): void`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
