# scripts / verify-stage1.mjs

## 文件定位

- **源码路径**：`scripts/verify-stage1.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：69 行，5542 字节
- **内容校验**：SHA-256 `d7e5573841ee728deaded9d1e3ff02012bf30e7163c0933bbe66f764a1219e7f`

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
| `check` | 函数，第 14 行 | 检查 check 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `run` | 函数，第 18 行 | 执行 run 所代表的完整处理流程 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `files` | 函数，第 25 行 | 封装 files 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `number` | 函数变量，第 52 行 | 封装 number 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |

### 调用签名

- `check`：`function check(name, condition, detail)`
- `run`：`async function run(name, command, args, logName, timeout = 90_000)`
- `files`：`async function files(directory, suffix)`
- `number`：`number = label => Number(new RegExp(\`^# $`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
