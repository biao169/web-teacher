# scripts / lib / run-command.mjs

## 文件定位

- **源码路径**：`scripts/lib/run-command.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：46 行，1563 字节
- **内容校验**：SHA-256 `f86f81df3da689e08bb0a5ae2935f011a55a5f6fd5bebdae8ee4d8847c6e7cad`

## 直接依赖

- `node:child_process`
- `node:fs`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/build-target.mjs`
- `scripts/lib/build-output.mjs`
- `scripts/release/acceptance.mjs`
- `scripts/release/admin-production-regression.mjs`
- `scripts/release/inspect.mjs`
- `scripts/release/production-browser.mjs`
- `scripts/release/registry-worker.mjs`
- `scripts/release/verify-registry.mjs`
- `scripts/run-built-target.mjs`
- `scripts/run-release-core.mjs`
- `scripts/smoke-runtime.mjs`
- `scripts/verify-contracts.mjs`
- `scripts/verify-stage0.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `localBinaryPath` | 函数，第 8 行 | 封装 Binary Path 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/build-target.mjs`、`scripts/lib/build-output.mjs`、`scripts/release/acceptance.mjs` 等模块导入使用。 |
| `assertLocalBinary` | 函数，第 13 行 | 检查 Local Binary 是否满足业务、安全或类型约束 | 由 `scripts/build-target.mjs`、`scripts/lib/build-output.mjs`、`scripts/release/acceptance.mjs` 等模块导入使用。 |
| `runCommand` | 函数，第 21 行 | 执行 Command 所代表的完整处理流程 | 由 `scripts/build-target.mjs`、`scripts/lib/build-output.mjs`、`scripts/release/acceptance.mjs` 等模块导入使用。 |
| `runLocalBinary` | 函数，第 42 行 | 执行 Local Binary 所代表的完整处理流程 | 由 `scripts/build-target.mjs`、`scripts/lib/build-output.mjs`、`scripts/release/acceptance.mjs` 等模块导入使用。 |

### 调用签名

- `localBinaryPath`：`export function localBinaryPath(name, rootDir = projectRoot)`
- `assertLocalBinary`：`export async function assertLocalBinary(name, rootDir = projectRoot)`
- `runCommand`：`export async function runCommand(command, args, options =`
- `runLocalBinary`：`export async function runLocalBinary(name, args, options =`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `projectRoot` | 导出常量，第 6 行 | 提供 project Root 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
