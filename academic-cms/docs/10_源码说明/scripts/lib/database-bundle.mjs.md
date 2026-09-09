# scripts / lib / database-bundle.mjs

## 文件定位

- **源码路径**：`scripts/lib/database-bundle.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：21 行，1050 字节
- **内容校验**：SHA-256 `5529263c894f470aa5f24d278c2805d0d75e42c3bbfe117455335791a8883cdf`

## 直接依赖

- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/build-target.mjs`
- `tests/database/bundle.spec.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `assertWorkerDatabaseIsolation` | 函数，第 5 行 | Fails before a Cloudflare output receives a valid deployment build marker. | 由 `scripts/build-target.mjs`、`tests/database/bundle.spec.mjs` 等模块导入使用。 |
| `scan` | 内部函数，第 7 行 | 收集 scan 对应的数据集合，并应用必要的范围或过滤规则 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `assertWorkerDatabaseIsolation`：`export async function assertWorkerDatabaseIsolation(root)`
- `scan`：`async function scan(directory)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
