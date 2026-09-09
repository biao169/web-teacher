# scripts / test-news-runtime.mjs

## 文件定位

- **源码路径**：`scripts/test-news-runtime.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：171 行，13187 字节
- **内容校验**：SHA-256 `bbe34a552db1c0d442e3928df498d46168dbd5fb34d9dba41c101b4e4d35c2bf`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `absorbCookies` | 函数，第 14 行 | 封装 Cookies 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `csrfToken` | 函数，第 24 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `request` | 函数，第 25 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 26 次。 |
| `expectStatus` | 函数，第 39 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 24 次。 |
| `errorPayload` | 函数，第 40 行 | 封装 Payload 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 8 次。 |
| `detail` | 函数，第 41 行 | 封装 detail 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `create` | 函数，第 46 行 | 创建 create，并完成初始化或持久化处理 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `update` | 函数，第 51 行 | 更新 update，并保持状态、校验与持久化结果一致 | 仅在本文件内部使用，标识符共出现 6 次。 |

### 调用签名

- `absorbCookies`：`function absorbCookies(response)`
- `csrfToken`：`function csrfToken()`
- `request`：`async function request(path,`
- `expectStatus`：`function expectStatus(result, expected, label)`
- `errorPayload`：`function errorPayload(result)`
- `detail`：`async function detail(uid)`
- `create`：`async function create(values, label = 'create news')`
- `update`：`async function update(uid, values, label = 'update news')`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
