# scripts / lib / build-output.mjs

## 文件定位

- **源码路径**：`scripts/lib/build-output.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：126 行，4399 字节
- **内容校验**：SHA-256 `d55c4b0ef156a6f330754d94bd9a0a3d35259598a51bdc75298dc7ab9676ec9a`

## 直接依赖

- `./run-command.mjs`
- `node:fs`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/build-target.mjs`
- `scripts/release/admin-production-regression.mjs`
- `scripts/release/production-browser.mjs`
- `scripts/run-built-target.mjs`
- `scripts/smoke-runtime.mjs`
- `tests/node/build-output.test.mjs`
- `tests/release/build-safety.test.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `resolveBuildTarget` | 函数，第 21 行 | 读取或定位 Build Target，向调用方返回匹配结果 | 由 `scripts/build-target.mjs`、`scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs` 等模块导入使用。 |
| `normalizeAppVersion` | 函数，第 29 行 | 规范化 App Version，消除不安全或不一致的输入形式 | 由 `scripts/build-target.mjs`、`scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs` 等模块导入使用。 |
| `outputPaths` | 函数，第 38 行 | 封装 Paths 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/build-target.mjs`、`scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs` 等模块导入使用。 |
| `assertBuildArtifacts` | 函数，第 48 行 | 检查 Build Artifacts 是否满足业务、安全或类型约束 | 由 `scripts/build-target.mjs`、`scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs` 等模块导入使用。 |
| `writeBuildMetadata` | 函数，第 56 行 | 整理 Build Metadata 的元数据，供展示或后续处理使用 | 由 `scripts/build-target.mjs`、`scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs` 等模块导入使用。 |
| `readBuildMetadata` | 函数，第 86 行 | 整理 Build Metadata 的元数据，供展示或后续处理使用 | 由 `scripts/build-target.mjs`、`scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs` 等模块导入使用。 |
| `assertBuildTarget` | 函数，第 114 行 | 检查 Build Target 是否满足业务、安全或类型约束 | 由 `scripts/build-target.mjs`、`scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs` 等模块导入使用。 |

### 调用签名

- `resolveBuildTarget`：`export function resolveBuildTarget(value)`
- `normalizeAppVersion`：`export function normalizeAppVersion(value)`
- `outputPaths`：`export function outputPaths(rootDir = projectRoot)`
- `assertBuildArtifacts`：`export async function assertBuildArtifacts(rootDir = projectRoot)`
- `writeBuildMetadata`：`export async function writeBuildMetadata(targetName, options =`
- `readBuildMetadata`：`export async function readBuildMetadata(rootDir = projectRoot)`
- `assertBuildTarget`：`export async function assertBuildTarget(expectedTarget, rootDir = projectRoot)`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `BUILD_TARGETS` | 导出常量，第 8 行 | 提供 BUILD TARGETS 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
