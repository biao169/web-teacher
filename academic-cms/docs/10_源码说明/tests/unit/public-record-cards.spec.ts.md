# tests/unit/public-record-cards.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-record-cards.spec.ts`
- **功能定位**：共享卡片结构及顺序回归，论文标签在末行；新闻正文视口观察器用替身隔离网络请求。
- **规模**：141 行，11598 字节
- **内容校验**：SHA-256 `c73641c85f306fd9694e54b7ce60853bca7c7b873c76599dd45b633bd3129b3a`

## 使用与维护

共享卡片结构及顺序回归，论文标签在末行；新闻正文视口观察器用替身隔离网络请求。

命名函数：`mount`、`flush`、`fixture`。

## 直接依赖

- `vitest`
- `vue`
- `../../app/components/public/content/RecordRow.vue`
- `../../app/components/public/content/TeamList.vue`
- `../../app/components/public/content/StudentsList.vue`
- `../../app/components/public/content/CoursesList.vue`
- `../../app/components/public/content/PatentsList.vue`
- `../../app/components/public/content/ProjectsList.vue`
- `../../app/components/public/content/NewsList.vue`
- `../../app/components/public/content/PublicationsList.vue`
- `../../shared/utils/public-copy`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
