# tests / helpers / offline-stage6.mjs

## 文件定位

- **源码路径**：`tests/helpers/offline-stage6.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：103 行，6130 字节
- **内容校验**：SHA-256 `eae3cd5eeb4689bc2c7126cdfdd1649a13f765b96fdafdb5ed9e6032dbdc1631`

## 直接依赖

- `../../scripts/db/migrations.mjs`
- `node:crypto`
- `node:module`
- `node:path`
- `node:sqlite`
- `node:url`

## 直接调用方

- `tests/stage6/adversarial.spec.mjs`
- `tests/stage6/integration.spec.mjs`
- `tests/stage6/interactions.spec.mjs`
- `tests/stage6/seed.spec.mjs`
- `tests/stage6/static-contract.spec.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `loadStage6` | 函数变量，第 11 行 | 加载并刷新 Stage6，同步界面或运行时状态 | 由 `tests/stage6/adversarial.spec.mjs`、`tests/stage6/integration.spec.mjs`、`tests/stage6/interactions.spec.mjs` 等模块导入使用。 |
| `D1ProtocolDouble.constructor` | 构造方法，第 28 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `D1ProtocolDouble.prepare` | 类方法，第 29 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `build` | 函数变量，第 31 行 | 根据输入组装 build 所需的结果对象或结构 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `execute` | 函数变量，第 32 行 | 执行 execute 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `bind` | 对象函数，第 39 行 | 封装 bind 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `all` | 对象函数，第 39 行 | 收集 all 对应的数据集合，并应用必要的范围或过滤规则 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `run` | 对象函数，第 39 行 | 执行 run 所代表的完整处理流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `D1ProtocolDouble.batch` | 类方法，第 43 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `syncConnection` | 函数，第 56 行 | 封装 Connection 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `prepare` | 对象函数，第 57 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `exec` | 对象函数，第 57 行 | 封装 exec 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `createHarness` | 函数，第 59 行 | 创建 Harness，并完成初始化或持久化处理 | 由 `tests/stage6/adversarial.spec.mjs`、`tests/stage6/integration.spec.mjs`、`tests/stage6/interactions.spec.mjs` 等模块导入使用。 |
| `close` | 对象方法，第 65 行 | 关闭 close 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `TestPbkdf2Engine.derive` | 类方法，第 69 行 | 封装 derive 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage6/adversarial.spec.mjs`、`tests/stage6/integration.spec.mjs`、`tests/stage6/interactions.spec.mjs` 等模块导入使用。 |
| `clock` | 函数，第 75 行 | 封装 clock 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage6/adversarial.spec.mjs`、`tests/stage6/integration.spec.mjs`、`tests/stage6/interactions.spec.mjs` 等模块导入使用。 |
| `now` | 对象函数，第 77 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `advance` | 对象方法，第 77 行 | 封装 advance 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `iso` | 对象函数，第 77 行 | 检查 iso 是否满足业务、安全或类型约束 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `ids` | 函数，第 79 行 | 封装 ids 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/stage6/adversarial.spec.mjs`、`tests/stage6/integration.spec.mjs`、`tests/stage6/interactions.spec.mjs` 等模块导入使用。 |
| `seedHarness` | 函数，第 81 行 | 创建 Harness，并完成初始化或持久化处理 | 由 `tests/stage6/adversarial.spec.mjs`、`tests/stage6/integration.spec.mjs`、`tests/stage6/interactions.spec.mjs` 等模块导入使用。 |
| `createInteractionServices` | 函数，第 88 行 | 创建 Interaction Services，并完成初始化或持久化处理 | 由 `tests/stage6/adversarial.spec.mjs`、`tests/stage6/integration.spec.mjs`、`tests/stage6/interactions.spec.mjs` 等模块导入使用。 |
| `idFactory` | 对象函数，第 100 行 | 封装 Factory 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |

### 调用签名

- `loadStage6`：`loadStage6 = name => require(resolve(output, name))`
- `D1ProtocolDouble.constructor`：`constructor(db)`
- `D1ProtocolDouble.prepare`：`prepare(sql)`
- `build`：`build = params =>`
- `execute`：`execute = () =>`
- `bind`：`bind: (...values) => build(values)`
- `all`：`all: async () => execute()`
- `run`：`run: async () => execute()`
- `D1ProtocolDouble.batch`：`async batch(statements)`
- `syncConnection`：`function syncConnection(db)`
- `prepare`：`prepare: sql => db.prepare(sql)`
- `exec`：`exec: sql => db.exec(sql)`
- `createHarness`：`export function createHarness(kind = 'sqlite')`
- `close`：`close()`
- `TestPbkdf2Engine.derive`：`async derive(password, salt, iterations, bytes)`
- `clock`：`export function clock(initial = '2026-08-29T10:00:00.000Z')`
- `now`：`now: () => new Date(time)`
- `advance`：`advance(ms)`
- `iso`：`iso: () => new Date(time).toISOString()`
- `ids`：`export function ids()`
- `seedHarness`：`export async function seedHarness(h, password = 'Demo stage six passphrase 2026!')`
- `createInteractionServices`：`export function createInteractionServices(h, passwords, options =`
- `idFactory`：`idFactory: () => \`message:stage6-$`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `root` | 导出常量，第 8 行 | 提供 root 的共享配置或不可变数据 |
| `core` | 导出常量，第 12 行 | 提供 core 的共享配置或不可变数据 |
| `migrations` | 导出常量，第 25 行 | 提供 migrations 的共享配置或不可变数据 |
| `D1ProtocolDouble` | 类，第 27 行 | 封装 D1 Protocol Double 的状态与业务行为 |
| `TestPbkdf2Engine` | 类，第 68 行 | 封装 Test Pbkdf2 Engine 的状态与业务行为 |

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
