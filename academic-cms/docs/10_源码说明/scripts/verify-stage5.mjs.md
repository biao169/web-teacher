# scripts / verify-stage5.mjs

## 文件定位

- **源码路径**：`scripts/verify-stage5.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：184 行，14596 字节
- **内容校验**：SHA-256 `759d769d7bbadd3c12f6426e0832d6c4bef1d904cc5f4bf72a3b92a19544ce22`

## 直接依赖

- `./db/migrations.mjs`
- `./lib/typescript-compiler.mjs`
- `node:child_process`
- `node:crypto`
- `node:fs/promises`
- `node:path`
- `node:url`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `check` | 函数，第 23 行 | 检查 check 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 27 次。 |
| `run` | 函数，第 28 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 18 次。 |
| `sha256` | 函数，第 45 行 | 封装 sha256 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `tapNumber` | 函数，第 46 行 | 封装 Number 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `parseTap` | 函数，第 47 行 | 解析 Tap 的输入格式，并输出受约束的数据结构 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `completeTap` | 函数，第 50 行 | 封装 Tap 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `walk` | 函数，第 51 行 | 封装 walk 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 9 次。 |
| `markdown` | 函数，第 61 行 | 封装 markdown 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `check`：`function check(name, condition, detail)`
- `run`：`async function run(name, command, args, logName, timeout = 180_000)`
- `sha256`：`function sha256(data)`
- `tapNumber`：`function tapNumber(tap, label)`
- `parseTap`：`function parseTap(tap)`
- `completeTap`：`function completeTap(result)`
- `walk`：`async function walk(directory, suffixes)`
- `markdown`：`function markdown(result)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
