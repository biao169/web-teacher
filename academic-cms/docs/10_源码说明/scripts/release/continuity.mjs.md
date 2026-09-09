# scripts / release / continuity.mjs

## 文件定位

- **源码路径**：`scripts/release/continuity.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：25 行，1683 字节
- **内容校验**：SHA-256 `37206688f34df51a9ecf5f3b3e6ba1ac757c19b9a2cf606d73d3a1392727be43`

## 直接依赖

- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/release/acceptance.mjs`
- `tests/release/build-safety.test.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `inspectContinuity` | 函数，第 5 行 | Do not infer an implementation from the presence of a design or report. | 由 `scripts/release/acceptance.mjs`、`tests/release/build-safety.test.mjs` 等模块导入使用。 |
| `exists` | 函数变量，第 6 行 | 封装 exists 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `inspectContinuity`：`export async function inspectContinuity(root)`
- `exists`：`exists = async path => access(resolve(root, path)).then(() => true, () => false)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
