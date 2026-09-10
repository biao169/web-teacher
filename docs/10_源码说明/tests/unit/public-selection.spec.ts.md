# tests/unit/public-selection.spec.ts

## 文件定位

- **源码路径**：`tests/unit/public-selection.spec.ts`
- **功能定位**：25项选择与复制检查：跨页UID选择、200条上限、有界分批、直接批量复制的稳定次序和可选原编号、隐藏条目行内处理、清空/路径/版本/语言/选择改变取消与跨批失败不输出部分数据。
- **规模**：161 行，12992 字节
- **内容校验**：SHA-256 `778ed7f5eee4633527ace0a7b583d9f2805859c8d0e7d451ed52ac199b09f5ed`

## 使用与维护

25项选择与复制检查：跨页UID选择、200条上限、有界分批、直接批量复制的稳定次序和可选原编号、隐藏条目行内处理、清空/路径/版本/语言/选择改变取消与跨批失败不输出部分数据。

命名函数：`mount`。

## 直接依赖

- `vitest`
- `vue`
- `../../app/composables/usePublicSelection`
- `../../shared/contracts/public-selection`
- `../../app/components/public/content/RecordRow.vue`
- `../../app/components/public/content/SelectionToolbar.vue`

本步说明见 `docs/39_前台改版_一键复制.md`。一键复制已在第7步实施；真实浏览器与系统剪贴板验收属于第8步。
