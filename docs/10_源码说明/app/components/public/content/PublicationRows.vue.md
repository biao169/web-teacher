# app/components/public/content/PublicationRows.vue

## 文件定位

- **源码路径**：`app/components/public/content/PublicationRows.vue`
- **功能定位**：论文共用引文卡片，将论文类型与收录标签移到DOI/来源等链接的末行，保持文档读取顺序。
- **规模**：52 行，4784 字节
- **内容校验**：SHA-256 `d97a7ad8f979a332902ef6c1c3c3b017ca74a443905acb07513867b548365e11`

## 使用与维护

论文共用引文卡片，将论文类型与收录标签移到DOI/来源等链接的末行，保持文档读取顺序。

命名函数：`cancel`、`read`、`retry`。

## 直接依赖

- `vue`
- `~~/shared/contracts/public-content`
- `~~/shared/contracts/public-citation`
- `~~/shared/contracts/public-selection`
- `~~/shared/utils/public-categories`
- `~~/shared/utils/public-citation`
- `~/composables/usePublicCitationStyle`
- `./CitationText.vue`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
