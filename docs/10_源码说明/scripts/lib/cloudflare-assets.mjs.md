# scripts / lib / cloudflare-assets.mjs

## 文件定位

- **源码路径**：`scripts/lib/cloudflare-assets.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：15 行，357 字节
- **内容校验**：SHA-256 `680f952969e2f13ce8c0ede53dbbf6c780b3cbbb291229a2de979a81933e8d22`

## 直接依赖

- `node:fs/promises`
- `node:path`

## 直接调用方

- `scripts/build-target.mjs`
- `tests/node/build-output.test.mjs`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `writeCloudflareStaticHeaders` | 函数，第 8 行 | 更新 Cloudflare Static Headers，并保持状态、校验与持久化结果一致 | 由 `scripts/build-target.mjs`、`tests/node/build-output.test.mjs` 等模块导入使用。 |

### 调用签名

- `writeCloudflareStaticHeaders`：`export async function writeCloudflareStaticHeaders(publicDir)`

## 类型、类与导出数据

| 名称 | 类型/位置 | 用途 |
| --- | --- | --- |
| `CLOUDFLARE_STATIC_HEADERS` | 导出常量，第 4 行 | 提供 CLOUDFLARE STATIC HEADERS 的共享配置或不可变数据 |

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
