# scripts / verify-stage0.mjs

## 文件定位

- **源码路径**：`scripts/verify-stage0.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：403 行，22866 字节
- **内容校验**：SHA-256 `ba93aa36add0e702b4dfa6bdc5ed74ba53de5547708b976fa4b1220203151c4b`

## 直接依赖

- `./lib/run-command.mjs`
- `node:child_process`
- `node:crypto`
- `node:fs`
- `node:fs/promises`
- `node:path`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `check` | 函数 | 检查 check 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 120 次。 |
| `exists` | 函数 | 封装 exists 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `text` | 函数 | 封装 text 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 30 次。 |
| `sha256` | 函数 | 封装 sha256 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `isPinnedVersion` | 函数 | 检查 Pinned Version 是否满足业务、安全或类型约束 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `balancedBraces` | 函数 | 封装 Braces 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `check`：`function check(condition, message)`
- `exists`：`async function exists(path)`
- `text`：`async function text(path)`
- `sha256`：`async function sha256(path)`
- `isPinnedVersion`：`function isPinnedVersion(version)`
- `balancedBraces`：`function balancedBraces(source)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。

## 第 4/7 步：默认语言

固定 /zh 静态断言更新为动态入口检查；语言切换断言跟随共享 fullPath 方法；旧设计文档引用改为现有 06 文档，只核验用户指定保留的 01–04，不再要求已删除的旧 10/11 文档。
