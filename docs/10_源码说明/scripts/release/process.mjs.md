# scripts / release / process.mjs

## 文件定位

- **源码路径**：`scripts/release/process.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：50 行，2499 字节
- **内容校验**：SHA-256 `8619d73b339aabd99d8967151272c775c84065cbe024d7bb35db26ffe1da3d83`

## 直接依赖

- `node:child_process`

## 直接调用方

- `scripts/build-target.mjs`
- `scripts/release/acceptance.mjs`
- `scripts/release/admin-production-regression.mjs`
- `scripts/release/production-browser.mjs`
- `scripts/release/verify-registry.mjs`
- `tests/release/process.test.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `runProcess` | 函数，第 4 行 | Execute only argv vectors. Reap this task's process group on timeout. | 由 `scripts/build-target.mjs`、`scripts/release/acceptance.mjs`、`scripts/release/admin-production-regression.mjs` 等模块导入使用。 |
| `kill` | 函数变量，第 19 行 | 封装 kill 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `terminate` | 函数变量，第 23 行 | 封装 terminate 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `append` | 内部函数，第 28 行 | 创建 append，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `finish` | 内部函数，第 34 行 | 封装 finish 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `runProcess`：`export function runProcess(command, args, options =`
- `kill`：`kill = signal =>`
- `terminate`：`terminate = why =>`
- `append`：`function append(chunk)`
- `finish`：`function finish(code, signal, errorCode = null)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
