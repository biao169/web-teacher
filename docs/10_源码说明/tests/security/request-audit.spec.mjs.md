# tests / security / request-audit.spec.mjs

## 文件定位

- **源码路径**：`tests/security/request-audit.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：89 行，4684 字节
- **内容校验**：SHA-256 `df73ec00e42640df0bd865343de10f545a040800a59db8743c6f06f233837ffc`

## 直接依赖

- `../helpers/offline-security.mjs`
- `node:assert/strict`
- `node:crypto`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `request` | 函数，第 9 行 | 封装 request 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `get` | 对象方法，第 71 行 | 读取或定位 get，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 3 次。 |

### 调用签名

- `request`：`async function request(overrides =`
- `get`：`get()`

## 测试场景

- 第 32 行：`test` — unsafe cookie-authenticated JSON requests require exact origin, fetch metadata and bound CSRF
- 第 48 行：`test` — safe methods do not require CSRF and non-cookie bootstrap still requires same origin JSON
- 第 57 行：`test` — client network selection trusts only platform-owned or explicitly configured proxy hops
- 第 64 行：`test` — audit sanitizer does not invoke getters and redacts credentials recursively
- 第 81 行：`test` — audit command keeps values bound and rejects condition statement injection

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
