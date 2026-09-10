# app/components/public/content/FilterPanel.vue

## 文件定位

- **源码路径**：`app/components/public/content/FilterPanel.vue`
- **功能定位**：可换行的单行搜索筛选工具栏；隐藏导航固定条件，重置只清除访客追加条件，保留导航范围与页大小。
- **规模**：65 行，3764 字节
- **内容校验**：SHA-256 `1b42636df82ee428541ce55ad736414e163028ea446f9b90f0199c84b55b53a9`

## 使用与维护

可换行的单行搜索筛选工具栏；隐藏导航固定条件，重置只清除访客追加条件，保留导航范围与页大小。

命名函数：`toggleFilter`、`target`、`submit`、`changePageSize`。

## 直接依赖

- `@lucide/vue`
- `~~/shared/contracts/public-content`
- `~~/shared/utils/public-list-link`

本轮实现、升级与验证范围见 `docs/41_前台第二轮优化与交付.md`；浏览器实机未验证，工程检查与实机证据分开记录。
