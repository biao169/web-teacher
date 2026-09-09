# tests/unit/public-infinite-list.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-infinite-list.spec.ts`
- **功能定位**：24项懒加载回归：各类型有界追加、排序/编号/版本/URL一致，筛选和语言切换取消旧响应；真实卡片追加后已选高亮与复选框一致。
- **规模**：116 行，11094 字节
- **内容校验**：SHA-256 `e9cf3649b99749e0d46ccc775e1fcc0232ea79b6f7f06054c8f7cbb2d92c9451`

## 使用与维护

24项懒加载回归：各类型有界追加、排序/编号/版本/URL一致，筛选和语言切换取消旧响应；真实卡片追加后已选高亮与复选框一致。

命名函数：`mount`、`start`。

## 直接依赖

- `vitest`
- `vue`
- `../../app/composables/usePublicInfiniteList`
- `../../app/composables/usePublicSelection`
- `../../app/components/public/content/ProjectsList.vue`
- `../../app/components/public/content/PublicationsList.vue`
- `../../app/components/public/content/LoadMore.vue`
- `../../app/components/public/content/PublicationRows.vue`
- `../../shared/utils/public-list-link`

本步说明见 `docs/37_前台改版_统一条目卡片与标签.md`。研究标签和一键复制继续按第6–7步实施；真实浏览器视觉验收属于第8步。
