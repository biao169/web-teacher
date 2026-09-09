# tests / production / workflows.spec.ts

## 文件定位

- **源码路径**：`tests/production/workflows.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：605 行，39262 字节
- **内容校验**：SHA-256 `ab5ba6653e0a61a88607b3f4bca9dc8576d7c01d3d21e24786fde665a291464c`

## 直接依赖

- `@playwright/test`
- `better-sqlite3`
- `node:crypto`
- `node:fs`
- `node:path`
- `node:zlib`

## 方法与函数

| 名称 | 类型/位置 | 用途 | 用法 |
| --- | --- | --- | --- |
| `one` | 函数 | 响应 one 相关事件，协调后续业务流程 | 仅在本文件内部使用，标识符共出现 7 次。 |
| `unique` | 函数变量 | 封装 unique 相关逻辑，供本文件或上层模块按其参数调用 | 仅在本文件内部使用，标识符共出现 5 次。 |
| `signIn` | 函数 | 完成 In 的安全计算或凭据处理 | 仅在本文件内部使用，标识符共出现 11 次。 |

### 调用签名

- `one`：`function one(sql: string, parameters: string[] = []): Record<string, unknown>`
- `unique`：`unique = () => randomBytes(6).toString('hex')`
- `signIn`：`async function signIn(page: Page, username = 'demo_admin', secret = password!): Promise<void>`

## 测试场景

- 第 42 行：`test` — homepage comes from real SSR data, reuses its payload, and displays real media
- 第 73 行：`test` — real secure cookies survive SSR navigation and permit CSRF-protected logout
- 第 94 行：`test` — administration shell requires authentication and loads a permission-aware bounded dashboard
- 第 115 行：`test` — administration breadcrumbs link every ancestor and identify specialist child pages
- 第 132 行：`test` — boolean quick fields use colored buttons while multi-value fields retain colored selects
- 第 156 行：`test` — every administration overview renders and the unified list contract supports real filters and quick edits
- 第 231 行：`test` — every administration editor contract opens against seeded production data
- 第 285 行：`test` — translation scan posts with CSRF and manual revisions save through the canonical deep link
- 第 335 行：`test` — registration form persists a low-privilege account and the real login works
- 第 363 行：`test` — contact form persists original text while the honeypot does not create a row
- 第 381 行：`test` — API enforces CSRF after login and anonymous responses never contain a private identity
- 第 396 行：`test` — password form updates the current account and revokes its other browser session

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。

## 本轮回归说明

2026-09-06：改用共享控件路径或增加统一标题结构/几何断言。浏览器工作流类型检查通过，实际浏览器运行仍待完成。
