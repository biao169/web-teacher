# tests / security / http-static.spec.mjs

## 文件定位

- **源码路径**：`tests/security/http-static.spec.mjs`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：107 行，5574 字节
- **内容校验**：SHA-256 `4127bfc41e3a0eb4592c646a3f8be81a5580c2adcd38bf3c46a6ba011da77488`

## 直接依赖

- `../helpers/offline-security.mjs`
- `node:assert/strict`
- `node:fs`
- `node:path`
- `node:test`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `read` | 函数变量，第 7 行 | 读取或定位 read，向调用方返回匹配结果 | 仅在本文件内部使用，标识符共出现 21 次。 |

### 调用签名

- `read`：`read = path => readFileSync(resolve(root, path), 'utf8')`

## 测试场景

- 第 9 行：`test` — cookie-authenticated write protection wires both CSRF channels and the session-bound token service
- 第 18 行：`test` — admin write and read wrappers keep browser write protection separate from database-backed permission checks
- 第 34 行：`test` — bounded body integration rejects compressed request bodies and session GET avoids unconditional cookie writes
- 第 43 行：`test` — bootstrap API returns only safe account fields and never returns credentials or session material
- 第 53 行：`test` — runtime secrets remain private and security dependencies are exact pinned versions
- 第 66 行：`test` — shared auth schemas use code-point and UTF-8 bounds rather than UTF-16 max length
- 第 74 行：`test` — server-side permission guard resolves an active session and checks explicit module action
- 第 82 行：`test` — HTTP authentication helpers use explicit protection modes and bounded CSRF cookie refresh
- 第 100 行：`test` — session audit atomicity does not depend on connection-local changes state

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。
