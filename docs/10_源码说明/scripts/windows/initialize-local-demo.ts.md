# scripts / windows / initialize-local-demo.ts

## 文件定位

- **源码路径**：`scripts/windows/initialize-local-demo.ts`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：222 行，10758 字节
- **内容校验**：SHA-256 `7f9efff1ea732260f9e560b2ab5576f0d2a25fce05d3673a5fe87e8f0ca72ef5`

## 直接依赖

- `../../db/runtime/node`
- `../../db/seeds/sample-data`
- `../../server/security/password`
- `../../server/security/password-policy`
- `../../shared/enums/auth`
- `../db/migrations.mjs`
- `better-sqlite3`
- `node:crypto`
- `node:fs`
- `node:fs/promises`
- `node:path`
- `node:url`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `parseOptions` | 函数，第 25 行 | 解析 Options 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `projectPath` | 函数，第 37 行 | 封装 Path 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `generatedSecret` | 函数，第 51 行 | 封装 Secret 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `replaceEnvironmentValue` | 函数，第 55 行 | 更新 Environment Value，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `ensureEnvironmentSecret` | 函数，第 62 行 | 检查 Environment Secret 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `updateEnvironment` | 函数，第 68 行 | 更新 Environment，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `backupStamp` | 函数，第 87 行 | 关闭 Stamp 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `backupAndRemoveDatabase` | 函数，第 91 行 | 关闭 And Remove Database 对应的界面或恢复前一状态 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `migrateDatabase` | 函数，第 112 行 | 封装 Database 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `seedDatabase` | 函数，第 131 行 | 创建 Database，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `verifyDatabase` | 函数，第 143 行 | 检查 Database 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `writeCredentials` | 函数，第 182 行 | 更新 Credentials，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `parseOptions`：`function parseOptions(argv: readonly string[]): Options`
- `projectPath`：`function projectPath(input: string, kind: 'database' | 'credentials'):`
- `generatedSecret`：`function generatedSecret(): string`
- `replaceEnvironmentValue`：`function replaceEnvironmentValue(source: string, key: string, value: string, newline: string): string`
- `ensureEnvironmentSecret`：`function ensureEnvironmentSecret(source: string, key: string, newline: string): string`
- `updateEnvironment`：`async function updateEnvironment(databasePath: string): Promise<void>`
- `backupStamp`：`function backupStamp(): string`
- `backupAndRemoveDatabase`：`async function backupAndRemoveDatabase(databasePath: string): Promise<string | null>`
- `migrateDatabase`：`async function migrateDatabase(databasePath: string): Promise<readonly string[]>`
- `seedDatabase`：`async function seedDatabase(databasePath: string, password: string)`
- `verifyDatabase`：`function verifyDatabase(databasePath: string): Record<string, number>`
- `writeCredentials`：`async function writeCredentials(path: string, database: string, password: string): Promise<void>`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `Options` | 接口，第 19 行 | 约束 Options 的数据结构或可选值 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
