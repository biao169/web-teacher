# shared / utils / public-seo.ts

## 文件定位

- **源码路径**：`shared/utils/public-seo.ts`
- **功能定位**：前后端共用的可信域名、canonical、hreflang、媒体绝对地址及索引策略。
- **规模**：53 行，2389 字节
- **内容校验**：SHA-256 `c9a914227fbfbca3e86000eb43cddf52a2d54770bec8ce43f8ba957837f779ee`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `configuredPublicOrigin(value)` | 仅接受无账号、路径、查询、片段的 HTTPS 域名；本地开发可用回环 HTTP。返回规范 origin 或 null，长度最多 512 字符。 |
| `publicAbsoluteUrl(origin, path)` | 保留 HTTPS 媒体 URL，或将站内路径拼为绝对地址；无域名时不输出相对 SEO 地址；拒绝双斜线和反斜线转义。 |
| `publicLanguageAlternates(path, alternatePath)` | 生成相互一致的 zh-CN、en、x-default 地址集合；首页默认入口为 /，内页为对应英文页。 |
| `publicSeoLinks(origin, path, alternatePath)` | 为两类 SEO composable 构建一条 canonical 和三条语言标记；域名未设置时返回空数组。 |
| `publicPageRobots(path)` | 识别共用列表目录与 f 筛选封包；普通分页可索引，临时筛选、搜索、自定义页容量为 noindex,follow。 |

## 配合关系与维护要求

没有新增运行时依赖、数据库表或数据库字段。完整规则见 `docs/19_站点地图与双语SEO验收.md`。
