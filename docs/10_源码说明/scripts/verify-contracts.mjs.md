# scripts / verify-contracts.mjs

## 文件定位

- **源码路径**：`scripts/verify-contracts.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：91 行，4146 字节
- **内容校验**：SHA-256 `42ba2fbd78097cabb126de5ba817a47e07e0cf4b19a0d5df6ab3864c7f940920`

## 直接依赖

- `./lib/run-command.mjs`
- `./lib/typescript-compiler.mjs`
- `node:child_process`
- `node:fs/promises`
- `node:module`
- `node:path`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `assert` | 函数，第 9 行 | 检查 assert 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 12 次。 |
| `now` | 对象函数，第 52 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `now` | 对象函数，第 61 行 | 封装 now 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `assert`：`function assert(condition, message)`
- `now`：`now: () => new Date('2026-08-29T00:00:00.000Z')`
- `now`：`now: () => new Date(Number.NaN)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
