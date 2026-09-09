# server / services / public / public-sitemap.ts

## 文件定位

- **源码路径**：`server/services/public/public-sitemap.ts`
- **功能定位**：站点地图查询编排与 XML 序列化；robots 正文生成。
- **规模**：63 行，4170 字节
- **内容校验**：SHA-256 `ed7b66f5b7b7a001b54e629910de9724a9d3142832b9aed59fa2b5a6315abb43`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `parseSitemapRequest(query)` | 空查询为索引；section=static 为固定入口；七种公开模块需要合法 page。重复、多余、未知参数和越界数字拒绝。 |
| `xml(value)` | 转义 XML 的 &、尖括号和引号，避免查询串或路径破坏 XML。 |
| `localizedEntries(origin, zh, en)` | 每个对象输出两条 loc，分别附带相同的三条语言链接；与 HTML 共用语言关系函数。 |
| `publicSitemap(adapter, origin, request, now?)` | 使用 PublicContentStore 查询；索引列固定页和实际非空分片；内容按 uid，新闻按 slug 生成地址；空分片为 404。 |
| `publicRobots(origin)` | 输出 API、health 抓取限制及已配置域名的 Sitemap 地址。HTML 保持可抓取，使引擎能读取账号与后台的 noindex。 |

## 配合关系与维护要求

没有新增运行时依赖、数据库表或数据库字段。完整规则见 `docs/19_站点地图与双语SEO验收.md`。
