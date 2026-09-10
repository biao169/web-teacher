# scripts / verify-stage3-release.mjs

## 文件定位

- **源码路径**：`scripts/verify-stage3-release.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：77 行，3252 字节
- **内容校验**：SHA-256 `2c949d43f7202807246057ddbf05320524641ddb58a41ffbb351d919e9e7d8c4`

## 直接依赖

- `node:child_process`
- `node:fs/promises`
- `node:path`
- `node:url`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `exists` | 函数变量，第 19 行 | 封装 exists 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `exists`：`exists = path => access(path).then(() => true, () => false)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
