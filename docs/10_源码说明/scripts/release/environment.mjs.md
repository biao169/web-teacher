# scripts / release / environment.mjs

## 文件定位

- **源码路径**：`scripts/release/environment.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：34 行，2570 字节
- **内容校验**：SHA-256 `9b71ee0dec2f3801fe0984716f00c96ed7c563352fefa62af054b0cd582939d1`

## 直接依赖

- `node:child_process`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/build-target.mjs`
- `scripts/release/acceptance.mjs`
- `scripts/release/inspect.mjs`
- `scripts/release/registry-worker.mjs`
- `scripts/release/verify-registry.mjs`
- `tests/release/build-safety.test.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `exactDependency` | 函数，第 5 行 | 封装 Dependency 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/build-target.mjs`、`scripts/release/acceptance.mjs`、`scripts/release/inspect.mjs` 等模块导入使用。 |
| `inspectEnvironment` | 函数，第 13 行 | 封装 Environment 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/build-target.mjs`、`scripts/release/acceptance.mjs`、`scripts/release/inspect.mjs` 等模块导入使用。 |

### 调用签名

- `exactDependency`：`export function exactDependency(name, specifier)`
- `inspectEnvironment`：`export async function inspectEnvironment(root, options =`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
