# tests / helpers / offline-db.mjs

## 文件定位

- **源码路径**：`tests/helpers/offline-db.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：57 行，2627 字节
- **内容校验**：SHA-256 `99ba97e5cb100949c6112bc6d7f46554a5a5360cae873c75b35d138d5cd33867`

## 直接依赖

- `../../scripts/db/migrations.mjs`
- `node:module`
- `node:path`
- `node:sqlite`
- `node:url`

## 直接调用方

- `tests/database/adapters.spec.mjs`
- `tests/database/migrations.spec.mjs`
- `tests/database/offline.spec.mjs`
- `tests/database/plans.spec.mjs`
- `tests/database/schema.spec.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `load` | 函数变量，第 9 行 | 加载并刷新 load，同步界面或运行时状态 | 由 `tests/database/adapters.spec.mjs`、`tests/database/migrations.spec.mjs`、`tests/database/offline.spec.mjs` 等模块导入使用。 |
| `D1ProtocolDouble.constructor` | 构造方法，第 18 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/database/adapters.spec.mjs`、`tests/database/migrations.spec.mjs`、`tests/database/offline.spec.mjs` 等模块导入使用。 |
| `D1ProtocolDouble.prepare` | 类方法，第 19 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/database/adapters.spec.mjs`、`tests/database/migrations.spec.mjs`、`tests/database/offline.spec.mjs` 等模块导入使用。 |
| `build` | 函数变量，第 22 行 | 根据输入组装 build 所需的结果对象或结构 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `execute` | 函数变量，第 23 行 | 执行 execute 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `bind` | 对象函数，第 30 行 | 封装 bind 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `all` | 对象函数，第 30 行 | 收集 all 对应的数据集合，并应用必要的范围或过滤规则 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `run` | 对象函数，第 30 行 | 执行 run 所代表的完整处理流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `D1ProtocolDouble.batch` | 类方法，第 34 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/database/adapters.spec.mjs`、`tests/database/migrations.spec.mjs`、`tests/database/offline.spec.mjs` 等模块导入使用。 |
| `syncConnection` | 函数，第 46 行 | 封装 Connection 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/database/adapters.spec.mjs`、`tests/database/migrations.spec.mjs`、`tests/database/offline.spec.mjs` 等模块导入使用。 |
| `prepare` | 对象函数，第 47 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `exec` | 对象函数，第 47 行 | 封装 exec 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `createHarness` | 函数，第 49 行 | 创建 Harness，并完成初始化或持久化处理 | 由 `tests/database/adapters.spec.mjs`、`tests/database/migrations.spec.mjs`、`tests/database/offline.spec.mjs` 等模块导入使用。 |
| `close` | 对象方法，第 55 行 | 关闭 close 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `load`：`load = name => require(resolve(root, '.tmp/database-core', name))`
- `D1ProtocolDouble.constructor`：`constructor(db)`
- `D1ProtocolDouble.prepare`：`prepare(sql)`
- `build`：`build = params =>`
- `execute`：`execute = () =>`
- `bind`：`bind: (...values) =>`
- `all`：`all: async () => execute()`
- `run`：`run: async () => execute()`
- `D1ProtocolDouble.batch`：`async batch(statements)`
- `syncConnection`：`export function syncConnection(db)`
- `prepare`：`prepare: sql => db.prepare(sql)`
- `exec`：`exec: sql => db.exec(sql)`
- `createHarness`：`export function createHarness(kind = 'sqlite')`
- `close`：`close()`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `root` | 导出常量，第 7 行 | 提供 root 的共享配置或不可变数据 |
| `core` | 导出常量，第 10 行 | 提供 core 的共享配置或不可变数据 |
| `migrations` | 导出常量，第 14 行 | 提供 migrations 的共享配置或不可变数据 |
| `D1ProtocolDouble` | 类，第 17 行 | Real SQLite storage behind a D1-shaped protocol TEST DOUBLE, not workerd. |

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
