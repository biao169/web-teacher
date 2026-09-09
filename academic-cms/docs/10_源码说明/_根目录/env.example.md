# .env.example

## 文件定位

- **源码路径**：`.env.example`
- **文件类型**：工程文件
- **功能定位**：项目支持文件；为工程运行、依赖锁定或开发工具提供配置。
- **规模**：74 行，2913 字节
- **内容校验**：SHA-256 `9226abb23655ac7fdc4a23b563c5543d9c84591023cb5b02e186f6bacc75ae87`

## 维护注意事项

- 修改本文件前先检查直接调用方和共享契约，避免只修单一路径而破坏另一运行时。

## 第 4/7 步：默认语言

新增 5 个语言环境变量示例，并说明复用 NUXT_AUTH_TRUSTED_PROXY_HOPS。只关闭外部查询时，Cloudflare 的可信地区信息仍可使用。

## 第 5/7 步域名配置

`NUXT_PUBLIC_SITE_URL=https://实际站点域名` 是 canonical、hreflang、Open Graph、robots 和 sitemap 的唯一域名来源；生产必须为 HTTPS origin，不能带路径、查询或账号。未填写时公开页面仍可用，但不发出不完整的绝对 SEO 链接；sitemap 返回 503，robots 不声明 Sitemap。生产启动需将变量传入 Node 进程或 Worker 环境，不能只编辑一个未被加载的文件。
