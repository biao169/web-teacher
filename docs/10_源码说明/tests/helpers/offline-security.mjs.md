# tests / helpers / offline-security.mjs

## 文件定位

- **源码路径**：`tests/helpers/offline-security.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：227 行，8874 字节
- **内容校验**：SHA-256 `e51f0f76a70389b3221efd0beefad60c705dc6e38f955d6d7f00119ac93dda0d`

## 直接依赖

- `../../scripts/db/migrations.mjs`
- `node:crypto`
- `node:module`
- `node:path`
- `node:sqlite`
- `node:url`

## 直接调用方

- `tests/security/adversarial.spec.mjs`
- `tests/security/atomicity.spec.mjs`
- `tests/security/auth-contract.spec.mjs`
- `tests/security/auth-services.spec.mjs`
- `tests/security/authorization.spec.mjs`
- `tests/security/core.spec.mjs`
- `tests/security/http-integration.spec.mjs`
- `tests/security/http-static.spec.mjs`
- `tests/security/migration.spec.mjs`
- `tests/security/plans.spec.mjs`
- `tests/security/primitives.spec.mjs`
- `tests/security/request-audit.spec.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `loadSecurity` | 函数变量，第 10 行 | 加载并刷新 Security，同步界面或运行时状态 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `D1ProtocolDouble.constructor` | 构造方法，第 44 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `D1ProtocolDouble.prepare` | 类方法，第 45 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `build` | 函数变量，第 47 行 | 根据输入组装 build 所需的结果对象或结构 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `execute` | 函数变量，第 48 行 | 执行 execute 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 4 次。 |
| `bind` | 对象函数，第 56 行 | 封装 bind 相关逻辑，供本文件或上层模块按其参数调用 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `all` | 对象函数，第 57 行 | 收集 all 对应的数据集合，并应用必要的范围或过滤规则 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `run` | 对象函数，第 58 行 | 执行 run 所代表的完整处理流程 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |
| `D1ProtocolDouble.batch` | 类方法，第 64 行 | 封装 batch 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `syncConnection` | 函数，第 78 行 | 封装 Connection 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `prepare` | 对象函数，第 80 行 | 封装 prepare 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `exec` | 对象函数，第 81 行 | 封装 exec 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `createSecurityHarness` | 函数，第 86 行 | 创建 Security Harness，并完成初始化或持久化处理 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `close` | 对象方法，第 94 行 | 关闭 close 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `TestPbkdf2Engine.derive` | 类方法，第 100 行 | 封装 derive 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `adjustableClock` | 函数，第 111 行 | 封装 Clock 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `now` | 对象函数，第 114 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `advance` | 对象方法，第 115 行 | 封装 advance 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `set` | 对象方法，第 116 行 | 更新 set，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `iso` | 对象函数，第 117 行 | 检查 iso 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `sequentialIds` | 函数，第 121 行 | 封装 Ids 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `createServices` | 函数，第 126 行 | 创建 Services，并完成初始化或持久化处理 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `bootstrapAdmin` | 函数，第 151 行 | 创建 Admin，并完成初始化或持久化处理 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `mutableClock` | 函数，第 166 行 | 封装 Clock 相关逻辑，供本文件或上层模块按其参数调用 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `now` | 对象函数，第 169 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `set` | 对象方法，第 170 行 | 更新 set，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `advance` | 对象方法，第 171 行 | 封装 advance 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `createAuthHarness` | 函数，第 175 行 | 创建 Auth Harness，并完成初始化或持久化处理 | 由 `tests/security/adversarial.spec.mjs`、`tests/security/atomicity.spec.mjs`、`tests/security/auth-contract.spec.mjs` 等模块导入使用。 |
| `idFactory` | 函数变量，第 182 行 | 封装 Factory 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `createAdmin` | 对象方法，第 213 行 | 创建 Admin，并完成初始化或持久化处理 | 文件内部辅助逻辑，通常作为回调、初始化步骤或声明期配置使用。 |

### 调用签名

- `loadSecurity`：`loadSecurity = name => require(resolve(root, '.tmp/security-core', name))`
- `D1ProtocolDouble.constructor`：`constructor(db)`
- `D1ProtocolDouble.prepare`：`prepare(sql)`
- `build`：`build = params =>`
- `execute`：`execute = () =>`
- `bind`：`bind: (...values) => build(values)`
- `all`：`all: async () => execute()`
- `run`：`run: async () => execute()`
- `D1ProtocolDouble.batch`：`async batch(statements)`
- `syncConnection`：`export function syncConnection(db)`
- `prepare`：`prepare: sql => db.prepare(sql)`
- `exec`：`exec: sql => db.exec(sql)`
- `createSecurityHarness`：`export function createSecurityHarness(kind = 'sqlite')`
- `close`：`close()`
- `TestPbkdf2Engine.derive`：`async derive(password, salt, iterations, bytes)`
- `adjustableClock`：`export function adjustableClock(iso = '2026-08-29T00:00:00.000Z')`
- `now`：`now: () => new Date(time)`
- `advance`：`advance(seconds)`
- `set`：`set(value)`
- `iso`：`iso: () => new Date(time).toISOString()`
- `sequentialIds`：`export function sequentialIds()`
- `createServices`：`export function createServices(harness, options =`
- `bootstrapAdmin`：`export async function bootstrapAdmin(services, overrides =`
- `mutableClock`：`export function mutableClock(initial = '2026-08-29T00:00:00.000Z')`
- `now`：`now: () => new Date(time)`
- `set`：`set(value)`
- `advance`：`advance(milliseconds)`
- `createAuthHarness`：`export function createAuthHarness(kind = 'sqlite', options =`
- `idFactory`：`idFactory = prefix => \`$`
- `createAdmin`：`async createAdmin(overrides =`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `root` | 导出常量，第 8 行 | 提供 root 的共享配置或不可变数据 |
| `core` | 导出常量，第 12 行 | 提供 core 的共享配置或不可变数据 |
| `migrations` | 导出常量，第 40 行 | 提供 migrations 的共享配置或不可变数据 |
| `D1ProtocolDouble` | 类，第 43 行 | Real SQLite storage behind a D1-shaped protocol test double, not workerd. |
| `TestPbkdf2Engine` | 类，第 98 行 | Fast deterministic PBKDF2-shaped engine for service contract tests only. |
| `security` | 导出常量，第 164 行 | 提供 security 的共享配置或不可变数据 |

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
