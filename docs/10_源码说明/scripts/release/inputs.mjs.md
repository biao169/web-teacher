# scripts / release / inputs.mjs

## 文件定位

- **源码路径**：`scripts/release/inputs.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：34 行，1970 字节
- **内容校验**：SHA-256 `35090f8fee5fea2530fe3d64e25878be3f07be9a034c15ffb7b4d2809cb5874d`

## 直接依赖

- `node:crypto`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/build-target.mjs`
- `scripts/release/acceptance.mjs`
- `scripts/release/assert-current-source.mjs`
- `scripts/release/inspect.mjs`
- `tests/release/build-safety.test.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `sourceIdentity` | 函数，第 9 行 | Hash actual build inputs, not old test reports. Symlinks in source are refused. | 由 `scripts/build-target.mjs`、`scripts/release/acceptance.mjs`、`scripts/release/assert-current-source.mjs` 等模块导入使用。 |
| `visit` | 内部函数，第 11 行 | 封装 visit 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `sourceIdentity`：`export async function sourceIdentity(root)`
- `visit`：`async function visit(path)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
