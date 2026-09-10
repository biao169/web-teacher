# scripts / db / generate-schema.mjs

## 文件定位

- **源码路径**：`scripts/db/generate-schema.mjs`
- **文件类型**：脚本
- **功能定位**：数据库维护脚本；生成 Schema、执行迁移、更新清单或管理 D1。
- **规模**：117 行，9070 字节
- **内容校验**：SHA-256 `23db4309f9a8d7ed3082de6ef364b021f3c5226348ff32463469b3dfb8a76852`

## 直接依赖

- `node:crypto`
- `node:fs/promises`
- `node:path`
- `node:url`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `quote` | 函数变量，第 11 行 | 封装 quote 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 12 次。 |
| `literal` | 函数变量，第 12 行 | 封装 literal 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `camel` | 函数变量，第 13 行 | 封装 camel 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `pascal` | 函数变量，第 14 行 | 封装 pascal 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `sqlType` | 函数变量，第 15 行 | 根据 Type 返回对应的展示类型或颜色语义 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `constraints` | 函数，第 16 行 | 封装 constraints 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `defaultSql` | 函数，第 32 行 | 封装 Sql 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `indexSqlColumn` | 函数，第 37 行 | 封装 Sql Column 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `quote`：`quote = name =>`
- `literal`：`literal = value => typeof value === 'boolean' ? (value ? '1' : '0') : typeof value === 'number' ? String(value) : \`'$`
- `camel`：`camel = name => name.replace(/_([a-z])/g, (_, c) => c.toUpperCase())`
- `pascal`：`pascal = name =>`
- `sqlType`：`sqlType = c => ['integer', 'boolean'].includes(c.kind) ? 'INTEGER' : 'TEXT'`
- `constraints`：`function constraints(field, c)`
- `defaultSql`：`function defaultSql(c)`
- `indexSqlColumn`：`function indexSqlColumn(col)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
