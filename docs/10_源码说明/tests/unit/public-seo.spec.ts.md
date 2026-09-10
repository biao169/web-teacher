# tests / unit / public-seo.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-seo.spec.ts`
- **功能定位**：30 项 SEO 地址、索引策略与站点地图输入边界的行为测试。
- **规模**：56 行，3967 字节
- **内容校验**：SHA-256 `6d3992d4eca6be3cc0d4564cd6d15c6f8120873e98650bc9f1edae29143001e6`

## 方法与函数

| 名称 | 用途与用法 |
| --- | --- |
| `shared public SEO policy` | 检查可信域名、非法配置、双语往返、首页与内页默认地址、媒体绝对 URL、筛选和分页 canonical。 |
| `sitemap input boundaries` | 检查合法索引/固定页/模块分片，以及重复参数、非法模块、非法或超大页码。 |

## 配合关系与维护要求

没有新增运行时依赖、数据库表或数据库字段。完整规则见 `docs/19_站点地图与双语SEO验收.md`。
