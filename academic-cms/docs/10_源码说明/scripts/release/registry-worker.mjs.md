# scripts / release / registry-worker.mjs

## 文件定位

- **源码路径**：`scripts/release/registry-worker.mjs`
- **文件类型**：脚本
- **功能定位**：发布与验收脚本；检查当前源码、构建产物、运行环境或生产回归结果。
- **规模**：26 行，1463 字节
- **内容校验**：SHA-256 `73967f4d2d0c6156b57ae23c2905f70185eea6bae2cd11cd6333d391c76fd13f`

## 直接依赖

- `../lib/run-command.mjs`
- `./environment.mjs`
- `node:fs/promises`
- `node:path`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `worker` | 函数，第 8 行 | 封装 worker 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |

### 调用签名

- `worker`：`async function worker()`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
