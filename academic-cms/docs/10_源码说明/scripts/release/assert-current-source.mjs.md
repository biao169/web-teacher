# scripts / release / assert-current-source.mjs

## 文件定位

- **源码路径**：`scripts/release/assert-current-source.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：9 行，462 字节
- **内容校验**：SHA-256 `b7091eee1097ebaf4419bd374b9cee5b05879c0b3a6faab878a6446e390d09fd`

## 直接依赖

- `./inputs.mjs`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/release/admin-production-regression.mjs`
- `scripts/release/production-browser.mjs`
- `scripts/run-built-target.mjs`
- `tests/release/build-safety.test.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `assertCurrentBuildSource` | 函数，第 4 行 | 检查 Current Build Source 是否满足业务、安全或类型约束 | 由 `scripts/release/admin-production-regression.mjs`、`scripts/release/production-browser.mjs`、`scripts/run-built-target.mjs` 等模块导入使用。 |

### 调用签名

- `assertCurrentBuildSource`：`export async function assertCurrentBuildSource(root)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
