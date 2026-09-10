# app/components/public/content/CopyPrepared.vue

## 文件定位

- **源码路径**：`app/components/public/content/CopyPrepared.vue`
- **功能定位**：共用无弹窗反馈组件，展示复制进度、短成功提示和行内重试；只有剪贴板写入失败时挂载只读手动复制文本，支持选中全部和原生局部选择，不再显示预览确认流程。
- **规模**：21 行，1778 字节
- **内容校验**：SHA-256 `059d1900258701cdfc1d4cefe261257128a7f163101b6ced9dfbafce92ed377d`

## 使用与维护

共用无弹窗反馈组件，展示复制进度、短成功提示和行内重试；只有剪贴板写入失败时挂载只读手动复制文本，支持选中全部和原生局部选择，不再显示预览确认流程。

命名函数：`selectText`。

## 直接依赖

- `vue`
- `~/composables/usePublicCopy`

本步说明见 `docs/39_前台改版_一键复制.md`。一键复制已在第7步实施；真实浏览器与系统剪贴板验收属于第8步。
