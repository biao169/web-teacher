# server / routes / sitemap.xml.ts

## 文件定位

- **源码路径**：`server/routes/sitemap.xml.ts`
- **功能定位**：GET/HEAD /sitemap.xml 的动态 HTTP 入口。
- **规模**：19 行，1058 字节
- **内容校验**：SHA-256 `ab4ce46ba8b94926351cf0f858d707ac5bf4c780b2b1c32c667cc3f8b846886d`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `默认事件处理函数` | 校验方法及 NUXT_PUBLIC_SITE_URL，解析查询，再调用 publicSitemap；返回 UTF-8 XML 和 no-store。未配置域名返回 503；异常复用 publicHttpFailure。 |

## 配合关系与维护要求

没有新增运行时依赖、数据库表或数据库字段。完整规则见 `docs/19_站点地图与双语SEO验收.md`。
