# tests / stage27 / service.spec.mjs

## 文件定位

- **源码路径**：`tests/stage27/service.spec.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：226 行，11559 字节
- **内容校验**：SHA-256 `717b6e2f429e71b7797a165ce19aa96b407d396ed41b774c87b4a19724c1f948`

## 直接依赖

- `node:assert/strict`
- `node:module`
- `node:sqlite`
- `node:path`
- `node:test`
- `../../scripts/db/migrations.mjs`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `syncConnection` | 函数，第 20 行 | 封装 Connection 相关逻辑，供本文件或上层模块按其参数调用 |
| `inTransaction` | 方法，第 21 行 | 测试辅助函数；准备受控数据、挂载组件或驱动 DOM/断言，具体覆盖见下方测试用例。 |
| `constructor` | 构造方法，第 25 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 |
| `prepare` | 方法，第 26 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 |
| `build` | 函数变量，第 28 行 | 根据输入组装 build 所需的结果对象或结构 |
| `execute` | 函数变量，第 29 行 | 执行 execute 所代表的完整处理流程 |
| `batch` | 方法，第 40 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 |
| `constructor` | 构造方法，第 55 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 |
| `execute` | 方法，第 56 行 | 执行 execute 所代表的完整处理流程 |
| `batch` | 方法，第 57 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 |
| `principal` | 函数，第 60 行 | 封装 principal 相关逻辑，供本文件或上层模块按其参数调用 |
| `harness` | 函数，第 69 行 | 封装 harness 相关逻辑，供本文件或上层模块按其参数调用 |
| `createProfile` | 函数，第 84 行 | 创建 Profile，并完成初始化或持久化处理 |

### 调用签名

- `syncConnection`：`function syncConnection(db)`
- `inTransaction`：`get inTransaction()`
- `constructor`：`constructor(db)`
- `prepare`：`prepare(sql)`
- `build`：`build = params => …`
- `execute`：`execute = () => …`
- `batch`：`async batch(statements)`
- `constructor`：`constructor(inner)`
- `execute`：`execute(command)`
- `batch`：`batch(commands)`
- `principal`：`function principal()`
- `harness`：`function harness(kind = 'sqlite')`
- `createProfile`：`async function createProfile(service, name, role, bio = null)`

## 验证内容

- create, update, batch and delete maintain audit and cache generations
- create accepts one portable custom UID and database uniqueness remains authoritative
- concurrent creates cannot commit the same custom UID twice
- a stale member makes a batch fail atomically
- module-specific validation rejects impossible dates and normalizes DOI
- read-only messages cannot be created, deleted or rewritten
- all nine generic modules can normalize their minimum create payload or deliberate read-only policy

运行：`node --test tests/stage27/service.spec.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
