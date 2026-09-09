# tests/unit/public-research-tags.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-research-tags.spec.ts`
- **功能定位**：首页独立名称卡片无选择复制，研究列表继续共用名称标签、稳定编号、分页和详情返回。
- **规模**：133 行，11445 字节
- **内容校验**：SHA-256 `1cc6622f2435d8ff0c93b853353e8b18d38d3671ca425f12c5dc3f2b895e0a9a`

## 使用与维护

首页独立名称卡片无选择复制，研究列表继续共用名称标签、稳定编号、分页和详情返回。

命名函数：`mount`、`flush`、`page`。

## 直接依赖

- `vitest`
- `vue`
- `../../app/components/public/content/ResearchList.vue`
- `../../app/components/public/content/ResearchTag.vue`
- `../../app/components/public/home/Research.vue`
- `../../shared/utils/public-list-link`
- `../../shared/utils/public-detail-link`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
