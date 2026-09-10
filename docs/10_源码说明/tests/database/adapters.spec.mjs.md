# tests / database / adapters.spec.mjs

## 文件定位

- **源码路径**：`tests/database/adapters.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：49 行，2683 字节
- **内容校验**：SHA-256 `c4b02710b486630d5f569c83d28f28cccd1336414882048dcc9a00546ac8bdca`

## 直接依赖

- `../helpers/offline-db.mjs`
- `node:assert/strict`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `prepare` | 对象函数，第 8 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `all` | 对象函数，第 8 行 | 收集 all 对应的数据集合，并应用必要的范围或过滤规则 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `prepare` | 对象函数，第 12 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `batch` | 对象函数，第 12 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `prepare` | 对象函数，第 16 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `all` | 对象函数，第 16 行 | 收集 all 对应的数据集合，并应用必要的范围或过滤规则 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `prepare` | 对象方法，第 22 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |

### 调用签名

- `prepare`：`prepare: () => (`
- `all`：`all: async () => (`
- `prepare`：`prepare: () => (`
- `batch`：`batch: async () => []`
- `prepare`：`prepare: () => (`
- `all`：`all: async () => (`
- `prepare`：`prepare(sql)`

## 测试场景

- 第 7 行：`test` — D1 rows-mode missing results is a protocol failure, not an empty table
- 第 11 行：`test` — D1 batch result cardinality is checked
- 第 15 行：`test` — D1 failed result does not expose the underlying SQL error
- 第 19 行：`test` — SQLite prepared statement cache is bounded and actually reused
- 第 31 行：`test` — nested SQLite batch does not commit a caller transaction
- 第 40 行：`test` — row decoder fails closed on corrupted integer storage

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
