# scripts / release / verify-registry.mjs

## 文件定位

- **源码路径**：`scripts/release/verify-registry.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：38 行，2699 字节
- **内容校验**：SHA-256 `33130d5e1be7310c4e0d3ba5a2de10a8567d0fd2f8cf5809a58e297d9ca061f4`

## 直接依赖

- `../lib/run-command.mjs`
- `./environment.mjs`
- `./process.mjs`
- `node:fs/promises`
- `node:path`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `diagnostic` | 函数变量，第 26 行 | 封装 diagnostic 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `diagnostic`：`diagnostic = result => result ?`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
