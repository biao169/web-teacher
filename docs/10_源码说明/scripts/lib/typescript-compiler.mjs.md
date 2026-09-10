# scripts / lib / typescript-compiler.mjs

## 文件定位

- **源码路径**：`scripts/lib/typescript-compiler.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：28 行，1398 字节
- **内容校验**：SHA-256 `11364cbaaaf9e75862bbe3726fe384062d085ec2cf83321c05a67faf8fbe1ad1`

## 直接依赖

- `node:child_process`
- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/run-release-core.mjs`
- `scripts/run-security-tests.mjs`
- `scripts/run-stage26-tests.mjs`
- `scripts/run-stage27-tests.mjs`
- `scripts/run-stage3-tests.mjs`
- `scripts/run-stage4-tests.mjs`
- `scripts/run-stage5-tests.mjs`
- `scripts/run-stage6-tests.mjs`
- `scripts/verify-contracts.mjs`
- `scripts/verify-stage1.mjs`
- `scripts/verify-stage2.mjs`
- `scripts/verify-stage26.mjs`
- `scripts/verify-stage27.mjs`
- `scripts/verify-stage3.mjs`
- `scripts/verify-stage4.mjs`
- `scripts/verify-stage5.mjs`
- `scripts/verify-stage6.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `findCompiler` | 函数，第 6 行 | Prefer the pinned compiler; a global compiler is permitted only for offline core verification. | 由 `scripts/run-release-core.mjs`、`scripts/run-security-tests.mjs`、`scripts/run-stage26-tests.mjs` 等模块导入使用。 |
| `commonJsResolution` | 函数，第 24 行 | 封装 Js Resolution 相关逻辑，供本文件或上层模块按其参数调用 | 由 `scripts/run-release-core.mjs`、`scripts/run-security-tests.mjs`、`scripts/run-stage26-tests.mjs` 等模块导入使用。 |

### 调用签名

- `findCompiler`：`export async function findCompiler(root)`
- `commonJsResolution`：`export function commonJsResolution(version)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
