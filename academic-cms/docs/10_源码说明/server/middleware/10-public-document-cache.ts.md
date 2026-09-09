# server / middleware / 10-public-document-cache.ts

## 文件定位

- **源码路径**：`server/middleware/10-public-document-cache.ts`
- **功能定位**：防止带阅读偏好的中英文 SSR 文档被共享缓存串用。
- **规模**：11 行，595 字节
- **内容校验**：SHA-256 `d28599301b2787d6546691f08cdf8a613b09ee0964760a5a0ce3e6f3d8bcf448`

## 方法与用法

默认导出的 `defineEventHandler` 由 Nitro 自动执行，取 event.path 的查询前路径，仅匹配 /zh、/en 及其下级路由。为文档设置 Cache-Control: private, no-store, max-age=0，并大小写无关地合并 Vary: Cookie，保留其他 Vary 项。

该中间件不更改 /api/v1/public 的 JSON 缓存策略。SSR 文档读取 Cookie 后不能作为所有访客共享的 HTML；公开内容查询仍复用既有服务缓存。生产 HTTP 检查覆盖两种语言及四种 Cookie 状态。

## 维护说明

当前实现对应前台第 3/10 步；专项说明见 docs/23_前台公共模板_导航与三档字体验收.md。修改代码时同步方法说明和内容校验。
