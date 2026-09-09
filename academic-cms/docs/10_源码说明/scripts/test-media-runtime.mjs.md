# scripts / test-media-runtime.mjs

## 文件定位

- **源码路径**：`scripts/test-media-runtime.mjs`
- **文件类型**：脚本
- **功能定位**：项目自动化脚本；执行构建、验证、运行或专项回归任务。
- **规模**：271 行，20683 字节
- **内容校验**：SHA-256 `9e370dbbb02aa85e1941b2c388ee9830521d1bed648e0be1f0d3218752079924`

## 直接依赖

- `better-sqlite3`
- `node:fs/promises`
- `node:path`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `absorbCookies` | 函数，第 23 行 | 封装 Cookies 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `cookieHeader` | 函数，第 33 行 | 封装 Header 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `csrfToken` | 函数，第 34 行 | 封装 Token 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 3 次。 |
| `request` | 函数，第 36 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 41 次。 |
| `requestBytes` | 函数，第 54 行 | 封装 Bytes 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 6 次。 |
| `expectStatus` | 函数，第 62 行 | 封装 Status 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 45 次。 |
| `errorPayload` | 函数，第 68 行 | 封装 Payload 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 2 次。 |
| `mediaDetail` | 函数，第 69 行 | 封装 Detail 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 12 次。 |
| `upload` | 函数，第 74 行 | 封装 upload 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 16 次。 |
| `localObjectPath` | 函数，第 79 行 | 封装 Object Path 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |

### 调用签名

- `absorbCookies`：`function absorbCookies(response)`
- `cookieHeader`：`function cookieHeader()`
- `csrfToken`：`function csrfToken()`
- `request`：`async function request(path,`
- `requestBytes`：`async function requestBytes(url,`
- `expectStatus`：`function expectStatus(result, expected, label)`
- `errorPayload`：`function errorPayload(result)`
- `mediaDetail`：`async function mediaDetail(uid)`
- `upload`：`async function upload(name, title, mime, bytes)`
- `localObjectPath`：`function localObjectPath(objectKey)`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。
