# app/components/public/content/CopyRecordButton.vue

## 文件定位

- **源码路径**：`app/components/public/content/CopyRecordButton.vue`
- **功能定位**：单条点击即以当前模块、语言、UID和论文格式请求最新公开数据并写入剪贴板；复用父级反馈或详情行内反馈，禁用重复点击，上下文变化和卸载时取消。
- **规模**：24 行，2252 字节
- **内容校验**：SHA-256 `787d660f73b259726ee50494a4b6e709f1802e8e1d96770649b0ef66ef7e7362`

## 使用与维护

单条点击即以当前模块、语言、UID和论文格式请求最新公开数据并写入剪贴板；复用父级反馈或详情行内反馈，禁用重复点击，上下文变化和卸载时取消。

命名函数：`run`。

## 直接依赖

- `@lucide/vue`
- `vue`
- `~~/shared/contracts/public-selection`
- `~~/shared/contracts/public-site`
- `~/composables/usePublicCitationStyle`
- `~/composables/usePublicCopy`
- `~/composables/usePublicSelection`
- `./CopyPrepared.vue`

本步说明见 `docs/39_前台改版_一键复制.md`。一键复制已在第7步实施；真实浏览器与系统剪贴板验收属于第8步。
