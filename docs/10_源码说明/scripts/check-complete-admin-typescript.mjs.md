# scripts / check-complete-admin-typescript.mjs

## 文件定位

- **源码路径**：`scripts/check-complete-admin-typescript.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：56 行，2223 字节
- **内容校验**：SHA-256 `19cab33330e911b969730be99aff4b8785b9a74ccca570fd0f60fb64135a02ff`

## 直接依赖

- `node:fs`
- `node:fs/promises`
- `node:path`
- `node:url`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `walk` | 函数，第 20 行 | 封装 walk 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `walk`：`async function walk(dir)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
