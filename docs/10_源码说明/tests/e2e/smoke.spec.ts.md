# tests / e2e / smoke.spec.ts

## 文件定位

- **源码路径**：`tests/e2e/smoke.spec.ts`
- **文件类型**：测试
- **功能定位**：自动化测试文件；验证对应模块的契约、边界条件与回归行为。
- **规模**：79 行，3683 字节
- **内容校验**：SHA-256 `34adfce465c369379edeb59a93d793ceb64a41bb74f024761701ac40ca929012`

## 直接依赖

- `@playwright/test`

## 方法与函数

该文件没有独立的命名函数或类方法；其行为由声明式配置、模板、SQL、样式规则或框架默认入口构成。

## 测试场景

- 第 3 行：`test` — health endpoint is uncacheable and correlates request IDs
- 第 19 行：`test` — non-Cloudflare runtime does not trust a spoofed CF Ray header
- 第 32 行：`test` — root redirects temporarily without caching the language decision
- 第 42 行：`test` — Chinese public route is rendered with the public layout
- 第 54 行：`test` — English public route exposes matching locale and labels
- 第 61 行：`test` — admin route is private, client-rendered, and anonymous access enters the login flow

## 维护注意事项

- 修改受测功能时同步更新本文件；测试名称应明确描述行为和边界，而不是实现细节。

## 第 4/7 步：默认语言

根入口用已知偏好验证 302；新增点击 English/中文后检查 Cookie、再次访问根入口仍保持选择的浏览器场景。本轮仅记录实际执行的检查，不把未运行的浏览器脚本算作已通过。
