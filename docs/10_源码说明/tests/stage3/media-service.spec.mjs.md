# tests / stage3 / media-service.spec.mjs

## 文件定位

- **源码路径**：`tests/stage3/media-service.spec.mjs`
- **文件类型**：测试模块
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：204 行，10001 字节
- **内容校验**：SHA-256 `5e8196a224151bc4ea97519ca0d7f9841be9e747469a45803c04186428d1d66f`

## 直接依赖

- `node:assert/strict`
- `node:crypto`
- `node:test`
- `../helpers/offline-stage3.mjs`

## 方法、函数与派生状态

| 名称 | 位置 | 用途与用法 |
| --- | --- | --- |
| `stream` | 函数，第 15 行 | 封装 stream 相关逻辑，供本文件或上层模块按其参数调用 |
| `start` | 方法，第 17 行 | 开始新的读取版本，返回 isCurrent 谓词；必须在 await 后检查再写入状态。 |
| `bodyBytes` | 函数，第 20 行 | 封装 Bytes 相关逻辑，供本文件或上层模块按其参数调用 |
| `constructor` | 构造方法，第 39 行 | 封装 constructor 相关逻辑，供本文件或上层模块按其参数调用 |
| `metadata` | 方法，第 40 行 | 整理 metadata 的元数据，供展示或后续处理使用 |
| `head` | 方法，第 46 行 | 封装 head 相关逻辑，供本文件或上层模块按其参数调用 |
| `read` | 方法，第 47 行 | 读取或定位 read，向调用方返回匹配结果 |
| `put` | 方法，第 55 行 | 封装 put 相关逻辑，供本文件或上层模块按其参数调用 |
| `delete` | 方法，第 56 行 | 移除或失效 delete，同时处理相关联状态 |
| `publicRequest` | 函数，第 59 行 | 封装 Request 相关逻辑，供本文件或上层模块按其参数调用 |
| `principal` | 函数，第 67 行 | 封装 principal 相关逻辑，供本文件或上层模块按其参数调用 |
| `seed` | 函数，第 77 行 | 创建 seed，并完成初始化或持久化处理 |
| `metadata` | 方法，第 190 行 | 整理 metadata 的元数据，供展示或后续处理使用 |

### 调用签名

- `stream`：`function stream(value)`
- `start`：`start(controller)`
- `bodyBytes`：`async function bodyBytes(body)`
- `constructor`：`constructor(value = bytes)`
- `metadata`：`metadata()`
- `head`：`async head(key)`
- `read`：`async read(key, options = {})`
- `put`：`async put()`
- `delete`：`async delete()`
- `publicRequest`：`function publicRequest(overrides = {})`
- `principal`：`function principal(uid = 'user:1')`
- `seed`：`function seed(h, pdfDownload = false)`
- `metadata`：`metadata()`

## 验证内容

- private media grant is bound to the authenticated user
- local delivery never advertises an unverified catalog checksum as a strong ETag

运行：`node --test tests/stage3/media-service.spec.mjs`。

## 维护说明

当前行为与验收限制见 [21_全站回归与最终交付验收.md](../../../21_%E5%85%A8%E7%AB%99%E5%9B%9E%E5%BD%92%E4%B8%8E%E6%9C%80%E7%BB%88%E4%BA%A4%E4%BB%98%E9%AA%8C%E6%94%B6.md)。修改源码后同步本说明的函数与校验信息；01–04 需求基线不在修改范围内。
